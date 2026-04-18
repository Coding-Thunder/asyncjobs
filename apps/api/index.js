require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { connect } = require('./db');
const authRoutes = require('./routes/authRoutes');
const jobRoutes = require('./routes/jobRoutes');
const apiKeyRoutes = require('./routes/apiKeyRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { startProxyWorker, close: closeQueue } = require('./queue');
const { authLimiter } = require('./middleware/rateLimit');

const PORT = process.env.PORT || 4000;

const app = express();

// When deployed behind a reverse proxy / load balancer (Render, Fly, nginx),
// set TRUST_PROXY=1 so req.ip reflects the real client — otherwise every
// request looks like the proxy IP and rate limiting collapses into one bucket.
if (process.env.TRUST_PROXY) {
  const val = process.env.TRUST_PROXY;
  const n = Number(val);
  app.set('trust proxy', Number.isFinite(n) ? n : val);
}

// CORS: in prod, only explicit origins listed in ALLOWED_ORIGINS (or the
// legacy CORS_ORIGIN) are allowed; requests from anything else are rejected.
// In dev (no NODE_ENV=production), defaults to the local dashboard origin.
const IS_PROD = process.env.NODE_ENV === 'production';
const DEV_DEFAULT_ORIGIN = 'http://localhost:3000';
const rawOrigins = process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '';
const allowedOrigins = rawOrigins
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (allowedOrigins.length === 0 && !IS_PROD) {
  allowedOrigins.push(DEV_DEFAULT_ORIGIN);
}
app.use(
  cors({
    origin: (origin, cb) => {
      // Requests with no Origin header (curl, server-to-server, same-origin)
      // are always allowed — CORS only applies to cross-origin browser calls.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: false,
  })
);
app.use(express.json({ limit: '1mb' }));

// Always-200 liveness. Used by load balancers to decide if the process is up.
app.get('/livez', (_req, res) => {
  res.json({ ok: true });
});

// Deep readiness — checks Mongo and Redis. Returns 503 when a dep is down.
app.get('/readyz', async (_req, res) => {
  const checks = { mongo: false, redis: false };
  try {
    const { connect: connectDb } = require('./db');
    const client = await connectDb();
    await client.db().admin().ping();
    checks.mongo = true;
  } catch {}
  try {
    const { getRedisConnection } = require('./queue');
    const conn = getRedisConnection();
    const pong = await conn.ping();
    checks.redis = pong === 'PONG';
  } catch {}
  const ready = checks.mongo && checks.redis;
  res.status(ready ? 200 : 503).json({ ok: ready, checks });
});

// Back-compat alias — older platform health checks may still hit /health.
// Routes to /livez so existing infra keeps working.
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/auth', authLimiter, authRoutes);
app.use('/jobs', jobRoutes);
app.use('/api-keys', apiKeyRoutes);
app.use('/admin', adminRoutes);
app.use('/', userRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

app.use((err, req, res, next) => {
  console.error('[api error]', err);
  res.status(500).json({ error: 'internal server error' });
});

connect()
  .then(() => {
    startProxyWorker();
    const server = app.listen(PORT, () => {
      console.log(`API listening on port ${PORT}`);
    });

    const shutdown = async (signal) => {
      console.log(`[api] received ${signal}, shutting down`);
      server.close();
      try {
        await closeQueue();
      } catch {}
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })
  .catch((err) => {
    console.error('[db] failed to connect', err);
    process.exit(1);
  });
