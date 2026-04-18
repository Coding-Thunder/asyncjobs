require('dotenv').config();
const express = require('express');
const cors = require('cors');
const asyncops = require('asyncops-sdk');
const { startWorker } = require('./worker');

const API_KEY = process.env.ASYNCOPS_API_KEY;
if (!API_KEY || API_KEY === 'replace-with-your-asyncops-api-key') {
  console.error(
    '\nMissing ASYNCOPS_API_KEY. Copy backend/.env.example to backend/.env ' +
    'and set your key (grab one from https://asyncjobs-web.vercel.app/).\n'
  );
  process.exit(1);
}

asyncops.init({
  apiKey: API_KEY,
  baseUrl: process.env.ASYNCOPS_URL,
});

const app = express();
app.use(cors());
app.use(express.json());

// Catalog of scenarios exposed to the frontend. Each `id` matches a handler
// key registered by the worker, so the same name flows end-to-end.
const SCENARIOS = [
  {
    id: 'retry-success',
    title: 'Retries failing',
    painPoint: "Retries don't land — devs roll their own",
    description:
      'This job fails on the first attempt with a transient 503. AsyncOps captures the failure durably; the backend calls retryJob() and the worker picks it up again, succeeding on the second try.',
    buildData: () => ({ amount: 49.99, currency: 'USD' }),
    autoRetry: true,
  },
  {
    id: 'stuck-then-recover',
    title: 'Jobs getting stuck',
    painPoint: 'Workers silently hang with no signal',
    description:
      'Emits a heartbeat log every 2s for ~12s. In a naive queue you have no idea if the job is alive — AsyncOps streams liveness logs and a final status you can act on.',
    buildData: () => ({ reason: 'slow-downstream' }),
  },
  {
    id: 'pipeline-logs',
    title: 'No visibility into execution',
    painPoint: 'print() logs disappear; no per-job trace',
    description:
      'A 5-step pipeline. Each step emits a structured log tied to the job id and viewable in real time, without shipping logs to a separate stack.',
    buildData: () => ({ pipeline: 'etl-daily' }),
  },
  {
    id: 'long-ai-task',
    title: 'Long-running AI tasks',
    painPoint: 'HTTP timeouts kill multi-minute inference',
    description:
      'A long AI task streaming token-count updates over ~10s. The kickoff request already returned — you follow progress over AsyncOps, not a hung HTTP connection.',
    buildData: () => ({ prompt: 'Summarize Q1 revenue by product line' }),
  },
];

app.get('/api/scenarios', (_req, res) => {
  res.json({
    scenarios: SCENARIOS.map(({ buildData, ...s }) => s),
  });
});

// Create a job for the given scenario.
app.post('/api/jobs', async (req, res) => {
  const scenario = SCENARIOS.find((s) => s.id === req.body?.scenarioId);
  if (!scenario) return res.status(400).json({ error: 'unknown scenarioId' });
  try {
    const payload = await asyncops.client.createJob({
      type: scenario.id,
      data: scenario.buildData(),
    });
    const job = payload?.job || payload;
    res.json({
      job,
      scenario: {
        id: scenario.id,
        title: scenario.title,
        autoRetry: !!scenario.autoRetry,
      },
    });
  } catch (e) {
    console.error('createJob failed:', e.message);
    res.status(e.status || 500).json({ error: e.message || 'createJob failed' });
  }
});

app.get('/api/jobs/:id', async (req, res) => {
  try {
    res.json(await asyncops.client.getJob(req.params.id));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post('/api/jobs/:id/retry', async (req, res) => {
  try {
    res.json(await asyncops.client.retryJob(req.params.id));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// SSE proxy: the browser subscribes here, we subscribe to AsyncOps server-side
// (using the API key) and forward every event. Keeps the key out of the browser.
app.get('/api/jobs/:id/stream', (req, res) => {
  const jobId = req.params.id;
  const scenario = SCENARIOS.find((s) => s.id === req.query.scenario);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  let autoRetried = false;

  const unsubscribe = asyncops.client.subscribe(jobId, async (event) => {
    send(event);

    // Demo-only: auto-call retryJob() the first time this scenario fails, so
    // the viewer sees the full pain-point → recovery loop without needing to
    // click anything. Real apps would typically drive this from policy/code.
    if (
      scenario?.autoRetry &&
      !autoRetried &&
      event.type === 'status' &&
      event.data?.status === 'failed'
    ) {
      autoRetried = true;
      try {
        send({
          type: 'log',
          data: {
            message: '[demo-backend] AsyncOps reported failure — calling client.retryJob()',
            created_at: new Date().toISOString(),
          },
        });
        await asyncops.client.retryJob(jobId);
      } catch (e) {
        send({ type: 'error', data: { message: `retry failed: ${e.message}` } });
      }
    }
  });

  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`[api]    listening on http://localhost:${PORT}`);
});

startWorker();
