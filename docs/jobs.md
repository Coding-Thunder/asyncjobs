# Jobs

## What is a job?

A job is a persisted request to run one of your handlers. It's the unit AsyncOps stores, tracks, retries, and exposes in the dashboard. In MongoDB it looks like this (trimmed):

```js
{
  _id: ObjectId("..."),
  userId: ObjectId("..."),
  type: "send-email",
  status: "pending" | "processing" | "completed" | "failed",
  data: { to: "..." },
  result: null | <handler return value>,
  error:  null | "handler error message",
  attempts: 0 | 1 | 2 | ...,
  idempotencyKey: null | "user-supplied string",
  logs: [ { id, message, timestamp }, ... ],   // capped at 500
  createdAt: Date,
  updatedAt: Date,
}
```

You never touch this document directly — you create it via `POST /jobs` and read it via `GET /jobs/:id`. But knowing the shape is useful: everything in this file is an operation on one or more of these fields.

## When to create a job

Create a job whenever **you want this work to run reliably, with retries and visibility, outside your request-response cycle**. Typical cases:

- An API endpoint returns `202 Accepted` and kicks off a longer-running task (email, report, ML inference, batch import).
- A webhook arrives; you want to process it asynchronously so the sender gets a fast `200`.
- A cron or scheduler triggers work.
- A user action needs to retry on failure without the user watching.

**Do not use jobs for:**
- Request-synchronous work — if the user is waiting for the result, run it directly.
- Scheduling in the future — AsyncOps has no built-in scheduler. Create jobs from your own cron/scheduler.
- Pure fire-and-forget where you don't need retries, logs, or visibility — plain `setImmediate` is simpler.

## Creating a job

```js
const { init, client } = require('asyncops-sdk');
init({ apiKey: process.env.ASYNCOPS_API_KEY });

const { id, status } = await client.createJob({
  type: 'send-email',
  data: { to: 'alice@example.com', template: 'welcome' },
});
// → { id: "65f...", type: "send-email", status: "pending" }
```

**Rules enforced by the API:**

- **`type` is required** and must match `^[a-zA-Z0-9._:\-]{1,100}$` — letters, digits, `.`, `_`, `:`, `-`, up to 100 chars. Spaces, slashes, unicode → `400`.
- **`data` can be any JSON-serializable value or `null`.** The full request body is limited to **1 MB** by Express. If you need bigger, pass references and fetch inside the handler.
- **Handler resolution happens at execution time.** `createJob` does not check whether a matching worker is running. If no worker has that handler, the job stays `pending` indefinitely (or until BullMQ's retry loop walks through `MAX_JOB_ATTEMPTS` and the proxy eventually gives up — but even then, the Mongo doc will oscillate through states, not sit cleanly).

**Response shapes:**

| HTTP | Body | When |
|---|---|---|
| `201 Created` | `{ id, type, status: "pending" }` | Fresh insert |
| `200 OK` | `{ id, type, status, idempotent: true }` | Duplicate idempotent call (existing job returned) |
| `400` | `{ error: "..." }` | Invalid type, missing body, bad JSON |
| `429` | `{ error: "Monthly limit reached (N). Upgrade to Pro for more." }` | Plan cap hit |
| `401` | `{ error: "invalid API key" }` | Bad credentials |

## Idempotency

Many systems retry requests. If your caller (HTTP client, webhook sender, cron, upstream service) might call `createJob` more than once for the same logical unit of work, use an idempotency key.

```js
await client.createJob({
  type: 'charge-card',
  data: { invoiceId: 'inv_42' },
  idempotencyKey: `invoice:${invoiceId}`,
});
```

Or via HTTP header:
```
POST /jobs
Idempotency-Key: invoice:inv_42
```

How it works internally:

1. The API does a pre-check: `jobs.findOne({ userId, idempotencyKey })`. If a job exists, it's returned as-is with `idempotent: true`.
2. Otherwise the API inserts. If two requests race past the pre-check, a **partial unique index** on `(userId, idempotencyKey)` (sparse, only where `idempotencyKey` is a string) causes a `11000` duplicate-key error. The API catches this, re-reads the existing job, and returns it the same way.
3. The existing job is returned **regardless of its current status**. If the first call completed an hour ago, the idempotent replay will return `status: "completed"` — it won't re-run the handler.

**Use idempotency keys for:**
- Webhook ingestion (re-delivery is common).
- HTTP retries from clients with flaky networks.
- Cron jobs that re-fire on the same logical tick.
- Any caller where "exactly once from my side" is what you want.

**Key design tips:**
- Prefer keys derived from a stable business identifier: `invoice:inv_42`, `webhook:${providerId}`. Avoid timestamps.
- Keys are scoped per user, not global. You can't collide with another account.
- There's no explicit expiration — a key remains unique for as long as its job row exists.

## Handler idempotency (different thing, equally important)

Idempotency keys on the **creation** path dedupe the job-creation API. They do **not** prevent your handler from running more than once for the same job. Handlers can run twice when:

- An automatic retry fires after a thrown error.
- A manual `retryJob` is called.
- A worker dies mid-handler and the stalled-job path re-runs the handler ~10 minutes later.
- Rare internal races flip a completed job back to `pending` (see the `attempts=0` edge case in [workers.md](workers.md)).

Design every handler to be safe under "may be called N times with the same `job.data`". Common patterns:

- **External idempotency keys.** If you're calling an external API, pass a stable key from `job.data`:
  ```js
  await stripe.charges.create({ ... }, { idempotencyKey: `job:${job.id}` });
  ```
- **Database uniqueness.** Write with `INSERT ... ON CONFLICT DO NOTHING` or a unique index.
- **"Already done" pre-check.** Read the target state first; skip if it's already in the desired state.
- **Append-only logic.** Avoid counters or `$inc` unless the operation is naturally idempotent.

## Payload design: references, not blobs

Keep `data` small. Not just because of the 1 MB body limit — because **by the time your handler runs, the data in your database may have changed**. Passing ids instead of full records means the handler sees the truth at execution time.

```js
// ❌ brittle: user record may have changed between createJob and handler
await client.createJob({ type: 'send-email', data: { user: fullUserRecord, body } });

// ✅ fetch fresh state inside the handler
await client.createJob({ type: 'send-email', data: { userId, template: 'welcome' } });
```

Inside the handler:

```js
'send-email': async (job, ctx) => {
  const user = await db.users.findById(job.data.userId);
  if (!user) throw new Error(`user ${job.data.userId} gone`);
  await sendMail(user.email, renderTemplate(job.data.template, user));
  return { to: user.email };
}
```

## Listing and inspecting jobs

```js
// newest 200 jobs, trimmed
const { jobs } = await client.listJobs();

// full job + embedded logs
const { job, logs } = await client.getJob(id);
// logs is [{ id, message, timestamp }, ...]  — last 500 entries
```

For filtering, searching, or live viewing, use the [dashboard](dashboard.md). The REST API doesn't expose filter params — `GET /jobs` returns your newest 200, sorted `createdAt` descending.

## Retrying

```js
await client.retryJob(id);
```

The API:
1. Sets `status: "pending"`, clears `result` and `error`.
2. Appends a `"Job retry requested"` log line.
3. Re-enqueues the job in BullMQ (fresh attempt counter inside BullMQ).

The previous logs are preserved — retries append to the same `logs` array (up to the 500-entry cap, at which point old lines drop off).

> **Do not retry a job while it is `processing`.** You'll race the in-flight handler against a new claim. Only retry `completed` or `failed` jobs. The dashboard UI lets you multi-select failed jobs and bulk-retry — that's the intended use.

Automatic retries on failure are separate: they happen without any caller action, up to `MAX_JOB_ATTEMPTS` (default 3) with exponential backoff. Manual retry is for:
- A job that failed terminally and you want to re-run after fixing the handler.
- Replaying a completed job (e.g. re-sending an email the customer lost).
- A stuck job you need to nudge.

## Lifecycle

```
 (create)             (worker claim)        (complete)
  │                         │                  │
  ▼                         ▼                  ▼
 pending ───────────▶  processing ──────▶  completed
    ▲                         │
    │                         │ (throw / fail)
    │                         ▼
    └────────────────────  failed (tentative)
         auto-retry                 │
         w/ backoff                 │ attempts >= MAX_JOB_ATTEMPTS
         (up to MAX_JOB_ATTEMPTS)   ▼
                                 failed (terminal)
```

**What happens on each transition:**

- **→ `pending`** — row is inserted; BullMQ job is queued; initial `"Job created"` log written.
- **→ `processing`** — a worker called `GET /jobs/next`; the API atomically flipped `pending` → `processing`; `"Worker picked up job"` log written.
- **→ `completed`** — worker called `POST /jobs/:id/complete`; `result` is stored; `"Job completed"` log written; BullMQ resolves the internal promise.
- **→ `failed` (tentative)** — worker called `POST /jobs/:id/fail`; `error` is stored. BullMQ rejects the internal promise. If attempts remain, BullMQ waits `JOB_BACKOFF_DELAY_MS × 2^attempts` and re-runs the internal processor, which flips the row **back to `pending`** with `attempts` incremented — so the status visibly cycles `failed → pending → processing → failed → …` during retries.
- **→ `failed` (terminal)** — BullMQ has exhausted `MAX_JOB_ATTEMPTS`. The API writes the final `failed` state and the job stays there until manual retry.

### Where retries come from

- **`JOB_BACKOFF_DELAY_MS`** (env var on the API, default `2000`) — base delay for BullMQ's `exponential` backoff. Real delay between attempts is `base × 2^attemptNumber`.
- **`MAX_JOB_ATTEMPTS`** (default `3`) — hard cap. After this many failures, the job is terminal.
- **Stalled recovery** — if a worker claims a job and dies silently, BullMQ re-runs the processor after `JOB_LOCK_DURATION_MS` (default 10 min). This counts as an attempt.

## Plan limits (important)

Every `POST /jobs` call increments a per-user monthly counter. When the counter reaches the plan cap, further calls return `429`:

| Plan | Monthly job limit |
|---|---|
| free | **1,000** |
| pro  | **50,000** |

The counter resets on the first call in a new UTC month. The dashboard's Usage card shows current usage; watch it before you deploy something batch-heavy.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `400 type is required...` | Spaces, slashes, or unicode in `type` | Use kebab-case or dotted: `send-email`, `reports.daily` |
| `413 payload too large` | `data` over 1 MB | Pass ids, not blobs |
| `429 Monthly limit reached` | Plan cap | Wait for monthly reset or upgrade |
| Job stuck `pending` | No worker has a handler for that type | Start a worker; check dashboard banner |
| Status oscillates `failed → pending → processing → failed` | Automatic retry loop in action; totally normal | Wait for the terminal state |
| Handler ran twice for a completed job | Race or retry — expected behavior | Make handlers idempotent |
| `idempotent: true` returned but you wanted a fresh job | Same `idempotencyKey` used twice | Rotate the key |

See [debugging.md](debugging.md) for post-mortem techniques and [workers.md](workers.md) for the handler side.
