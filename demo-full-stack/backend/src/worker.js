// Start the AsyncOps worker in-process. In a real deployment you'd run this
// as a separate process; for a single-command demo it's fine to co-locate.
const { createWorker } = require('asyncops-sdk');
const { handlers } = require('./handlers');

function startWorker() {
  const worker = createWorker({
    handlers,
    pollInterval: 500,
    idlePollInterval: 1500,
    onError: (err, info) => {
      // Handler-level failures are expected for the retry-success scenario.
      // Log them at info-level so the demo terminal stays readable.
      console.log(`[worker] ${info?.stage || 'error'}: ${err.message}`);
    },
  });
  worker.start();
  console.log('[worker] handlers:', Object.keys(handlers).join(', '));
  return worker;
}

module.exports = { startWorker };
