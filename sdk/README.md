# asyncops-sdk

Official Node.js SDK for [AsyncOps](https://asyncjobs-web.vercel.app/) — a hosted debugging and control layer for async workflows.

Create jobs from your app, run workers against your own handlers, and get durable state, retries, live logs, and a dashboard — all over HTTPS with a single API key.

## Requirements

- Node.js **18+** (uses the built-in global `fetch`)

## Install

```bash
npm install asyncops-sdk
```

## Quickstart

```js
const { init, client, createWorker } = require('asyncops-sdk');

init({ apiKey: process.env.ASYNCOPS_API_KEY });

// 1) Create a job from your app
await client.createJob({
  type: 'send-email',
  data: { to: 'you@example.com' },
});

// 2) Run a worker process
createWorker({
  handlers: {
    'send-email': async (job, ctx) => {
      await ctx.log(`sending to ${job.data.to}`);
      // ... your real send-mail code
      return { sent: true };
    },
  },
}).start();
```

Call `init()` **once** at startup. After that, `client` and `createWorker` pick up the same API key automatically.

## Configuration

| Env var             | Purpose                                   | Default                     |
| ------------------- | ----------------------------------------- | --------------------------- |
| `ASYNCOPS_API_KEY`  | API key (pass to `init()`)                | —                           |
| `ASYNCOPS_URL`      | API base URL (overridable per-client)     | `https://api.asyncops.com`  |

You can also pass `{ apiKey, baseUrl }` explicitly to `new JobsClient()` or `createWorker()`.

## API

- `init({ apiKey, baseUrl })` — store global credentials
- `client` — shared default `JobsClient`
- `new JobsClient({ apiKey, baseUrl })` — create jobs, list/get/retry, manage API keys
- `createWorker({ handlers, pollInterval, handlerTimeoutMs, onError, logger })` — long-running worker loop

See the [full docs](https://asyncjobs-web.vercel.app/) for the handler contract, subscription/SSE, and worker lifecycle.

## License

MIT
