# Hosting AsyncOps

This document is for running **AsyncOps itself** — the API, the Next.js dashboard, Mongo, and Redis. If you're a user of an already-hosted AsyncOps instance, you don't need any of this; install the SDK and point it at the URL your provider gave you.

## What is it and when to use it

Use this page when you are:

- Self-hosting AsyncOps for a team, a product, or a personal project.
- Setting up staging / preview environments of AsyncOps.
- Auditing the deployment before going to production.
- Debugging why an existing deployment is misbehaving.

You should already be comfortable with: Node.js in production, MongoDB, Redis, TLS termination, and whatever your compute host is (VMs, Kubernetes, Render, Fly.io, Railway).

## Topology

Four processes. The API and the Next.js dashboard are separate deployments; Mongo and Redis are managed services.

```
   ┌──────────────┐            ┌────────────────────────────┐       ┌──────────────┐
   │   apps/web   │───HTTPS───▶│         apps/api            │──────▶│   MongoDB   │
   │  (Next.js)   │            │  Express + requireAuth      │       │   (Atlas)   │
   │  SPA / SSR   │            │  /auth /jobs /api-keys ...  │       └──────────────┘
   └──────────────┘            │                              │      ┌──────────────┐
                               │  + BullMQ proxy Worker       │─────▶│    Redis    │
   user workers  ───HTTPS─────▶│    (in-process)              │      │ (Upstash/…) │
   (any network)               └────────────────────────────┘       └──────────────┘
```

Your **users' workers** can run anywhere a Node.js process can. They talk only to the API over HTTPS. They never touch Mongo or Redis.

## Critical constraint: the API is a single replica today

Read this before you size your deployment.

`apps/api/index.js` starts the BullMQ proxy worker in-process (`startProxyWorker()`), and two pieces of state it relies on are held in plain in-process JavaScript `Map`s:

1. **`pending` map in [`apps/api/queue.js`](../apps/api/queue.js)** — keyed by Mongo job id, holds the promise that BullMQ is awaiting. When a user's worker calls `POST /jobs/:id/complete`, the HTTP handler calls `signalComplete(id)`, which **looks up the promise in the local map**. If the HTTP request lands on a different API replica from the one running the BullMQ processor, the map lookup misses, the BullMQ promise is never resolved, and `JOB_LOCK_DURATION_MS` (10 min) later BullMQ declares the processor stalled and **re-runs the handler**. Result: handlers silently run twice under multi-replica.
2. **`listeners` map in [`apps/api/events.js`](../apps/api/events.js)** — keyed by job id, holds open SSE response streams. `publishEvent` writes to the local map only. An event published on replica A is not seen by dashboard clients connected to replica B.

Until these are replaced by Redis pub/sub (or some other cross-process coordinator), **run exactly one `apps/api` replica.** You can scale vertically — bigger instance, more CPU, higher `QUEUE_CONCURRENCY` — but not horizontally.

Horizontal scaling of **workers** (the user-run processes that execute handlers) is unaffected and works exactly as documented in [workers.md](workers.md). That's where real throughput scaling happens.

The Next.js dashboard is stateless and can run as many replicas as you like.

## Required managed services

| Service | Purpose | Recommended |
|---|---|---|
| **MongoDB** | State of truth: `users`, `api_keys`, `jobs` (with embedded logs) | MongoDB Atlas; the free tier is fine to start |
| **Redis** | BullMQ queue + retry backoff + stalled-lease detection | Upstash, Render, Railway, or self-hosted |
| **Node host** for `apps/api/` | Express + the in-process BullMQ proxy worker | Render, Railway, Fly.io, Heroku dynos, EC2, single K8s Pod |
| **Static / Node host** for `apps/web/` | Next.js dashboard | Vercel, Netlify, or the same Node host |

For production: put everything behind TLS. API keys flow through the `Authorization` header and a plaintext hop would be game over.

## Environment variables

All of the API's env vars are documented in [`apps/api/.env.example`](../apps/api/.env.example); copy that file to `apps/api/.env` for local development. For a deployed instance, set them in your platform's secret/env config.

### `apps/api/`

```bash
# HTTP
PORT=4000
# Comma-separated allow-list of browser origins for CORS. In production,
# unlisted origins are REJECTED (not silently permitted). In dev (NODE_ENV
# unset or != 'production'), the default is http://localhost:3000.
# ALLOWED_ORIGINS is the canonical name; CORS_ORIGIN is kept as a legacy alias.
ALLOWED_ORIGINS=https://app.asyncops.com,https://asyncops.com

# Set when the API is behind a reverse proxy / L7 load balancer so that
# req.ip reflects the real client for rate limiting. Accepts an integer hop
# count (e.g. `1`) or a recognized express value (`loopback`, IP, CIDR).
TRUST_PROXY=1

# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net
MONGODB_DB=asyncops

# Redis
REDIS_URL=rediss://default:pass@host:6379

# Auth — JWT_SECRET is REQUIRED in production. If unset (or left as the dev
# default "dev-secret-change-me"), the process exits 1 on boot so you can't
# accidentally ship with a publicly-known signing key.
JWT_SECRET=<long random string — ≥ 32 bytes of entropy>
JWT_EXPIRES_IN=7d

# Dashboard base URL — used to render the per-user email-verification link
# that gets printed to stdout (see "Email verification" below).
DASHBOARD_URL=https://app.asyncops.com

# Queue tuning (all optional, shown with defaults)
MAX_JOB_ATTEMPTS=3
JOB_BACKOFF_DELAY_MS=2000
JOB_LOCK_DURATION_MS=600000   # 10 min BullMQ lock / stalled-lease window
QUEUE_CONCURRENCY=500         # BullMQ proxy worker concurrency, this process only
QUEUE_NAME=asyncops-jobs      # must not contain ':' — BullMQ rejects those
```

Notes worth knowing:

- `ALLOWED_ORIGINS` (or legacy `CORS_ORIGIN`) is **comma-separated, exact-match**. In prod, any Origin not in the list is rejected — there is no wildcard mode. In dev the default is `http://localhost:3000`.
- `JWT_SECRET` is **fail-fast** in prod. If `NODE_ENV=production` and the secret is unset or equals the dev default, `apps/api/auth.js` logs an error and calls `process.exit(1)`. This is deliberate — shipping the dev default signing key would let anyone forge tokens.
- `JWT_SECRET` is read once at startup. Rotating it invalidates every JWT in the wild — users will need to log in again. API keys are unaffected by JWT rotation.
- `TRUST_PROXY` is mandatory behind a reverse proxy. Without it, every request looks like the proxy's IP and the per-IP rate limit collapses into one bucket.
- `JOB_LOCK_DURATION_MS` is the time between a worker dying silently and another worker re-claiming the job. Lower it for low-latency workloads, but be careful: slow-but-healthy handlers will be declared stalled if the lock is shorter than the real handler runtime.

### `apps/web/`

```bash
NEXT_PUBLIC_API_URL=https://api.asyncops.com
```

That's it. The dashboard is a Next.js app that calls the API from the browser, so the host running the dashboard doesn't need any secrets. Make sure the value matches the DNS name you put in `CORS_ORIGIN` on the API side.

## Deploy recipe — Render / Railway / similar

1. **Create a MongoDB cluster.** Atlas free tier is fine to start. Whitelist your compute host's egress IPs, or use `0.0.0.0/0` with a strong auth string.
2. **Create a Redis instance** with TLS. Upstash, Render Redis, Railway Redis all work.
3. **Deploy the API (`apps/api/`).**
   - Root directory: `apps/api/`
   - Build command: `npm install`
   - Start command: `node index.js`
   - Health check path: `GET /livez` → `{ ok: true }` (always-200 liveness). For a deeper "is this replica actually usable" check, probe `GET /readyz` — it pings Mongo and Redis and returns 503 when a dep is down, 200 otherwise. `GET /health` is kept as a 200 alias for back-compat.
   - Environment: everything listed above.
   - **Replicas: 1.** See "Critical constraint" above. Do not scale this out.
4. **Deploy the dashboard (`apps/web/`).**
   - Root directory: `apps/web/`
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Environment: `NEXT_PUBLIC_API_URL=https://<your-api-host>`.
   - Replicas: scale freely.
5. **Point DNS.**
   - `api.<your-domain>` → API host
   - `app.<your-domain>` → dashboard host
6. **Set `ALLOWED_ORIGINS=https://app.<your-domain>`** on the API and redeploy.

## First-boot smoke test

1. `curl https://api.<your-domain>/livez` → `{ "ok": true }`, then `curl https://api.<your-domain>/readyz` → `{ "ok": true, "checks": { "mongo": true, "redis": true } }`. If `/readyz` returns 503, check the `checks` object to see which dep is down.
2. Browse to `https://app.<your-domain>/signup`, create an account, log in.
3. Go to **API Keys** → **Create key**, name it `smoke`, copy the `ak_live_…` value.
4. On your laptop, run a worker:

   ```bash
   export ASYNCOPS_URL=https://api.<your-domain>
   export ASYNCOPS_API_KEY=ak_live_...

   node -e "
     const { init, createWorker } = require('asyncops-sdk');
     init({ apiKey: process.env.ASYNCOPS_API_KEY, baseUrl: process.env.ASYNCOPS_URL });
     createWorker({
       handlers: {
         'smoke-test': async (job, ctx) => {
           await ctx.log('smoke-test running on deployment');
           return { ok: true, ts: Date.now() };
         },
       },
     }).start();
   "
   ```

5. In another shell, submit one job:

   ```bash
   curl -X POST "$ASYNCOPS_URL/jobs" \
     -H "Authorization: Bearer $ASYNCOPS_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"type":"smoke-test","data":{}}'
   ```

6. Open `https://app.<your-domain>/dashboard/jobs`, find the job, confirm `completed`, open the detail page and see `result: { ok: true, ... }` plus the `smoke-test running on deployment` log line.

If any step fails, see [debugging.md](debugging.md) for the drill.

## Email verification (no SMTP)

AsyncOps does not ship email. The verification flow exists, but the operator has to deliver the link manually until an SMTP integration is funded. How it works today:

1. A signed-in user calls `POST /auth/request-verify` (the dashboard exposes this as a "Send verification email" button).
2. The API signs a short-lived JWT with `purpose: "email-verify"` and writes the full verification URL to **API stdout**, tagged `[auth]`:

   ```text
   [auth] email verification link for user@example.com: https://app.asyncops.com/verify-email?token=eyJhbGciOi... (AsyncOps does not send email — deliver this manually.)
   ```

3. The operator (that's you) pulls this line from your log aggregator and sends the URL to the user out-of-band — support ticket, chat, wherever.
4. The user opens the URL; the dashboard `POST`s the token to `/auth/verify-email`, which flips `emailVerified: true` on the user doc.

The URL hostname is taken from the `DASHBOARD_URL` env var (defaults to `http://localhost:3000` in dev). Make sure this matches the origin you published, or the link will 404.

**Until SMTP is wired up, do not claim email verification in your product UX.** The dashboard copy already reflects this — the "Send verification" button is labeled accordingly. Email verification is not enforced anywhere: `emailVerified` is a field on the user doc, not a gate on signup or login.

## Auth hygiene: case and whitespace

Signup and login both normalize the `email` field (`trim().toLowerCase()` in [`authRoutes.js`](../apps/api/routes/authRoutes.js)). A user who signed up as `Alice@Example.com` can log in as `alice@example.com ` without surprise. The stored value is the normalized form, so existing dupes are not auto-merged — on a fresh deployment this is a non-issue; on an already-populated instance with mixed-case duplicates, merge them manually before enabling.

## Rate limits

The API ships with in-process rate limits via [`express-rate-limit`](https://www.npmjs.com/package/express-rate-limit). Storage is in-memory because AsyncOps is single-replica (see "Critical constraint" above) — if we ever scale horizontally the store needs to move to Redis via `rate-limit-redis`.

| Surface | Limit | Key |
|---|---|---|
| `POST /auth/*` (signup, login, verify) | 20 requests per 60s | Per IP |
| `POST /jobs` (create job) | 120 requests per 60s | Per authenticated user id, falling back to IP for unauthenticated requests |

Both are disabled when `NODE_ENV=test` so the Jest suite can hammer endpoints without tripping caps. Tune by editing `apps/api/middleware/rateLimit.js` — there is no env-var knob today; if you need to change the ceiling, change the code and redeploy.

**Behind a reverse proxy:** set `TRUST_PROXY` (see env vars above) or every request looks like the proxy IP and the per-IP limiter blocks all traffic together.

## Creating the first admin user

The `role` field on `users` defaults to `'user'` ([`authRoutes.js:33`](../apps/api/routes/authRoutes.js#L33)). There is no self-service "make me admin" button. To grant the admin role, update the user document directly in Mongo after they've signed up:

```js
// from mongosh pointed at your MONGODB_URI + MONGODB_DB
db.users.updateOne(
  { email: 'you@example.com' },
  { $set: { role: 'admin' } }
);
```

Admin-gated routes live under `/admin`. Verify with a `GET /me` — the response should include `role: "admin"`.

## Scaling

- **Users' workers (the process running handlers).** Scale horizontally without limit. Each is a stateless Node process; the claim path in `/jobs/next` is a server-side atomic `findOneAndUpdate`, so two workers with identical handler sets never pick up the same job. See [workers.md § Scaling out](workers.md#scaling-out).
- **API.** Scale vertically only. Bigger CPU, more RAM, raise `QUEUE_CONCURRENCY` to let the in-process BullMQ worker handle more concurrent handler-awaits. Single replica. See the critical constraint above for why.
- **Dashboard.** Scale horizontally. Pure static/SSR, no server state.
- **Redis.** The queue-throughput bottleneck once the API has more CPU than it needs. Upgrade before you upgrade anything else.
- **Mongo.** Indexes are created on boot in [`db.js:13-23`](../apps/api/db.js#L13-L23): `(userId, createdAt desc)`, `(userId, status, type, createdAt)`, and a partial unique on `(userId, idempotencyKey)`. They are tuned for the dashboard list and the claim path. Watch the `(userId, status, type, createdAt)` index explain plan if claim latency degrades under load.

## Monitoring, at minimum

- **`GET /livez`** — black-box uptime on the API. Pair it with **`GET /readyz`** if you want the probe to fail when Mongo or Redis is down (useful as a readiness gate in Kubernetes or a Render health check).
- **Redis queue depth.** BullMQ exposes per-queue counts (`waiting`, `active`, `delayed`, `failed`) via its own APIs — scrape them and chart them. A growing `waiting` with low `active` means user workers aren't keeping up.
- **Mongo insert rate** on `jobs` — matches your incoming job volume.
- **End-to-end latency.** For completed jobs, `updatedAt - createdAt` approximates total time including retry backoff. Track p50 / p95.
- **Open SSE connections on the API process.** Proxies to "how many dashboard tabs are open watching jobs right now" and sets a ceiling on listener-map memory. Restart the API if this number grows unbounded — that indicates leaked clients.
- **Monthly job counts per user.** Anomalies here are the clearest signal of a runaway customer or a broken scheduler.

## Graceful shutdown

On `SIGTERM` / `SIGINT`, [`apps/api/index.js:49-58`](../apps/api/index.js#L49-L58) calls `server.close()` (stop accepting new connections) and `closeQueue()` (close the BullMQ proxy worker, close the queue, quit the Redis connection), then `process.exit(0)`.

Caveats worth knowing for production:

- `server.close()` is **not** awaited. In-flight HTTP requests will continue, but there is no explicit drain wait — don't send SIGKILL immediately after SIGTERM. Give it at least 30 seconds.
- In-flight BullMQ processor promises are abandoned when the worker closes. Any job whose external worker was mid-handler will land in the stalled-lease path on the next deploy's API (10-minute delay before re-claim). Quiet deploys at low traffic if that matters.
- The embedded `pending` map is in-process only; it does **not** persist. Rolling restart = every currently-in-flight BullMQ promise is dropped and recovered via the stalled path.

## Security

- **Always require TLS.** `Authorization: Bearer ak_live_…` over plaintext would expose keys to any proxy in the path.
- **`ALLOWED_ORIGINS` must list exact dashboard origins** in production — no wildcards. The API reads it (or the legacy `CORS_ORIGIN`) as a comma-separated list; unlisted origins are rejected, not permitted.
- **API keys are bcrypt hashed** (not SHA-256) at [`apiKeyRoutes.js:34`](../apps/api/routes/apiKeyRoutes.js#L34) and verified via `bcrypt.compare` at [`auth.js:27`](../apps/api/auth.js#L27). The visible 8-character prefix after `ak_live_` is stored in cleartext and is used only to narrow the candidate set before the bcrypt compare — it is not itself a secret. Cost factor is 10.
- **Per-request auth latency.** Because bcrypt is intentionally slow (~50-150 ms at cost 10 depending on hardware), each request authenticated with an API key pays that cost. For high-QPS workers this dominates; consider caching verified keys in-process for a short TTL if you ever need to.
- **JWT rotation.** Rotating `JWT_SECRET` invalidates every existing JWT — all logged-in users will be kicked out on their next dashboard request. API keys are independent.
- **Plan limit enforcement.** Monthly caps are enforced in `POST /jobs` only ([`jobRoutes.js:107`](../apps/api/routes/jobRoutes.js#L107)). An attacker with a valid API key can only burn your month's quota, not raise it.
- **Mongo audit logging + Redis ACLs** if you're running multi-tenant at scale.

## Backups and disaster recovery

- **Mongo is the state of truth.** Enable Atlas continuous backups (or equivalent) and rehearse a restore.
- **Redis is reconstructible.** If Redis is lost, in-flight BullMQ state is gone. The Mongo `jobs` documents are intact, but anything that was `processing` at the time will stall until another worker picks it up. Jobs in `pending` or terminal states are unaffected.
- **Secrets.** `JWT_SECRET` + the API keys. Store in your platform's secret manager. Don't commit `.env`.

## What's deliberately not here

- **No webhooks or cron / scheduling.** See [jobs.md](jobs.md) — create jobs from your own scheduler.
- **No billing integration.** Plans are enforced but not monetized.
- **No teams / RBAC.** One account, one principal.
- **No cross-region replication.** Single Mongo, single Redis, single API. Run one per region if you need multi-region.

See [debugging.md](debugging.md) for failure diagnosis and [workers.md](workers.md) for the worker side of the system.
