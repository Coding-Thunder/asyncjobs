# Getting Started with AsyncOps

A runnable, copy-pasteable tutorial. Budget: 10–15 minutes from zero to a working job that you can watch execute, fail, and retry.

**Prerequisites**
- Node.js 18 or later (`node --version`)
- An AsyncOps account and a reachable API URL (if you're self-hosting, see [deployment.md](deployment.md) first — come back here once `GET /health` returns `{ "ok": true }`)

**What you'll build**
- A worker process that handles two job types: `send-email` (succeeds) and `flaky` (fails on purpose)
- A script that submits one of each job
- You'll observe both in the dashboard, watch the retry loop, then fix the flaky one manually

**Mental model (read this once, then we'll code)**

```
your app  ──POST /jobs──▶  AsyncOps API  ──▶  MongoDB (durable state)
                                 │                        │
                                 └──────── BullMQ queue ──┘
                                          (retry + backoff)
                                                 │
your worker ◀──GET /jobs/next── AsyncOps API ◀───┘
    │
    ├─ runs your handler in YOUR process
    └─ POST /jobs/:id/complete  or  POST /jobs/:id/fail
```

AsyncOps is the **control plane**. Your handler code **never** runs on AsyncOps servers. If nothing else on this page sticks, remember that: if your worker isn't running, your jobs stay `pending` forever.

---

## Step 0 — Install

```bash
mkdir asyncops-tutorial && cd asyncops-tutorial
npm init -y
npm install asyncops-sdk
```

**What just happened.** You installed the Node.js SDK. That's the only dependency. Everything in this tutorial is plain `node` — no build step, no TypeScript, no framework.

**Common failure**
- `npm ERR! code EBADENGINE` → you're on Node < 18. Upgrade Node.

---

## Step 1 — Create an API key

1. Open the dashboard (wherever it's deployed — e.g. `https://app.asyncops.com` or `http://localhost:3000` if you're running it locally).
2. Sign up or log in.
3. Go to **API Keys** → **Create key** → give it a name like `tutorial`.
4. **Copy the key now.** It looks like `ak_live_…`. The dashboard shows it **once**; there is no way to recover it after you leave the page. If you lose it, delete the key and make a new one.

Export it so the rest of the tutorial works:

```bash
export ASYNCOPS_API_KEY="ak_live_...paste..."
export ASYNCOPS_URL="https://api.asyncops.com"   # or http://localhost:4000 for local
```

**What's happening internally.** The server generates 32 random bytes, stores a bcrypt hash plus an 8-character prefix, and returns the raw key exactly once. On every request the API runs `requireAuth`: if the token starts with `ak_live_`, it looks up all keys with a matching prefix and `bcrypt.compare`s them. The prefix is why revocation is instant — `DELETE /api-keys/:id` removes the row, and the next request fails with `401`.

**Common failures**
- `401 invalid API key` → wrong key, deleted key, or copy-paste lost a character.
- `401 missing or invalid Authorization header` → you set the env var but forgot to use it in the process (`ASYNCOPS_API_KEY=... node worker.js`).

---

## Step 2 — Create a worker

Make two files: `worker.js` (runs handlers) and `submit.js` (creates jobs). Start with the worker.

```js
// worker.js
const { init, createWorker } = require('asyncops-sdk');

init({
  apiKey: process.env.ASYNCOPS_API_KEY,
  baseUrl: process.env.ASYNCOPS_URL,
});

const worker = createWorker({
  handlers: {
    // A handler that always succeeds.
    'send-email': async (job, ctx) => {
      await ctx.log(`pretending to send mail to ${job.data.to}`);
      // simulate some I/O
      await new Promise((r) => setTimeout(r, 500));
      return { messageId: `m_${Date.now()}` };
    },

    // A handler that always fails so we can watch the retry loop.
    'flaky': async (job, ctx) => {
      await ctx.log(`attempt ${job.attempts} — about to throw`);
      throw new Error('intentional failure for the tutorial');
    },
  },

  // Optional but useful during the tutorial: print every SDK-level error.
  onError: (err, ctx) => {
    console.error('[worker]', ctx.stage, ctx.jobId || '', err.message);
  },
});

worker.start();

// Clean shutdown — important for long-running deployments.
process.on('SIGTERM', async () => {
  await worker.stop();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await worker.stop();
  process.exit(0);
});
```

**What this actually is.** `createWorker` returns a handle around a polling loop. The loop:

1. Calls `GET /jobs/next?types=send-email,flaky`. The API does an atomic `findOneAndUpdate` on the `jobs` collection, matching `(userId, status: "pending", type ∈ {...})`, and flips the match to `status: "processing"`.
2. If the response is `{ job: null }`, it sleeps for `idlePollInterval` (default 2 s) and loops.
3. If a job came back, it looks up `handlers[job.type]`, runs it with `(job, ctx)` inside the same Node process, and awaits the result.
4. On success → `POST /jobs/:id/complete`. On thrown error → `POST /jobs/:id/fail`.
5. It then polls again after `pollInterval` (default 1 s).

**Internal detail worth knowing.** On failure, the API writes `status: "failed"` immediately (so you can see it), but internally it also rejects a BullMQ promise. BullMQ handles retry with exponential backoff (default: 3 attempts, 2 s × 2^n base delay). On each retry the API flips the doc **back to `pending`**, and any worker polling for that type picks it up again. So a retrying job's status visibly oscillates: `pending → processing → failed → pending → processing → failed → …` until either it succeeds or BullMQ gives up and writes the final `failed` state.

**Common failures before you even run**
- `createWorker: at least one handler is required` → your `handlers` object is empty or missing.
- `AsyncOps: API key missing.` → you forgot `init()` or didn't export `ASYNCOPS_API_KEY`.

---

## Step 3 — Run the worker

```bash
ASYNCOPS_API_KEY=$ASYNCOPS_API_KEY \
ASYNCOPS_URL=$ASYNCOPS_URL \
node worker.js
```

You should see:

```
[asyncops-worker] started; types=send-email,flaky
```

Leave it running. Open a second terminal for the next step. **If you kill this process, nothing runs.**

**What's happening internally.** The worker is now blocking on a polling loop. Every ~2 s it hits `GET /jobs/next?types=send-email,flaky`. Right now you have no jobs, so every response is `{ job: null }` and nothing prints. That's correct.

**Common failures**
- Worker prints `[worker] fetch ... 401 invalid API key` over and over → wrong key or wrong URL. Check `$ASYNCOPS_API_KEY` and `$ASYNCOPS_URL`.
- Worker prints nothing at all and hangs → it can't reach `$ASYNCOPS_URL`. Check DNS / firewall / `curl $ASYNCOPS_URL/health`.

---

## Step 4 — Submit a job

In your second terminal:

```js
// submit.js
const { init, client } = require('asyncops-sdk');

init({
  apiKey: process.env.ASYNCOPS_API_KEY,
  baseUrl: process.env.ASYNCOPS_URL,
});

(async () => {
  const emailJob = await client.createJob({
    type: 'send-email',
    data: { to: 'alice@example.com', subject: 'hi' },
  });
  console.log('submitted email job:', emailJob);

  const flakyJob = await client.createJob({
    type: 'flaky',
    data: { reason: 'tutorial' },
  });
  console.log('submitted flaky job:', flakyJob);
})();
```

```bash
ASYNCOPS_API_KEY=$ASYNCOPS_API_KEY \
ASYNCOPS_URL=$ASYNCOPS_URL \
node submit.js
```

Expected output:

```
submitted email job: { id: '6...', type: 'send-email', status: 'pending' }
submitted flaky job: { id: '6...', type: 'flaky',      status: 'pending' }
```

Both come back `pending`. That's not the final state — it's the state right after insertion and before the worker has picked them up.

**What's happening internally.**

1. `POST /jobs` validates `type` against `^[a-zA-Z0-9._:\-]{1,100}$`, checks your plan's monthly limit (free tier: **1000 jobs/month**), and inserts a document into the `jobs` MongoDB collection with `status: "pending"`, `attempts: 0`, and an initial `"Job created"` log line.
2. It increments your `jobCountMonthly` counter.
3. It calls `enqueueJob(id)`, which adds a BullMQ job to Redis with `{ attempts: 3, backoff: exponential, delay: 2000 }`.
4. It returns `201 { id, type, status: "pending" }` to you.
5. Independently, the BullMQ proxy worker on the API process dequeues the job, sets `attempts: 1`, and awaits an in-memory Promise keyed by job id.
6. Your worker polls `GET /jobs/next`, atomically flips the doc to `processing`, and runs your handler.
7. Your handler's `complete`/`fail` HTTP call **resolves that in-memory Promise**, which is how BullMQ learns whether to retry or move on.

**Common failures**
- `429 Monthly limit reached (1000). Upgrade to Pro for more.` → free tier. You've used 1000 jobs this calendar month. Resets on the 1st.
- `400 type is required and must be a short string (letters, digits, . _ : -)` → you used a space or a slash. Use kebab-case / dot-separated.
- `413 payload too large` → `data` is over 1 MB. The API body limit is `1mb`. Store the blob in S3, pass the URL.

---

## Step 5 — Observe execution

You now have three ways to watch what's happening. Use all three once so you know what each is for.

### A. Worker stdout

Look at the terminal running `worker.js`. You should see something like:

```
[asyncops-worker] running send-email (65f...)
[asyncops-worker] completed 65f...
[asyncops-worker] running flaky (65f...)
[worker] handler 65f... Error: intentional failure for the tutorial
```

`send-email` completes in one attempt. `flaky` throws — and because of the retry loop, you'll see it run three times, each one printed by the worker.

### B. Dashboard

Open `https://app.asyncops.com/dashboard/jobs` (or your self-hosted URL).

- The jobs list refreshes every 2 seconds by polling `GET /jobs`.
- Click a job to open its detail page, which uses **Server-Sent Events** on `GET /jobs/:id/stream` for real-time updates.
- The `flaky` job will cycle through `pending → processing → failed → pending → processing → failed …` until it's terminal. Its `tries` counter will go `1, 2, 3`.
- The `send-email` job will show `completed` with `tries: 1` and the `result` you returned.

If any job stays in `pending` for more than 15 seconds, the dashboard shows a yellow **`[WARN] No worker registered for this job type`** banner. That's hard-coded in the dashboard — it's the #1 "why isn't anything happening" symptom and it has a specific cause: no worker has a handler for that `type`. Either you spelled the type differently or the worker crashed.

### C. Programmatic subscription

```js
// watch.js
const { init, client } = require('asyncops-sdk');
init({ apiKey: process.env.ASYNCOPS_API_KEY, baseUrl: process.env.ASYNCOPS_URL });

const jobId = process.argv[2];
if (!jobId) { console.error('usage: node watch.js <jobId>'); process.exit(1); }

const unsubscribe = client.subscribe(jobId, (event) => {
  if (event.type === 'status') console.log('[status]', event.data.status);
  if (event.type === 'log')    console.log('[log]   ', event.data.message);
});

setTimeout(() => { unsubscribe(); process.exit(0); }, 60_000);
```

```bash
node watch.js <flakyJobId>
```

In a browser, `client.subscribe` uses SSE. In Node (which is where you're running it), there is no `EventSource`, so it **polls `GET /jobs/:id` every 2 seconds** and diffs the `logs` array by length. This is important: if your job produces > 500 log lines between polls, you'll miss some — the server caps embedded logs at 500 per job.

---

## Step 6 — Failure and retry

By now your `flaky` job has run three times and is `failed`. This is the **terminal** state — BullMQ has given up on automatic retries. Confirm it:

```bash
curl -s "$ASYNCOPS_URL/jobs/<flakyJobId>" \
  -H "Authorization: Bearer $ASYNCOPS_API_KEY" | jq
```

You'll see:
```json
{
  "job": {
    "id": "...",
    "type": "flaky",
    "status": "failed",
    "attempts": 3,
    "error": "intentional failure for the tutorial",
    "data": { "reason": "tutorial" },
    "result": null,
    "createdAt": "...",
    "updatedAt": "..."
  },
  "logs": [
    { "id": "...", "message": "Job created", "timestamp": "..." },
    { "id": "...", "message": "Worker picked up job", "timestamp": "..." },
    { "id": "...", "message": "attempt 1 — about to throw", "timestamp": "..." },
    { "id": "...", "message": "Job failed: intentional failure for the tutorial", "timestamp": "..." },
    ...
  ]
}
```

### Fix the handler

Stop the worker (Ctrl-C), change `flaky` to actually succeed:

```js
'flaky': async (job, ctx) => {
  await ctx.log(`attempt ${job.attempts} — this time it works`);
  return { fixed: true };
},
```

Restart the worker.

### Retry the failed job

Two options — they do the same thing.

**From code:**
```js
await client.retryJob('<flakyJobId>');
```

**From the dashboard:** open the job, click **Retry**. Or check several failed jobs on the list page and click **retry --count=N**.

Either way, the API updates the doc to `{ status: "pending", attempts: unchanged, error: null, result: null }`, re-enqueues it in BullMQ, and your (now-fixed) worker picks it up and completes it.

> **Warning.** `retryJob` re-queues a job regardless of current status. If you retry a job that is currently `processing`, you'll create a race between the currently-running handler and a new one. Only retry jobs that are `completed` or `failed`.

### Things that commonly confuse new users

| Symptom | Cause |
|---|---|
| Job stuck `pending` forever | No worker is registered for this `type`. Check your `handlers` keys vs the `type` you submitted. Typos count. |
| Job ran twice even though it succeeded | Your handler **must** be idempotent. Retries are automatic on failure, and edge cases (worker killed mid-run, network failure between handler and API) can also cause reruns. |
| `attempts` counter is `0` on a running job | Rare race between `POST /jobs` insertion and the BullMQ proxy picking the job up. Treat `attempts` as a lower bound. |
| Logs stop right before the failure | Either your handler threw synchronously, was killed by `handlerTimeoutMs` (default 5 min), the worker process crashed, or the log buffer hit its 500-entry cap. |
| 429 `Monthly limit reached` | Free tier caps you at 1000 jobs/month. |

---

## Step 7 — Production notes

These are the things you'd regret not knowing before you deploy this for real.

1. **Handlers must be idempotent.** Automatic retries, manual retries, worker crashes, and rare edge cases can all make the same job run more than once. Treat every handler as "this may be called N times with the same `job.data`". Use an external dedupe key (e.g. an `invoiceId`) inside the handler, not just an AsyncOps `idempotencyKey` on the job submission.

2. **Idempotency on job creation.** Pass `idempotencyKey` to `createJob` whenever your caller can retry — HTTP retries, cron re-fires, webhook redelivery. The API backs it with a partial unique index on `(userId, idempotencyKey)`; the second call returns the original job with `idempotent: true` instead of inserting a duplicate.

3. **Handler timeout.** Default `handlerTimeoutMs` is 5 minutes. When it fires, the SDK **reports the job as failed** but **does not kill your handler function** — the function keeps running in your Node process until it naturally completes. If you start external I/O (e.g. a DB transaction) inside a handler, design the handler to abort itself on timeout, or you'll leak work.

4. **Stalled workers.** If a worker claims a job and then dies (OOM, SIGKILL, network partition) without reporting back, BullMQ only notices after `JOB_LOCK_DURATION_MS` (default 10 minutes) and re-runs the processor, which flips the doc back to `pending`. A killed worker means that job waits up to 10 minutes before another worker can retry it. Keep this in mind for SLA-sensitive work.

5. **Pass ids, not payloads.** Keep `data` small. The API has a 1 MB body limit. More importantly, by the time your worker reads the data, the row may have changed — always fetch fresh state from your database inside the handler.

6. **`type` naming.** Regex-enforced: `^[a-zA-Z0-9._:\-]{1,100}$`. No spaces, no slashes, no unicode. Use verb-noun kebab-case: `send-email`, `sync-contact`, `generate-report`.

7. **Run workers under a supervisor.** Use systemd, Docker restart policy, Kubernetes, or Fly.io/Render "background workers" — anything that restarts the process on exit. The SDK has no built-in restart loop; it's a plain Node process.

8. **Graceful shutdown.** Wire `SIGTERM` to `worker.stop()`. That stops polling but lets the in-flight handler run to completion. Matched with a platform that drains connections before killing the container, rolling deploys are safe.

9. **Observability.** Log liberally inside handlers with `ctx.log(...)`. Those lines are your only post-mortem when something goes wrong — the dashboard shows them per-attempt. Aim for "one log line per meaningful state change" (before external call, after response, before write, after write).

10. **Plan limits.** Free tier = 1000 jobs/month (counter resets on the 1st UTC). Pro = 50000/month. Watch the Usage card on the dashboard; budget accordingly.

That's it. You've gone from a clean directory to a worker, a submitter, observed a success, observed a failure + auto-retry, fixed a handler, and manually retried a job. From here:

- **[sdk.md](sdk.md)** — complete `JobsClient` reference, all methods, all options.
- **[workers.md](workers.md)** — worker tuning, scaling out, the full handler contract and lifecycle.
- **[jobs.md](jobs.md)** — idempotency, payload shape, listing/inspecting.
- **[debugging.md](debugging.md)** — reading failures, log patterns, common failure modes.
- **[dashboard.md](dashboard.md)** — tour of the UI.
- **[deployment.md](deployment.md)** — self-hosting AsyncOps itself.
