# SDK reference

> **Runtime:** Node.js 18+ only. The SDK is published as [`asyncops-sdk`](https://www.npmjs.com/package/asyncops-sdk). Workers (the processes that execute handlers) must be Node.js. Non-Node apps can still create and inspect jobs — see [REST access](#rest-access-from-other-languages) below.

## What is the SDK?

A thin HTTPS client for the AsyncOps API plus a polling loop that runs your handlers. It is **not** a queue — the queue is inside AsyncOps. The SDK only:

1. Signs every request with your API key.
2. Exposes `createJob` / `getJob` / `retryJob` etc. as plain async methods.
3. Provides `createWorker`, which long-polls `/jobs/next` for work and dispatches it to your handlers.

Everything goes over HTTPS. The SDK never touches Redis or MongoDB — those are internal to AsyncOps.

## When to use it

| You're doing... | Use... |
|---|---|
| Submitting jobs from a web app, cron, or script | `client.createJob` (or a plain HTTP call) |
| Running a long-lived process that executes handlers | `createWorker` |
| Inspecting a job's status from code | `client.getJob`, `client.subscribe` |
| Retrying a failed or completed job | `client.retryJob` |
| Managing API keys from code (CI, scripts) | `client.createApiKey` / `listApiKeys` / `deleteApiKey` |

## Install

```bash
npm install asyncops-sdk
```

## Configuration

Call `init()` once per process. Every client and worker after that picks up the credentials automatically — you don't have to pass them around.

```js
const asyncops = require('asyncops-sdk');

asyncops.init({
  apiKey: process.env.ASYNCOPS_API_KEY,
  baseUrl: process.env.ASYNCOPS_URL, // optional, default https://api.asyncops.com
});
```

| Option | Env var (tutorial convention) | Default | Required |
|---|---|---|---|
| `apiKey` | `ASYNCOPS_API_KEY` | — | yes |
| `baseUrl` | `ASYNCOPS_URL` | `https://api.asyncops.com` | no |

The SDK itself only reads `ASYNCOPS_URL` from the environment (as a last-resort default in the `JobsClient` base URL). It does **not** automatically read `ASYNCOPS_API_KEY` from `process.env`. You always pass the key explicitly through `init()` or a constructor.

If the API key is missing when a request is made:

```
AsyncOps: API key missing. Call asyncops.init({ apiKey }) once at startup,
or pass { apiKey } explicitly to new JobsClient() / createWorker().
```

### Per-client override

Any `JobsClient` can take its own key, bypassing the global config. Useful for tests or multi-tenant admin tools.

```js
const { JobsClient } = require('asyncops-sdk');
const staging = new JobsClient({
  apiKey: process.env.ASYNCOPS_STAGING_KEY,
  baseUrl: 'https://staging-api.asyncops.com',
});
```

## The shared `client`

`client` is a pre-built `JobsClient` that lazily reads the global config. You can import it at the top of any file and use it after `init()` runs:

```js
// anywhere in your codebase
const { client } = require('asyncops-sdk');

await client.createJob({ type: 'send-email', data: { to: 'you@example.com' } });
```

Think of `client` as equivalent to writing `new JobsClient()` in one shared module — it just saves you the import.

---

## `JobsClient` methods

All methods return a Promise. All methods that require auth throw the "API key missing" error above if neither `init()` nor a constructor-supplied key is in place. HTTP errors throw with `err.message` (human-readable) and `err.status` (HTTP code).

### Jobs

#### `createJob({ type, data?, idempotencyKey? }) → { id, type, status }`

```js
const { id } = await client.createJob({
  type: 'send-email',
  data: { to: 'alice@example.com', subject: 'hi' },
  idempotencyKey: `welcome:${userId}`, // optional
});
```

- `type` is required. Must match `^[a-zA-Z0-9._:\-]{1,100}$` — no spaces, slashes, or unicode. The API returns `400` otherwise.
- `data` is any JSON-serializable value. The API body limit is 1 MB total (request-wide).
- `idempotencyKey` is optional. If a job with that key already exists on your account, the response is the existing job with an extra `idempotent: true` field, and the HTTP status is `200` (not `201`). The key can also be passed as an `Idempotency-Key` HTTP header if you go via REST.
- New jobs return `status: 'pending'` immediately. That's the insertion state, not the final state — see the [job lifecycle in jobs.md](jobs.md#lifecycle).

**Edge cases**
- `429 Monthly limit reached (N). Upgrade to Pro for more.` — you've hit the plan's monthly job cap (free: 1000, pro: 50000). The counter resets on the 1st of the month UTC.
- `401 invalid API key` — key was revoked, never existed, or was copy-pasted wrong.
- `400 request body is required` — SDK missed a JSON body (you shouldn't hit this using the SDK; only via raw REST).

#### `listJobs() → { jobs: [...] }`

```js
const { jobs } = await client.listJobs();
// jobs: [{ id, type, status, attempts, createdAt, updatedAt }, ...]
```

Returns the newest 200 jobs for the authenticated account, newest first. No pagination — if you need more than 200, filter on your side by time and use idempotency to chunk.

Note: the list response projects down to the listed fields only. Use `getJob(id)` for the full document (data, result, error, logs).

#### `getJob(id) → { job, logs }`

```js
const { job, logs } = await client.getJob(id);
// job:  { id, type, status, data, result, error, attempts, createdAt, updatedAt, idempotencyKey }
// logs: [{ id, message, timestamp }, ...]  — up to 500 entries
```

`logs` is an array of `{ id, message, timestamp }`. It is **capped at 500 entries per job** by an `$push` with `$slice: -500`; older entries drop off silently. If your handler needs to persist more, write them to your own storage.

#### `retryJob(id) → { id, status: 'pending' }`

Re-queues any job — `pending`, `processing`, `completed`, or `failed`. The API clears `result` and `error`, sets status back to `pending`, appends a `"Job retry requested"` log line, and re-enqueues in BullMQ.

> **Warning — do not retry a job that is currently `processing`.** You will create a race between the in-flight handler and the new claim. Retry only jobs that are `completed` or `failed`.

### Realtime subscription

#### `subscribe(jobId, callback) → unsubscribe()`

```js
const unsubscribe = client.subscribe(jobId, (event) => {
  if (event.type === 'status') console.log('status →', event.data.status);
  if (event.type === 'log')    console.log('log    →', event.data.message);
});

// later
unsubscribe();
```

Two implementation paths, picked at call time:

- **Browser / anywhere with `EventSource` and `window`** — opens `GET /jobs/:id/stream?token=...`, which is a Server-Sent Events endpoint. Low-latency, pushes every status and log event the moment it's published on the server.
- **Node** — falls back to polling `GET /jobs/:id` every 2 seconds and diffing on `job.status` and `logs.length`.

**Edge cases with the Node fallback**
- Log lines produced faster than the 2 s poll will still be delivered (the diff walks from the last known log count), **unless** the total log count exceeds 500 between polls — then the oldest lines are gone and you'll miss them.
- Status transitions that happen and revert between polls are invisible. Example: `pending → processing → failed → pending` (first retry) inside a 2-second window will only surface as a single `pending`. Use SSE (from a browser) if you need every transition.

### API key management

These are handy for CI scripts that provision an environment.

#### `createApiKey({ name }) → { id, name, key, prefix, createdAt }`

```js
const newKey = await client.createApiKey({ name: 'ci-runner' });
console.log(newKey.key); // ak_live_... — shown ONLY here, never again
```

The `key` field is the raw `ak_live_…` string. The server stores only a bcrypt hash plus the 8-char prefix after `ak_live_`. **Save `newKey.key` somewhere immediately** — it is not retrievable.

Note: `createApiKey` requires auth with an **existing** credential (either a JWT from `login` or another API key). It's a meta-operation; you need to already be authenticated to mint a new key.

#### `listApiKeys() → { keys: [...] }`

```js
const { keys } = await client.listApiKeys();
// [{ id, name, prefix, createdAt, lastUsedAt }, ...]
```

Returns metadata only — you cannot retrieve a raw key after creation.

#### `deleteApiKey(id) → { deleted: true }`

Revokes the key. The next request using it returns `401 invalid API key`.

### Worker-facing methods (usually called by `createWorker`)

You rarely call these directly. They are the primitives `createWorker` uses and are documented here for completeness if you're implementing a custom worker loop.

- `nextJob({ types: [string] })` → `{ job: {...} | null }`. Atomically claims the oldest `pending` job whose `type` is in the list and flips it to `processing`. Throws if `types` is empty.
- `completeJob(jobId, result)` — marks the job `completed`. `result` can be any JSON value; `undefined` is serialized as `null`.
- `failJob(jobId, errorOrMessage)` — marks the job `failed` (tentative). The API will retry with backoff if attempts remain. If `errorOrMessage` is an `Error` instance, its `.message` is used.
- `logJob(jobId, message)` — appends one log line. Fire-and-forget in `createWorker` (errors go to `onError`, job continues).

## `createWorker`

See [workers.md](workers.md) for the full worker guide and lifecycle. A minimal worker:

```js
const { init, createWorker } = require('asyncops-sdk');

init({ apiKey: process.env.ASYNCOPS_API_KEY });

const worker = createWorker({
  handlers: {
    'send-email': async (job, ctx) => {
      await ctx.log(`sending to ${job.data.to}`);
      return { sent: true };
    },
  },
});

worker.start();
```

`createWorker` returns `{ start, stop, runOnce, types, client }`. `start` returns a Promise that resolves only when `stop()` is called — you don't usually await it.

## Error handling

Every method throws a plain `Error` on any non-2xx response. The error carries:

- `err.message` — `"AsyncOps POST /jobs: <server error message>"`.
- `err.status` — the HTTP status code.

```js
try {
  await client.createJob({ type: 'send-email', data: { to } });
} catch (err) {
  switch (err.status) {
    case 400: console.error('bad request:', err.message); break;
    case 401: return reauth();
    case 404: console.error('job not found'); break;
    case 429: console.error('plan limit; try again next month'); break;
    default:  throw err;
  }
}
```

### Status code reference

| Status | When | What to do |
|---|---|---|
| `400` | Invalid `type` regex, empty body, invalid JSON, empty `types` on `nextJob` | Fix the input |
| `401` | Missing/invalid/revoked API key or expired JWT | Re-issue credentials |
| `403` | Admin-only endpoint called without admin role | Not applicable to normal SDK calls |
| `404` | Job id doesn't exist **or doesn't belong to your account** | Check the id; cross-account access is denied as 404 |
| `413` | Request body over 1 MB | Shrink `data`; pass a reference, not a blob |
| `429` | Plan monthly job limit reached | Wait for monthly reset or upgrade plan |
| `500` | Server-side error | Retry with backoff; file a bug if persistent |

## REST access from other languages

The SDK is a thin wrapper around a REST API. You can submit, inspect, and retry jobs from any language. Workers (the handler loop) still have to be Node.js — there is no non-Node worker runtime yet.

### Headers common to every authenticated request

```
Authorization: Bearer ak_live_...
Content-Type: application/json
```

### Create a job

```bash
curl -X POST "$ASYNCOPS_URL/jobs" \
  -H "Authorization: Bearer $ASYNCOPS_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: invoice-42-charge" \
  -d '{"type":"charge-card","data":{"invoiceId":"inv_42"}}'
```

**Fresh job response** (`201`):
```json
{ "id": "65f...", "type": "charge-card", "status": "pending" }
```

**Idempotent replay response** (`200`, same body shape plus `idempotent: true`):
```json
{ "id": "65f...", "type": "charge-card", "status": "completed", "idempotent": true }
```

Note the status code differs: `201` for a fresh insert, `200` for an idempotent hit. Your client should treat both as success.

### Get a job

```bash
curl "$ASYNCOPS_URL/jobs/$JOB_ID" \
  -H "Authorization: Bearer $ASYNCOPS_API_KEY"
```

```json
{
  "job": {
    "id": "...",
    "type": "send-email",
    "status": "completed",
    "data": { "to": "..." },
    "result": { "messageId": "m_..." },
    "error": null,
    "attempts": 1,
    "createdAt": "...",
    "updatedAt": "...",
    "idempotencyKey": null
  },
  "logs": [
    { "id": "...", "message": "Job created",         "timestamp": "..." },
    { "id": "...", "message": "Worker picked up job","timestamp": "..." },
    { "id": "...", "message": "sending to ...",      "timestamp": "..." },
    { "id": "...", "message": "Job completed",       "timestamp": "..." }
  ]
}
```

### Retry a job

```bash
curl -X POST "$ASYNCOPS_URL/jobs/$JOB_ID/retry" \
  -H "Authorization: Bearer $ASYNCOPS_API_KEY"
```

### Stream a job (SSE)

```bash
curl -N "$ASYNCOPS_URL/jobs/$JOB_ID/stream?token=$ASYNCOPS_API_KEY" \
  -H "Accept: text/event-stream"
```

The SSE endpoint accepts the token either in the `Authorization` header or as a `?token=` query parameter — the query param exists because browsers' `EventSource` can't set custom headers.

See [workers.md](workers.md), [jobs.md](jobs.md), and [debugging.md](debugging.md) for usage patterns built on top of these primitives.
