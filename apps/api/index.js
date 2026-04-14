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

const PORT = process.env.PORT || 4000;

const app = express();

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : true;
app.use(cors({ origin: corsOrigin, credentials: false }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/auth', authRoutes);
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
