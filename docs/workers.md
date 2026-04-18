# Workers

> **Runtime:** Node.js 18+. The worker loop is part of `asyncops-sdk`, which is a Node package. There is no Python / Go / Ruby / JVM worker runtime today. If your app is written in another language, you can still *create* and *inspect* jobs via the [REST API](sdk.md#rest-access-from-other-languages), but the process running handlers must be Node.js.

## What is a worker?

A worker is a **long-lived Node.js process in your environment** that:

1. Polls the AsyncOps API for jobs whose `type` matches a handler you've registered.
2. Runs that handler in-process with `(job, ctx)`.
3. Reports the return value (success) or the thrown error (failure) back to AsyncOps.

AsyncOps never runs your code. If no worker is running with a handler for a given `type`, jobs of that type stay `pending` forever. The dashboard surfaces this specifically: any job that's been `pending` for more than 15 seconds triggers a yellow "no worker registered for this type" banner.

Workers need only two things:

- An API key (`ak_live_…`).
- Outbound HTTPS to the API URL.

They never touch Redis, MongoDB, or any other part of AsyncOps infrastructure.

## When to use `createWorker` vs a custom loop

- **`createWorker`** — default. Handles polling, claim, dispatch, timeout, logging, error reporting, graceful stop. This is what you want.
- **Custom loop using `client.nextJob` / `completeJob` / `failJob`** — only if you need something `createWorker` doesn't do, e.g. running a handler across a cluster manager that owns the lifecycle, or multiplexing handlers over a custom concurrency model. You are signing up to re-implement timeout handling, error reporting, shutdown, and the polling back-off yourself.

## Minimal worker

```js
// worker.js
const { init, createWorker } = require('asyncops-sdk');

init({ apiKey: process.env.ASYNCOPS_API_KEY });

const worker = createWorker({
  handlers: {
    'send-email': async (job, ctx) => {
      await ctx.log(`sending to ${job.data.to}`);
      // ... your real send-mail code
      return { messageId: 'm_abc123' };
    },
    'generate-report': async (job, ctx) => {
      await ctx.log(`building report for ${job.data.accountId}`);
      return { url: 's3://reports/...' };
    },
  },
});

worker.start();

process.on('SIGTERM', async () => { await worker.stop(); process.exit(0); });
process.on('SIGINT',  async () => { await worker.stop(); process.exit(0); });
```

```bash
ASYNCOPS_API_KEY=ak_live_... \
ASYNCOPS_URL=https://api.asyncops.com \
node worker.js
```

On successful start:

```
[asyncops-worker] started; types=send-email,generate-report
```

## How the polling loop actually works

```
loop:
  GET /jobs/next?types=send-email,generate-report
  if response.job is null:
    sleep idlePollInterval (default 2000 ms)
    continue
  find handlers[job.type]
  if missing:
    POST /jobs/:id/fail  (error: "no handler registered for type ...")
    continue
  run handler(job, ctx) with a hard withTimeout(handlerTimeoutMs) wrapper
  on success: POST /jobs/:id/complete { result }
  on error:   POST /jobs/:id/fail { error: err.message }
  sleep pollInterval (default 1000 ms)
  continue
```

Key details, all of which affect how you should write handlers:

1. **The claim is atomic on the server.** `/jobs/next` does a MongoDB `findOneAndUpdate` matching `status: "pending"` for your user ID and the listed types, flipping to `status: "processing"`. Two workers polling for the same types will never claim the same job.
2. **`types` is derived from `Object.keys(handlers)`.** If you add a new handler key, it is automatically polled for. If you remove one, jobs of that type will sit in `pending` until another worker with that handler comes online.
3. **The handler runs in the same Node process as the polling loop.** CPU-heavy handlers will block polling. If your handlers are CPU-bound, run separate worker processes per type or offload to worker threads.
4. **Errors thrown from the handler are caught.** They become `POST /jobs/:id/fail` calls, which cause AsyncOps to retry with exponential backoff. Only "transport" errors (the fetch call to AsyncOps itself) surface through `onError`.

## Handler contract

```ts
async (job, ctx) => result
```

### What `job` looks like

| Field | Type | Notes |
|---|---|---|
| `job.id` | string | AsyncOps job id (Mongo ObjectId as hex) |
| `job.type` | string | Matches a key in your `handlers` |
| `job.data` | any JSON \| null | Exactly what was passed to `createJob` |
| `job.status` | string | `"processing"` — that's the state you're looking at |
| `job.attempts` | number | Attempt counter. Starts at `1` on first run, increments on BullMQ-driven retries. Treat it as a **lower bound**, not a truth — in rare races it can briefly read `0`, and an explicit `POST /jobs/:id/retry` (dashboard button, SDK `retryJob()`, MCP `retry_job`) **resets it to `0`** so BullMQ gets a clean retry budget. |
| `job.createdAt` | ISO timestamp | When `createJob` was called |
| `job.updatedAt` | ISO timestamp | Last state change |

### What `ctx` gives you

- `ctx.log(message: string)` — appends one log line to the job. Visible in the dashboard and on `client.subscribe()`. Fire-and-forget; it never throws inside your handler (any error appending the log is routed to `onError`). The log array is capped at 500 entries per job; older lines are silently dropped. See [Log cap](#log-cap) below.

That's the entire `ctx` surface. There is no `ctx.setProgress`, no `ctx.extend`, no `ctx.sleep`. Keep it simple.

### Return value semantics

- **Resolve with any JSON-serializable value** → stored as `job.result`, job marked `completed`. `undefined` is serialized as `null`.
- **Resolve with no value** → same as resolving `null`.
- **Throw or reject** → the thrown error's `.message` becomes `job.error`, and AsyncOps retries up to `MAX_JOB_ATTEMPTS` (default 3) with exponential backoff (`JOB_BACKOFF_DELAY_MS`, default 2000 ms base). After the final failure, the job ends terminally as `failed`.

### Handler timeout — **read this carefully**

```js
createWorker({ handlers, handlerTimeoutMs: 5 * 60 * 1000 })
```

`handlerTimeoutMs` (default 5 min) is a **soft timeout**. When it fires:

1. The SDK rejects the wrapping promise with `Error('handler "<type>" timed out after Nms')`.
2. The job is reported as failed and subject to retry like any other failure.
3. **The handler function itself is NOT killed.** Node cannot cancel a promise; the handler continues to run whatever async work it started, and can still make HTTP calls, write to databases, or log to `ctx.log` even after the job has been reported failed.

This is a footgun for handlers that start external side-effects. Recommended patterns:

- **Use `AbortController` yourself.** Give every external call a signal, and plumb it from a timer you own:
  ```js
  async (job, ctx) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 4 * 60 * 1000);
    try {
      return await externalCall({ signal: ac.signal });
    } finally {
      clearTimeout(timer);
    }
  }
  ```
- **Design the handler to be restartable.** If the job is retried because you timed out, the retry must do the right thing even though the first attempt may still be running somewhere.

## `createWorker` options

```js
createWorker({
  apiKey,            // falls back to init()'s globalConfig.apiKey
  baseUrl,           // falls back to init()'s globalConfig.baseUrl / ASYNCOPS_URL / https://api.asyncops.com
  handlers,          // { [type]: async (job, ctx) => result }  REQUIRED, non-empty
  pollInterval,      // ms between polls when the last poll picked up a job.       default 1000
  idlePollInterval,  // ms between polls when the last poll returned nothing.      default 2000
  handlerTimeoutMs,  // soft handler timeout. default 5 * 60 * 1000 (5 min)
  onError,           // (err, ctx) => void — SDK-level errors.  default console.error
  logger,            // object with .log and .error.            default console
})
```

### About `onError`

Called for SDK-level problems, **not** for handler exceptions (those are automatically reported to AsyncOps as job failures). The `ctx` argument tells you which stage failed:

```js
onError: (err, ctx) => {
  // ctx.stage is one of:
  //   'fetch'   → GET /jobs/next failed (network, 5xx)
  //   'dispatch'→ job came back but no handler matches its type
  //   'handler' → handler threw; err is the handler's error
  //               ctx.jobId, ctx.type populated
  //   'fail'    → the subsequent POST /jobs/:id/fail call itself failed
  //   'log'     → ctx.log() fire-and-forget append failed
  //   'loop'    → the outer loop caught an unexpected exception
  console.error('[worker]', ctx.stage, ctx.jobId || '', err.message);
}
```

The `handler` stage is special: the error **has already been reported to AsyncOps**. `onError` is just your chance to log it locally or page someone.

## Log cap

Each job retains the last **500** `ctx.log()` entries. Older lines are dropped silently inside Mongo via a `$slice` window — there is no truncation marker in the log stream, so a noisy handler that logs in a tight loop will fill its window and older lines will vanish.

The API prints a single `console.warn` when a job first crosses the cap:

```
[jobs] log cap reached for job <id> — only the last 500 entries are retained; older logs are discarded. See docs/workers.md#log-cap.
```

The warning fires **once per job**; it does not repeat for subsequent writes on the same job. If you see this in API stdout, treat it as a pointer that the handler is over-logging, not as a per-log throttle.

**What to do:**

- Don't log inside tight loops. Batch or sample.
- If you legitimately need more than 500 log lines (e.g. streaming progress of a 10k-row import), ship those lines to your own logging stack and only `ctx.log` the checkpoints.
- Logs are a debugging aid, not a durable audit trail — treat them as such.

## Scaling out

You scale workers by running more processes. There is no internal clustering — each worker is a standalone Node process.

- **Same handler set, many replicas.** Two workers with identical `handlers` maps can run anywhere. The server-side atomic claim on `/jobs/next` guarantees each job is picked up by exactly one of them.
- **Different handler sets, different processes.** Run one worker per fleet (e.g. one for `send-email`, one for `generate-report`) if you want different scaling limits, memory profiles, or deploy cadences. There is no affinity — any job of type `T` can be picked up by any worker that registered `T`.
- **There is no worker identity.** The server doesn't know which worker claimed a job — the dashboard can't show "claimed by worker-04". If you need this, stamp it yourself inside the handler: `await ctx.log('worker=' + os.hostname())`.

Concurrency inside a single worker process is **1**. The polling loop runs one handler at a time. If you want per-process concurrency, run multiple worker processes.

## The stalled-job path

If a worker claims a job and then dies before reporting back (OOM kill, SIGKILL, host reboot, network partition), AsyncOps does **not** immediately re-claim. BullMQ holds the internal lock for `JOB_LOCK_DURATION_MS` (default **10 minutes**). After that:

1. BullMQ declares the internal processor stalled and re-runs it.
2. The API flips the Mongo doc back to `pending` with an incremented `attempts`.
3. Any worker polling for that `type` will pick it up on the next `nextJob` call.

**Implication:** a killed worker means its in-flight jobs are delayed by up to `JOB_LOCK_DURATION_MS` before another worker can touch them. For low-latency work (user-facing waits, payment confirmations), reduce this via the `JOB_LOCK_DURATION_MS` env var on the API — but be aware that shortening it too far risks marking healthy slow handlers as stalled.

## Graceful shutdown

```js
const worker = createWorker({ /* ... */ });
worker.start();

process.on('SIGTERM', async () => {
  await worker.stop();
  process.exit(0);
});
```

`worker.stop()`:

1. Flips an internal `running` flag to `false`.
2. Cancels the idle-sleep timer so the loop wakes up immediately.
3. **Waits for the in-flight handler (if any) to finish** before resolving.

Use this in any supervised environment (systemd, Docker, Kubernetes). Match it with a platform that sends SIGTERM and waits a few seconds before SIGKILL — that way rolling deploys are safe: the outgoing worker finishes its current handler, a new worker picks up the next job, and the Mongo record stays consistent.

## Deploying workers

Workers run wherever you run Node. Pick any of:

| Host | How |
|---|---|
| **systemd (VM)** | `Restart=always`, set env vars in the unit file |
| **Docker** | `CMD ["node", "worker.js"]`, add a restart policy |
| **Kubernetes** | One `Deployment` per worker image, `replicas: N`, `terminationGracePeriodSeconds: 60` |
| **Fly.io / Render / Railway** | "Background worker" / "Worker" service, start command `node worker.js` |
| **Laptop (dev)** | `node worker.js` |

Only two env vars are required:
- `ASYNCOPS_API_KEY` — the `ak_live_…` key.
- `ASYNCOPS_URL` — only if you're self-hosting or staging. Defaults to `https://api.asyncops.com`.

### Docker example

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY worker.js ./
CMD ["node", "worker.js"]
```

```bash
docker build -t my-worker .
docker run --rm \
  -e ASYNCOPS_API_KEY=ak_live_... \
  -e ASYNCOPS_URL=https://api.asyncops.com \
  my-worker
```

### Kubernetes snippet

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: asyncops-worker
spec:
  replicas: 3
  selector:
    matchLabels: { app: asyncops-worker }
  template:
    metadata:
      labels: { app: asyncops-worker }
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: worker
          image: myregistry/my-worker:latest
          env:
            - name: ASYNCOPS_API_KEY
              valueFrom: { secretKeyRef: { name: asyncops, key: api-key } }
            - name: ASYNCOPS_URL
              value: https://api.asyncops.com
```

`terminationGracePeriodSeconds: 60` gives your handler time to finish after SIGTERM. Tune this to your real handler runtimes.

## Things that can go wrong

| Symptom | Cause | Fix |
|---|---|---|
| Worker prints `started` then nothing | No jobs of any registered type; perfectly normal when idle | Submit a job to verify |
| Worker prints `401 invalid API key` in a loop | Wrong or revoked key | Regenerate from the dashboard; restart worker |
| Jobs go `pending` and never run | No worker has a handler for that `type`, OR the worker crashed silently | Check the dashboard banner; check worker logs |
| Jobs run more than once for a "successful" run | Handler didn't call complete within `JOB_LOCK_DURATION_MS`, OR network partition between worker and API | Make handlers idempotent; shorten the timeout only after measuring |
| `attempts` is 0 in the handler | Race between `POST /jobs` and the BullMQ proxy worker | Don't rely on `attempts === 1` for first-run detection; use an external sentinel |
| Handler timed out, job went `failed`, code still running | `handlerTimeoutMs` is soft — Node can't kill a function | Add your own `AbortController` inside the handler |
| Worker killed mid-handler, job delayed 10 minutes | Stalled-job recovery at `JOB_LOCK_DURATION_MS` | Lower `JOB_LOCK_DURATION_MS` on the API, or use shorter handlers |

See [debugging.md](debugging.md) for how to read failures, and [jobs.md](jobs.md) for idempotency and payload design.
