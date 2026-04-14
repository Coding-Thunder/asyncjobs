# SYSTEM.md — AsyncOps

## 1. System overview

AsyncOps is a hosted control plane for async jobs. A user application submits
`{ type, data }` jobs over HTTPS. The user's own worker process (running the
AsyncOps SDK) pulls jobs by type, runs a handler in-process, and reports the
result back over HTTPS. AsyncOps persists job state, tracks attempts, captures
logs, drives retries, and exposes a dashboard and REST/MCP interfaces for
inspection and control.

AsyncOps never executes user handler code. Execution always happens inside a
user-operated worker process.

## 2. Architecture

### 2.1 Hosted by AsyncOps

- **API server** — [apps/api/](apps/api/). Node/Express. Entry point
  [index.js](apps/api/index.js). Owns all reads and writes to MongoDB. Hosts
  every HTTP route listed in §5. Starts the internal BullMQ proxy worker
  in-process at boot ([index.js:44](apps/api/index.js#L44)).
- **MongoDB** — system of record. Collections: `users`, `api_keys`, `jobs`.
  Indexes created at startup in [db.js](apps/api/db.js).
- **Redis + BullMQ** — internal queue used only by the API process. Not
  exposed to users. Driven entirely by [queue.js](apps/api/queue.js).
- **Dashboard** — [apps/web/](apps/web/) (Next.js). Browser client of the API.
- **MCP server** — [internal/mcp/index.js](internal/mcp/index.js). A
  stdio JSON-RPC shim over the REST API exposing three tools
  (`create_job`, `get_job_status`, `retry_job`).
- **E2E tests** — [internal/e2e/](internal/e2e/) (Playwright).

### 2.2 Run by the user

- **User application** — calls the API (via SDK or raw HTTP) to create and
  query jobs.
- **User worker process** — a long-running Node process that uses
  `createWorker` from [packages/sdk/index.js](packages/sdk/index.js) to
  register handlers and poll `/jobs/next`. Every handler runs here, in the
  user's own process space.

The SDK package is [packages/sdk/](packages/sdk/), published as
`asyncops-sdk`. It is the only dependency a user needs.

## 3. Job lifecycle

States: `pending` → `processing` → (`completed` | `failed`). The full path
for a normal job:

1. **Create** — User calls `POST /jobs { type, data }` (optionally with
   `Idempotency-Key`). The API
   ([jobRoutes.js:87](apps/api/routes/jobRoutes.js#L87)):
   1. Validates `type` against `/^[a-zA-Z0-9._:\-]{1,100}$/` and that `data`
      is JSON-serializable.
   2. Enforces `user.jobCountMonthly < plan.monthlyJobLimit` (plans in
      [plans.js](apps/api/plans.js): free=1000, pro=50000). Rolls the counter
      over at UTC month boundaries via `ensureMonthlyReset`.
   3. If an idempotency key is present, performs a pre-lookup on
      `(userId, idempotencyKey)` and returns the existing job if found.
   4. Inserts the new job doc with `status: 'pending'`, `attempts: 0`,
      `logs: [initialLog]`.
   5. Increments `users.jobCountMonthly`.
   6. Publishes initial `status` and `log` SSE events.
   7. Calls `enqueueJob(idStr)` which adds a BullMQ job with
      `attempts: MAX_JOB_ATTEMPTS` and exponential backoff
      (`JOB_BACKOFF_DELAY_MS`).
   8. Returns `201 { id, type, status: 'pending' }`.

   If the BullMQ enqueue throws, the Mongo doc is left as `pending`; the
   error is logged and the operator may recover via `POST /jobs/:id/retry`
   ([jobRoutes.js:182-188](apps/api/routes/jobRoutes.js#L182-L188)).

2. **Proxy dispatch** — The in-process BullMQ worker
   ([queue.js:114](apps/api/queue.js#L114)) pulls the BullMQ message and
   runs its processor. The processor calls
   `flipToPending(mongoJobId, attemptsMade + 1)`, which unconditionally
   `$set`s the Mongo doc to `status: 'pending'`, `attempts: <n>`,
   `error: null`, then stores a `{ resolve, reject }` entry in the
   in-process `pending` map keyed by the Mongo job id, and awaits that
   promise. BullMQ holds the job's lock for `JOB_LOCK_DURATION_MS`
   (default 10 minutes).

   `attempts` is therefore the BullMQ attempt counter, set only by
   `flipToPending`. The `GET /jobs/next` claim does **not** increment it.

3. **Worker claim** — The user's worker (SDK) polls
   `GET /jobs/next?types=a,b,...`. The API atomically runs
   `findOneAndUpdate({ userId, status: 'pending', type: {$in: types} })`
   with `sort: { createdAt: 1 }` and `$set: { status: 'processing' }`
   ([jobRoutes.js:225](apps/api/routes/jobRoutes.js#L225)). This is the
   `pending → processing` transition. The API appends a `Worker picked up
   job` log entry and publishes a `status` SSE event.

4. **Handler execution** — In the user's worker process, the SDK calls the
   registered handler as `handler(job, ctx)`, where `ctx.log(message)` posts
   to `POST /jobs/:id/logs`
   ([sdk/index.js:340-362](packages/sdk/index.js#L340-L362)). The handler
   runs inside `withTimeout(..., handlerTimeoutMs)`; default
   `handlerTimeoutMs` is 5 minutes.

5. **Report success** — SDK calls `POST /jobs/:id/complete { result }`. API
   sets `status: 'completed'`, stores `result`, appends a `Job completed`
   log entry, publishes an SSE `status` event, then calls
   `signalComplete(idStr, result)` which resolves the in-memory promise;
   BullMQ marks its job successful.

6. **Report failure** — SDK calls `POST /jobs/:id/fail { error }`. API sets
   `status: 'failed'`, stores `error`, appends a log entry, publishes an
   SSE event, then calls `signalFail(idStr, errMsg)`, rejecting the
   in-memory promise. BullMQ either schedules another attempt (exponential
   backoff) — in which case step 2 runs again and the doc is flipped back to
   `pending` — or, if `attemptsMade >= MAX_JOB_ATTEMPTS`, the proxy
   worker's `failed` handler calls `markFailedTerminal(idStr, errMsg)`,
   which re-asserts the terminal `failed` state and publishes a final
   `status` event.

7. **Stalled workers** — If a worker claims a job and never reports back,
   the BullMQ lock expires after `JOB_LOCK_DURATION_MS`. BullMQ re-runs the
   processor, which re-executes step 2 with an incremented attempt number.
   The next idle worker can then claim the job. There is no separate
   watchdog.

8. **Manual retry** — `POST /jobs/:id/retry` sets the doc to
   `status: 'pending'`, clears `result` and `error`, appends a `Job retry
   requested` log entry, publishes a `status` event, and calls
   `enqueueJob(idStr)` to add a fresh BullMQ job. This is the only way to
   restart a terminally-failed job.

### 3.1 Logs

Logs are an embedded capped array on the job document, bounded by
`MAX_LOGS_PER_JOB = 500`
([jobRoutes.js:21](apps/api/routes/jobRoutes.js#L21)) using
`$push` with `$slice: -500`. `POST /jobs/:id/logs` appends one entry. Every
append publishes an SSE `log` event. `GET /jobs/:id` returns the full
array under the top-level `logs` field alongside the job body.

### 3.2 SSE stream

`GET /jobs/:id/stream` opens a text/event-stream. It first emits a synthetic
`status` event with the current job state, replays the entire embedded
`logs` array as `log` events, then subscribes the response to an in-memory
listener map ([events.js](apps/api/events.js)). A 25-second heartbeat
keeps the connection alive. Browsers (which cannot set custom headers on
`EventSource`) can pass `?token=<jwt-or-api-key>` and the route middleware
promotes it to an `Authorization: Bearer` header
([jobRoutes.js:25-30](apps/api/routes/jobRoutes.js#L25-L30)).

## 4. Worker model

- Workers are **user-operated Node processes**. AsyncOps does not host
  them, spawn them, or have network access to them.
- A worker is created via
  `createWorker({ apiKey, handlers, pollInterval?, idlePollInterval?, handlerTimeoutMs?, onError?, logger? })`
  ([sdk/index.js:278](packages/sdk/index.js#L278)).
- `handlers` is a map `{ [jobType]: async (job, ctx) => result }`. The set
  of keys becomes the `types` query parameter on `GET /jobs/next`.
- The worker loop:
  1. Call `client.nextJob({ types })`.
  2. If `job` is `null`, wait `idlePollInterval` ms (default 2000) and
     loop.
  3. If `job.type` has no registered handler, call
     `POST /jobs/:id/fail` with an error message and loop.
  4. Otherwise, run `handler(job, ctx)` wrapped in `withTimeout` using
     `handlerTimeoutMs` (default 5 min). On resolve → `completeJob`. On
     reject → `failJob(jobId, err.message)`. Then wait `pollInterval` ms
     (default 1000) and loop.
- `ctx.log(message)` is the only worker-facing helper passed to handlers.
  It calls `POST /jobs/:id/logs`.
- `start()` begins the loop; `stop()` sets `running = false` and awaits
  the in-flight iteration. `runOnce()` executes one iteration for tests.
- Workers authenticate with an `ak_live_*` API key via
  `Authorization: Bearer`. They never connect to Redis or MongoDB.
- `JobsClient.subscribe(jobId, cb)` uses native `EventSource` when
  `window` is defined; otherwise it falls back to polling `GET /jobs/:id`
  every 2 seconds ([sdk/index.js:204-271](packages/sdk/index.js#L204-L271)).

## 5. API responsibilities

All routes live under [apps/api/routes/](apps/api/routes/) and pass
through `requireAuth` ([auth.js:45](apps/api/auth.js#L45)), which accepts
either a JWT (issued by `POST /auth/login`) or an `ak_live_*` API key in
`Authorization: Bearer`. Every `/jobs*` route is scoped by
`req.user._id`; there is no cross-tenant read path except `/admin/*`,
which requires `role === 'admin'`.

| Method | Path | Purpose | Caller |
|---|---|---|---|
| POST | `/auth/signup` | Create user account | dashboard |
| POST | `/auth/login` | Issue JWT | dashboard |
| POST | `/api-keys` | Create `ak_live_*` key | dashboard |
| GET  | `/api-keys` | List keys (metadata only) | dashboard |
| DELETE | `/api-keys/:id` | Revoke key | dashboard |
| POST | `/jobs` | Create job | user app / MCP |
| GET  | `/jobs` | List current user's jobs (≤200) | dashboard / app |
| GET  | `/jobs/:id` | Job detail + embedded logs | dashboard / app / MCP |
| POST | `/jobs/:id/retry` | Re-queue a job | dashboard / app / MCP |
| GET  | `/jobs/:id/stream` | SSE status + log stream | dashboard / app |
| GET  | `/jobs/next?types=…` | Atomically claim next pending job | SDK worker |
| POST | `/jobs/:id/complete` | Report success | SDK worker |
| POST | `/jobs/:id/fail` | Report failure | SDK worker |
| POST | `/jobs/:id/logs` | Append a log line | SDK worker |
| GET  | `/health` | Liveness | — |
| `/admin/*` | — | Admin-only endpoints in [adminRoutes.js](apps/api/routes/adminRoutes.js) | admin |
| `/` | — | User profile routes in [userRoutes.js](apps/api/routes/userRoutes.js) | dashboard |

The API is solely responsible for:

- Persisting job state and transitions.
- Enforcing per-user ownership on every read and write.
- Enforcing plan limits on job creation.
- Running the BullMQ proxy worker (retries, stalled-lease recovery).
- Publishing SSE events for status and log changes.
- Appending log entries and bounding the log array to 500 entries.

The API does **not** run user handler code.

### 5.1 Data model

Collection `jobs` — shape inferred from
[jobRoutes.js:137-149](apps/api/routes/jobRoutes.js#L137-L149):

| Field | Type | Set by |
|---|---|---|
| `_id` | ObjectId | insert |
| `userId` | ObjectId | insert; every route filters by this |
| `type` | string | insert |
| `status` | `pending` \| `processing` \| `completed` \| `failed` | insert + transitions |
| `data` | any JSON or `null` | insert |
| `result` | any JSON or `null` | `/complete` |
| `error` | string or `null` | `/fail`, `markFailedTerminal` |
| `attempts` | number | `flipToPending` (set to BullMQ `attemptsMade + 1`); 0 at insert |
| `idempotencyKey` | string or `null` | insert |
| `logs` | array of `{ id, message, timestamp }` | insert + `appendLog`, capped at 500 |
| `createdAt`, `updatedAt` | Date | insert + every mutation |

Indexes created in [db.js:13-23](apps/api/db.js#L13-L23):

- `users`: unique `{ email }`.
- `jobs`: `{ userId: 1, createdAt: -1 }`.
- `jobs`: `{ userId: 1, status: 1, type: 1, createdAt: 1 }` — backs the
  `/jobs/next` claim.
- `jobs`: **partial** unique `{ userId: 1, idempotencyKey: 1 }` with
  `partialFilterExpression: { idempotencyKey: { $type: 'string' } }`.
- `api_keys`: `{ userId: 1, createdAt: -1 }` and `{ prefix: 1 }`.

Collections `users` and `api_keys` carry auth and plan/usage state. There
is no separate `logs` collection and no `schedules` collection.

## 6. Execution responsibility

This is the contract that distinguishes AsyncOps from a generic job queue:

- **User handlers run only inside the user's worker process.** The API
  process in `apps/api/` never imports, loads, or invokes user handler
  code.
- The API's internal BullMQ "proxy" worker exists solely to drive retries
  and stalled-lease recovery. Its processor function does two things:
  flip the Mongo doc to `pending`, and await an in-process promise that
  is fulfilled by the `/complete` or `/fail` HTTP handlers.
- Any business-logic effect (sending email, calling a third-party API,
  writing to the user's database, etc.) is the user's responsibility and
  happens inside their handler, in their process, on their network.
- Handler timeouts, concurrency, CPU, and memory are bounded by the
  user's worker. AsyncOps only bounds the overall BullMQ lock
  (`JOB_LOCK_DURATION_MS`) and the SDK's `handlerTimeoutMs`.
- If a worker is not running, jobs remain `pending` indefinitely
  (until `POST /jobs/:id/retry` or until BullMQ exhausts attempts via
  stalled-lease cycling, whichever applies).

## 7. Constraints

### 7.1 Runtime configuration

From [queue.js](apps/api/queue.js), [db.js](apps/api/db.js),
[index.js](apps/api/index.js), and [auth.js](apps/api/auth.js):

| Variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017` | Mongo connection |
| `MONGODB_DB` | `asyncops` | Database name |
| `REDIS_URL` | `redis://localhost:6379` | BullMQ connection |
| `QUEUE_NAME` | `asyncops-jobs` | BullMQ queue name (no `:`) |
| `MAX_JOB_ATTEMPTS` | `3` | BullMQ `attempts` per job |
| `JOB_BACKOFF_DELAY_MS` | `2000` | Exponential backoff base |
| `JOB_LOCK_DURATION_MS` | `600000` | BullMQ lock / stalled window |
| `QUEUE_CONCURRENCY` | `500` | In-process BullMQ worker concurrency |
| `JWT_SECRET` | `dev-secret-change-me` | JWT signing secret |
| `JWT_EXPIRES_IN` | `7d` | JWT TTL |
| `PORT` | `4000` | API HTTP port |
| `CORS_ORIGIN` | `*` (true) | Comma-separated allowed origins |

### 7.2 Known races and single-replica assumption

- **API runs as a single replica.** `queue.js` stores BullMQ proxy
  promises in an in-process `Map`, and `events.js` stores SSE listeners
  in an in-process `Map`. Running multiple API replicas breaks both:
  `signalComplete`/`signalFail` only resolve on the replica whose proxy
  processed the BullMQ message, so a job handled on another replica will
  re-run after the stalled-lease window; and SSE events published on one
  replica are never seen by clients connected to another.
- **Proxy-vs-claim race.** `POST /jobs` inserts the Mongo doc as
  `pending` and then calls `enqueueJob`. A worker poll that lands in the
  window between insert and BullMQ delivery can claim, run, and complete
  the job before the proxy's processor runs. At that point
  `signalComplete` finds no entry in `pending` and is a no-op; the proxy
  then calls `flipToPending`, which **unconditionally** overwrites the
  doc back to `status: 'pending'`. BullMQ will then drive the job again
  after the stalled-lease window. Handlers must be idempotent.
  [queue.js:79-98](apps/api/queue.js#L79-L98),
  [jobRoutes.js:137-183](apps/api/routes/jobRoutes.js#L137-L183).

### 7.3 Payload and validation limits

- Express JSON body limit: `1mb` ([index.js:21](apps/api/index.js#L21)).
- `type` must match `^[a-zA-Z0-9._:\-]{1,100}$`.
- `data` must be JSON-serializable (`JSON.stringify` must not throw).
- `logs` array is capped at 500 entries per job.
- `GET /jobs` returns at most 200 jobs, sorted by `createdAt` desc.
- Plan limits: free=1000 jobs/month, pro=50000 jobs/month, reset at UTC
  month rollover.

### 7.4 Auth

- JWT is issued by `POST /auth/login` and signed with `JWT_SECRET`.
- API keys have format `ak_live_<random>`; only a bcrypt hash
  (`keyHash`) and an 8-char plaintext `prefix` are stored. Lookup scans
  all candidates with the same `prefix` and bcrypt-compares
  ([auth.js:20-43](apps/api/auth.js#L20-L43)).
- A single `Authorization: Bearer <token>` header is used for both; the
  `ak_live_` prefix selects the API-key branch.

## 8. What AsyncOps is NOT

- **Not a place that runs user code.** AsyncOps never imports, evaluates,
  or otherwise executes the logic inside a job handler. Handlers run
  exclusively in the user's worker process.
- **Not a scheduler.** There is no cron, no delayed-job API, no
  `schedules` collection. Users trigger jobs from their own scheduler.
- **Not a push/webhook executor.** Workers pull via `GET /jobs/next`;
  AsyncOps does not call user endpoints.
- **Not a message bus.** There is no pub/sub, no fanout, no topics.
  Jobs have exactly one consumer: the next worker that claims them.
- **Not multi-tenant beyond per-user scoping.** There is no team, org,
  role-based access control, or shared-ownership model. The only roles
  are `user` and `admin`.
- **Not a billing system.** `plans.js` enforces a monthly job count
  ceiling; there is no payment, invoicing, or metering beyond that
  counter.
- **Not horizontally scalable as shipped.** The API is a single replica
  by design (see §7.2). Scaling out requires replacing the in-process
  `pending` and SSE listener maps with a shared transport.
- **Not a Redis/BullMQ gateway.** Redis and BullMQ are internal
  implementation details of the API process. Users have no access to
  them and no SDK path that touches them.

## 9. Items flagged as unclear from code

None. Every statement above is backed by a specific file reference. If
anything is later found to diverge from code, update this document
rather than the code comments.
