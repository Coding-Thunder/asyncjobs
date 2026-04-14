const express = require('express');

/**
 * Build a lightweight Express app with the same middleware as the real one,
 * but without calling connect() or listen().
 */
function buildApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Health check
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Mount routes (they will use the mocked db/queue/events from jest.doMock)
  app.use('/auth', require('../../routes/authRoutes'));
  app.use('/jobs', require('../../routes/jobRoutes'));
  app.use('/api-keys', require('../../routes/apiKeyRoutes'));
  app.use('/admin', require('../../routes/adminRoutes'));
  app.use('/', require('../../routes/userRoutes'));

  // 404 + error handler
  app.use((_req, res) => res.status(404).json({ error: 'not found' }));
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { buildApp };
