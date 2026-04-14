# Debugging jobs

Every job in AsyncOps is fully inspectable. The goal of this page is to give you a short, repeatable drill for "something went wrong, what do I look at and in what order".

## What is it and when to use it

Use this page when a job is:
- Stuck in `pending` and never runs.
- Running, but not producing the result you expect.
- Failing on every attempt.
- Randomly running twice (or more).
- Missing log lines you were sure you wrote.

## Mental model

There are three separate places a job's state lives:

1. **MongoDB** — the durable record. `data`, `result`, `error`, `attempts`, `logs[]`. Everything the dashboard displays and the SDK returns comes from here.
2. **BullMQ + Redis** — the retry engine. You don't see it directly; it drives the `failed → pending → processing` oscillation during automatic retries and the 10-minute stalled-lease recovery.
3. **Your worker process** — where the handler actually runs. Logs, stack traces, and crashes live here.

Debugging a job means figuring out which of those three lost information, and working back to the cause.

## 1. First move: look at the dashboard

Open [`/dashboard/jobs`](dashboard.md) and find the job. The jobs list page polls every 2 seconds; the **job detail** page uses Server-Sent Events and updates instantly.

What to read, in order:

1. **Status.** `pending`, `processing`, `completed`, `failed`.
2. **`tries` / `attempts`.** `1` = first attempt. `2` or `3` = automatic retries fired. After `MAX_JOB_ATTEMPTS` (default 3), the job stays in terminal `failed`.
3. **The `Error` tab** (auto-focused when status is `failed`) — contains the handler's error message from the final attempt.
4. **The `Logs` tab** — every `ctx.log(...)` line, in order, across all attempts.
5. **The `Data` tab** — exactly what was passed to `createJob`.

If a job has been `pending` for more than 15 seconds, the list page shows a yellow `[WARN] No worker registered for this job type` banner. That banner is the single most useful debugging hint in the dashboard — see symptom 1 below.

## 2. The five symptoms you'll hit in practice

### Symptom 1 — Job stuck `pending` forever

The worker isn't seeing it. Possible causes, in order of frequency:

1. **No worker has a handler for that `type`.** Typos count: `"send-email"` vs `"send_email"` are different types. Check `Object.keys(handlers)` on every running worker against the `type` you submitted.
2. **The worker process crashed.** Check your worker's stdout / container logs. An unhandled promise rejection in the polling loop can kill the process. Run workers under a supervisor (systemd, Docker restart policy, Kubernetes) so this is recoverable.
3. **The worker is alive but can't reach the API.** Look for `[worker] fetch ... 401` or `... ECONNREFUSED` in worker logs. Check `ASYNCOPS_URL` and DNS.
4. **The worker's API key was revoked.** `401 invalid API key` repeats in the worker logs. Issue a new key, restart the worker.
5. **Plan limit.** If every new job is stuck AND `POST /jobs` returned `429 Monthly limit reached`, the job was never actually inserted. Not this symptom — look at the creator side.

> Use the dashboard's 15-second stale-pending banner as the canonical first signal. If you see it, you're in this symptom.

### Symptom 2 — Job retries in a loop and you can see it happen

Status visibly oscillates: `pending → processing → failed → pending → processing → failed → …` up to `MAX_JOB_ATTEMPTS` (default 3), then terminal `failed`.

This is working as designed. The handler is throwing on every attempt. Read the `Error` tab, then the last few log lines on each attempt to find the last thing that worked before the throw.

Timing between attempts: exponential backoff with `JOB_BACKOFF_DELAY_MS` base (default 2 s) — i.e. ~2, 4, 8 seconds between attempts for the default config.

### Symptom 3 — Handler ran twice (or more) for what looks like a single execution

A handler can run more than once even when "it succeeded" in your head. Sources, in order of frequency:

1. **Automatic retry after a thrown error.** Expected. The first attempt wrote an error, BullMQ retried, the second attempt succeeded. Read `attempts` on the final record — if it's > 1, this is it.
2. **Worker died mid-handler.** The worker claimed the job, started running, then the process was killed (OOM, SIGKILL, host reboot, container eviction). The handler never reported back. `JOB_LOCK_DURATION_MS` later (default 10 minutes), BullMQ declares the processor stalled, re-runs it, and the job goes back to `pending` for another claim. The "twice" gap is ~10 minutes.
3. **Manual retry** — someone clicked Retry in the dashboard or called `client.retryJob(id)`.
4. **Network partition** between your worker and the API. The handler completed locally, but `POST /jobs/:id/complete` couldn't reach the API. The job eventually stalls and re-runs.

**This is not a bug you can fix once.** It's the model. Every handler must be idempotent. See [jobs.md § Handler idempotency](jobs.md#handler-idempotency-different-thing-equally-important) for patterns.

### Symptom 4 — Logs stop abruptly before the failure

You can see the handler ran and wrote a few log lines, then nothing, and the job ended up `failed` with an error like `handler "X" timed out after 300000ms` or no error at all.

Possible causes:

| Last log line pattern | What happened |
|---|---|
| Handler error on the same attempt | Handler threw **synchronously** after the last log line. Look for code between `ctx.log(...)` and the next `await`. |
| `handler "X" timed out after Nms` | [`handlerTimeoutMs`](workers.md#handler-timeout--read-this-carefully) fired. The handler function is **still running in your worker process** until it naturally finishes — Node can't cancel it. Your next log lines may never have made it back because the SDK already reported failure and moved on. |
| No final error, job stays `processing` until ~10 min | Worker process was killed mid-handler. No final log because the process died before `ctx.log` could flush. |
| No final error, log count looks capped at 500 | You hit the per-job log cap ([jobRoutes.js:21 `MAX_LOGS_PER_JOB = 500`](../apps/api/routes/jobRoutes.js#L21)). Older lines are silently dropped by `$push: { $slice: -500 }`. |

Mitigation: add more `ctx.log` calls around the suspected section, retry, and read again. Keep log lines short so you don't blow through the 500-entry cap on a loop.

### Symptom 5 — `401 Unauthorized` from the SDK

`ASYNCOPS_API_KEY` is missing, revoked, or has a typo. Specifics:

- **`AsyncOps: API key missing. Call asyncops.init(...)`** — you never passed the key to the SDK. Check `init()` was called and the env var is exported to the process.
- **`401 missing or invalid Authorization header`** — request was sent without a Bearer header. Usually means `apiKey` resolved to `null` at request time despite `init()` being called earlier — check for typos and env-var leaking.
- **`401 invalid API key`** — the key doesn't exist in the `api_keys` collection. Either revoked (check the Keys page) or copy-paste lost a character.

## 3. Log streaming from handlers

Handlers emit log lines with `ctx.log`:

```js
'process-upload': async (job, ctx) => {
  await ctx.log(`downloading ${job.data.url}`);
  const file = await download(job.data.url);
  await ctx.log(`downloaded ${file.size} bytes`);
  await ctx.log('parsing');
  const rows = await parse(file);
  await ctx.log(`parsed ${rows.length} rows`);
  return { rows: rows.length };
},
```

Notes on `ctx.log`:

- It appends to the embedded `logs` array on the job document. The dashboard surfaces each line in real time via SSE on the detail page.
- It's fire-and-forget from the handler's perspective: a failure appending a log does not throw into your handler — it's routed to the worker's `onError` with `ctx.stage === 'log'`.
- Each append is a separate HTTP call. Don't put `ctx.log` inside a hot inner loop — batch messages with `\n` and log once.
- The last 500 log lines are kept per job across **all attempts** (retries append to the same array, older lines drop off).
- You can't delete log lines. Don't log secrets.

## 4. Programmatic subscription from code

Watch a job from a script — useful for tests, CI smoke jobs, or one-off investigations:

```js
const { init, client } = require('asyncops-sdk');
init({ apiKey: process.env.ASYNCOPS_API_KEY });

const unsubscribe = client.subscribe(jobId, (event) => {
  if (event.type === 'status') console.log('status →', event.data.status);
  if (event.type === 'log')    console.log('log    →', event.data.message);
});

// stop watching once the job is terminal
setTimeout(() => unsubscribe(), 5 * 60 * 1000);
```

Implementation notes (matter when you trust the output):

- **In a browser** (anywhere `EventSource` exists): uses Server-Sent Events. Real-time, every event delivered.
- **In Node** (no `EventSource`): falls back to polling `GET /jobs/:id` every 2 seconds and diffing on status and `logs.length`. Two consequences:
  - A status transition that happens and reverts in under 2 s (e.g. `pending → processing → failed → pending` during a fast retry) may be invisible to the polling fallback.
  - If the server appends more than 500 log lines between two polls, the oldest ones have already been dropped from the embedded array and you'll never see them.

For precise ordering, use SSE from a browser or read the full `GET /jobs/:id` response after the job is terminal.

## 5. Reading a failed job — the drill

```bash
curl -s "$ASYNCOPS_URL/jobs/$JOB_ID" \
  -H "Authorization: Bearer $ASYNCOPS_API_KEY" | jq '
    {
      id: .job.id,
      status: .job.status,
      attempts: .job.attempts,
      type: .job.type,
      error: .job.error,
      created: .job.createdAt,
      finished: .job.updatedAt,
      lastFiveLogs: (.logs | .[-5:])
    }'
```

That snippet gives you:
- Final status and error.
- How many attempts it took (is it actually terminal? or did BullMQ still have attempts left?).
- Total elapsed time (`finished - created` — note this includes retry backoff and any stalled-lease delay, not just handler runtime).
- The last five log lines — almost always where the cause lives.

## 6. Retry workflow after a fix

1. Reproduce the failure in the dashboard (or with the curl snippet above) and copy the error.
2. Fix the handler code in your worker.
3. **Redeploy the worker.** AsyncOps never needs to restart.
4. Click **Retry** in the dashboard job detail page — the button is disabled when the job is `pending` or `processing`, so you can't step on a live execution. Or call `client.retryJob(id)` from a script.
5. Watch the new attempt run in real time on the detail page.

Bulk fix after a mass failure: on the jobs list page, select the failed jobs with the checkboxes and click `$ retry --count=N`.

## 7. Things that look like AsyncOps bugs but aren't

| Observed | Actual cause |
|---|---|
| `attempts: 0` on a running job | Narrow race between `POST /jobs` and the BullMQ proxy. Treat `attempts` as a lower bound, not a first-run flag. |
| Status goes `failed → pending → processing → failed` by itself | Automatic retry loop. Working as designed. |
| Two workers picked up the same job | Almost certainly not — the claim on `/jobs/next` is a single atomic `findOneAndUpdate`. If it *is* happening, the claim isn't the issue; the handler is being run twice by other means (retry, stalled-lease, manual retry). |
| A completed job became `pending` again | Either manual retry, or a rare race where the BullMQ proxy's `flipToPending` runs after a worker has already completed — check the logs for `Worker picked up job` appearing twice. Make handlers idempotent; this is why. |
| Logs on retried jobs look "merged" | They are. Logs append to the same array across attempts. |

---

See [workers.md](workers.md) for handler-side contracts and the stalled-job path, [jobs.md](jobs.md) for idempotency patterns, and [dashboard.md](dashboard.md) for the UI tour.
