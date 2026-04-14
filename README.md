# AsyncOps

**Hosted job orchestration for async workflows.**

> **Language support:** AsyncOps currently supports **Node.js (JavaScript) only**.
> The SDK (`asyncops-sdk`) is a Node.js package, and worker processes must run on Node.js 18+. More language SDKs are on the roadmap. Non-Node apps can still create and inspect jobs via the REST API — see [docs/sdk.md](docs/sdk.md#rest-access-from-other-languages).

AsyncOps is the debugging and control layer for the background work your application already does. You create jobs from your app, run workers anywhere a Node.js process can run (laptop, VM, Kubernetes, serverless), and get durable state, automatic retries, live logs, and a dashboard that shows every job end-to-end.

Your handler code runs in your own process. AsyncOps never touches your business logic — it just makes async work observable, retryable, and inspectable.

```
 your app  ──POST /jobs──▶  AsyncOps API  ──▶  durable state + retries
                                  │
                                  ▼
                         your worker (SDK)
                     pulls job over HTTPS,
                     runs your handler,
                     reports result.
```

## Who it's for

- Teams running **background jobs** (emails, webhooks, ETL, AI pipelines, report generation) who want visibility without building their own queue tooling.
- Developers who need **retries, logs, and a dashboard** but don't want workers that ship with Redis credentials.
- Anyone already running BullMQ / Sidekiq / Celery who wants a **hosted control plane** they can point their own workers at.

## Quickstart

AsyncOps is a hosted service. You don't need to run the API or the dashboard yourself — you just install the SDK and point it at your instance with an API key.

### 1. Install the SDK

Requires Node.js 18 or later.

```bash
npm install asyncops-sdk
```

### 2. Create an API key

Log in to your AsyncOps dashboard → **API Keys** → **Create key**. Copy the `ak_live_…` string — it's shown once.

### 3. Run a worker

```js
// worker.js
const { init, createWorker } = require('asyncops-sdk');

init({ apiKey: process.env.ASYNCOPS_API_KEY });

createWorker({
  handlers: {
    'send-email': async (job, ctx) => {
      await ctx.log(`sending to ${job.data.to}`);
      // ... your real send-mail code
      return { messageId: 'm_abc123' };
    },
  },
}).start();
```

```bash
ASYNCOPS_API_KEY=ak_live_... \
ASYNCOPS_URL=https://api.asyncops.com \
node worker.js
```

### 4. Create a job from your app

```js
const { init, client } = require('asyncops-sdk');

init({ apiKey: process.env.ASYNCOPS_API_KEY });

await client.createJob({
  type: 'send-email',
  data: { to: 'you@example.com' },
});
```

Call `init()` **once** at startup. After that, `client` and `createWorker` reuse the same API key anywhere in your codebase — no repetition, no passing credentials around.

Within ~1 second the worker picks the job up, runs your handler, and the dashboard shows the full trace — status, attempts, result, and every log line. Failed jobs are retried automatically.

## Dashboard

The dashboard (`/dashboard`) gives you:

- A live job list with status, type, and elapsed time.
- Per-job drawer with `data`, `result`, attempts, and real-time log stream (SSE).
- One-click retry for any failed job.
- API keys management.

See [docs/dashboard.md](docs/dashboard.md) for the full tour.

## Documentation

All user-facing guides live in [docs/](docs/):

- [SDK usage](docs/sdk.md) — `JobsClient`, `createWorker`, handler contract.
- [Worker setup](docs/workers.md) — running workers in dev, staging, K8s.
- [Creating jobs](docs/jobs.md) — job types, payloads, idempotency.
- [Debugging jobs](docs/debugging.md) — dashboard, logs, retries, SSE.
- [Deployment](docs/deployment.md) — self-hosting AsyncOps itself (optional).

## Repository layout

AsyncOps is a small monorepo. If you are only **using** AsyncOps, the SDK in `packages/sdk` is the only part you ever need.

```
apps/
  api/        backend service (Express + MongoDB + BullMQ)
  web/        dashboard front-end (Next.js)

packages/
  sdk/        client SDK — published as `asyncops-sdk`

internal/
  e2e/        Playwright end-to-end smoke tests
  mcp/        MCP server for AI agents (Claude, Cursor)

docs/         user-facing documentation
```

## Local development (optional)

You only need this if you are contributing to AsyncOps itself, **not** to use it.

```bash
# install all workspaces
npm install

# configure the API
cp apps/api/.env.example apps/api/.env
# edit apps/api/.env → MONGODB_URI, REDIS_URL, JWT_SECRET

# configure the dashboard
cp apps/web/.env.local.example apps/web/.env.local
# edit NEXT_PUBLIC_API_URL if your API runs on a non-default host

# run api + dashboard together
npm run dev
#   api  → http://localhost:4000
#   web  → http://localhost:3000
```

Requirements: Node.js 18+, MongoDB, Redis.

## License

MIT.
