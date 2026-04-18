# AsyncOps Full-Stack Demo

A runnable developer demo that shows where AsyncOps is an upgrade over a naive
queue. Four scenarios are wired end-to-end with the real
[`asyncops-sdk`](https://www.npmjs.com/package/asyncops-sdk):

| Scenario                     | What it proves                                              |
| ---------------------------- | ----------------------------------------------------------- |
| **Retries failing**          | Job fails on attempt #1, backend calls `retryJob()`, worker picks it up again and succeeds. |
| **Jobs getting stuck**       | A long-running job streams heartbeat logs so you can see it's alive. |
| **No visibility into execution** | A 5-step pipeline emits per-step logs that are scoped to the job id. |
| **Long-running AI tasks**    | Streams token-count updates over ~10s. The initial HTTP request returned long ago — progress flows over AsyncOps. |

## Folder structure

```
demo-full-stack/
├── backend/                  # Express API + AsyncOps worker (same process)
│   ├── src/
│   │   ├── index.js          # Express app, scenario catalog, SSE proxy
│   │   ├── worker.js         # createWorker() wrapper
│   │   └── handlers.js       # Scenario handlers — real async work
│   ├── .env.example
│   └── package.json
├── frontend/                 # Vite + React UI
│   ├── src/
│   │   ├── App.jsx           # Sidebar + live job panel
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── index.html
│   ├── vite.config.js        # /api → http://localhost:3001 proxy
│   └── package.json
└── README.md
```

## Architecture

```
 ┌──────────────┐  REST + SSE   ┌────────────────────────────────┐  HTTPS   ┌─────────────┐
 │ React (5173) │ ─────────────▶│ Express + Worker (3001)        │─────────▶│  AsyncOps   │
 │              │◀──────────────│ uses asyncops-sdk              │◀─────────│  hosted API │
 └──────────────┘  SSE events   └────────────────────────────────┘  jobs    └─────────────┘
```

- The **browser** never sees your API key. It talks to the local Express
  server, which holds the key and speaks to AsyncOps via the SDK.
- `POST /api/jobs` calls `client.createJob({ type, data })`.
- `GET /api/jobs/:id/stream` opens an SSE channel; the backend subscribes to
  AsyncOps with `client.subscribe(jobId, cb)` and forwards every status/log
  event to the browser.
- The **worker** runs in the same Node process via `createWorker({ handlers })`.
  Each scenario has a handler that does real `await sleep()` work, emits
  `ctx.log()` lines, and returns a result.

## Prerequisites

- Node.js **18+** (the SDK and the demo rely on built-in `fetch`)
- An AsyncOps API key — grab one from the AsyncOps dashboard at
  <https://asyncjobs-web.vercel.app/>.

## Setup

### 1. Backend

```bash
cd backend
cp .env.example .env
# edit .env and set ASYNCOPS_API_KEY=<your key>
npm install
npm start
```

You should see:

```
[asyncops-worker] started; types=retry-success,stuck-then-recover,pipeline-logs,long-ai-task
[worker] handlers: retry-success, stuck-then-recover, pipeline-logs, long-ai-task
[api]    listening on http://localhost:3001
```

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Pick a scenario in the sidebar and click
**Run Job**.

## What to watch

- **Retries failing** — status goes `pending → running → failed → pending →
  running → completed`. A log line shows the backend calling `retryJob()` the
  moment AsyncOps reports the failure.
- **Jobs getting stuck** — logs tick every ~2s. This is what you don't get
  from a bare Redis/BullMQ queue without hand-rolled heartbeats.
- **No visibility into execution** — each pipeline step shows up as its own
  log entry tied to the job id.
- **Long-running AI tasks** — token counts stream in; the original
  `POST /api/jobs` request is long done, yet the UI keeps updating.

## How the SDK is used

```js
const asyncops = require('asyncops-sdk');

asyncops.init({ apiKey: process.env.ASYNCOPS_API_KEY });

// create a job
await asyncops.client.createJob({ type: 'retry-success', data: { amount: 49.99 } });

// retry on demand
await asyncops.client.retryJob(jobId);

// subscribe to status + log events (polls every 2s in Node)
const unsubscribe = asyncops.client.subscribe(jobId, (event) => {
  // event.type === 'status' | 'log'
});

// run handlers as a worker
asyncops.createWorker({
  handlers: {
    'retry-success': async (job, ctx) => {
      await ctx.log('charging...');
      return { charged: true };
    },
  },
}).start();
```

Everything in the demo — job creation, retries, live streaming, worker
handlers — goes through those calls. No mocks, no fake state.

## Notes & tradeoffs

- The worker is co-located with the API server for a one-command demo. In
  production you'd run `node src/worker.js` separately.
- The SDK's `subscribe()` falls back to 2-second polling in Node (there's no
  `EventSource` without a polyfill); browser-side the same call uses native
  SSE. The demo backend uses the Node path and forwards each event to the
  browser over its own SSE endpoint.
- `ASYNCOPS_URL` and `PORT` are both overridable via env vars if you're
  pointing at a custom AsyncOps deployment.
