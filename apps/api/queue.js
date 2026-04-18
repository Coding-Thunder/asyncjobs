// Internal job queue (BullMQ + Redis).
//
// BullMQ is a server-side implementation detail. External workers NEVER talk
// to Redis directly — they talk to the REST API, and the API reads/writes
// job state via this module.
//
// Why the "proxy worker" pattern:
//   - We add jobs to BullMQ via enqueueJob().
//   - A single in-process BullMQ Worker (the "proxy") picks each job up, flips
//     the Mongo doc to `pending` so an external worker can claim it via
//     GET /jobs/next, and then awaits an in-memory promise.
//   - When the external worker reports success/failure via POST /jobs/:id/
//     complete|fail, the HTTP handler calls signalComplete / signalFail,
//     which resolves or rejects that promise.
//   - BullMQ handles retry backoff + stalled-lease detection for us.

const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const { ObjectId } = require('mongodb');

const { getCollections } = require('./db');
const { publishEvent } = require('./events');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
// BullMQ rejects queue names containing ':' (it uses ':' as its own Redis key
// separator). Keep this a plain identifier.
const QUEUE_NAME = process.env.QUEUE_NAME || 'asyncops-jobs';
const MAX_ATTEMPTS = parseInt(process.env.MAX_JOB_ATTEMPTS || '3', 10);
const BACKOFF_DELAY_MS = parseInt(process.env.JOB_BACKOFF_DELAY_MS || '2000', 10);
// Lease time — if the external worker doesn't call complete/fail within this
// window, BullMQ marks the job stalled and re-runs the processor, which
// re-enqueues the Mongo doc as `pending` for another claim.
const LOCK_DURATION_MS = parseInt(
  process.env.JOB_LOCK_DURATION_MS || String(10 * 60 * 1000),
  10
);

let connection = null;
let queue = null;
let proxyWorker = null;

// mongoJobId (string) -> { resolve, reject }
const pending = new Map();

function getConnection() {
  if (!connection) {
    connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    connection.on('error', (err) => {
      console.error('[queue] redis error:', err.message);
    });
  }
  return connection;
}

function getQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: getConnection() });
  }
  return queue;
}

async function enqueueJob(mongoJobId) {
  const q = getQueue();
  await q.add(
    'run',
    { mongoJobId: mongoJobId.toString() },
    {
      attempts: MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    }
  );
}

// Only flip a job to pending when its current status is non-terminal.
// A worker that has already claimed (processing), completed, or had its job
// cancelled must not be resurrected by a late BullMQ delivery. Returns true
// when the doc was actually flipped.
async function flipToPending(mongoJobIdStr, attemptNumber) {
  const { jobs } = await getCollections();
  const oid = new ObjectId(mongoJobIdStr);
  const now = new Date();
  const result = await jobs.updateOne(
    { _id: oid, status: { $in: ['pending', 'processing', 'failed'] } },
    {
      $set: {
        status: 'pending',
        attempts: attemptNumber,
        error: null,
        updatedAt: now,
      },
    }
  );
  if (result.matchedCount === 0) {
    return false;
  }
  publishEvent(mongoJobIdStr, {
    type: 'status',
    data: { status: 'pending', attempts: attemptNumber, updatedAt: now },
  });
  return true;
}

async function markFailedTerminal(mongoJobIdStr, errMsg) {
  const { jobs } = await getCollections();
  const oid = new ObjectId(mongoJobIdStr);
  const now = new Date();
  await jobs.updateOne(
    { _id: oid },
    { $set: { status: 'failed', error: errMsg, updatedAt: now } }
  );
  publishEvent(mongoJobIdStr, {
    type: 'status',
    data: { status: 'failed', error: errMsg, updatedAt: now },
  });
}

function startProxyWorker() {
  if (proxyWorker) return proxyWorker;

  proxyWorker = new Worker(
    QUEUE_NAME,
    async (bullJob) => {
      const { mongoJobId } = bullJob.data;
      // attemptsMade is 0 on first run, 1 on first retry, etc.
      const attemptNumber = bullJob.attemptsMade + 1;
      const flipped = await flipToPending(mongoJobId, attemptNumber);
      if (!flipped) {
        // Doc is in a terminal state (completed or cancelled) — drop the BullMQ
        // job silently so it does not retry.
        console.log(
          `[queue] drop stale BullMQ job ${mongoJobId}: doc is terminal`
        );
        return null;
      }

      return await new Promise((resolve, reject) => {
        pending.set(mongoJobId, { resolve, reject });
      });
    },
    {
      connection: getConnection(),
      concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '500', 10),
      lockDuration: LOCK_DURATION_MS,
    }
  );

  proxyWorker.on('completed', (bullJob) => {
    if (!bullJob) return;
    pending.delete(bullJob.data.mongoJobId);
  });

  proxyWorker.on('failed', async (bullJob, err) => {
    if (!bullJob) return;
    const { mongoJobId } = bullJob.data;
    pending.delete(mongoJobId);

    const maxAttempts = bullJob.opts.attempts || MAX_ATTEMPTS;
    if (bullJob.attemptsMade >= maxAttempts) {
      const errMsg = err && err.message ? err.message : String(err);
      try {
        await markFailedTerminal(mongoJobId, errMsg);
      } catch (e) {
        console.error('[queue] markFailedTerminal error:', e);
      }
    }
    // Otherwise BullMQ will re-run the processor after the backoff delay,
    // and the next invocation will flip Mongo back to pending.
  });

  proxyWorker.on('error', (err) => {
    console.error('[queue] worker error:', err.message);
  });

  console.log('[queue] proxy worker started');
  return proxyWorker;
}

function signalComplete(mongoJobIdStr, result) {
  const entry = pending.get(mongoJobIdStr);
  if (entry) {
    entry.resolve(result ?? null);
    return;
  }
  // No in-memory entry: the BullMQ promise was dropped (e.g. API restart)
  // and its lock will expire after JOB_LOCK_DURATION_MS. Surface it so the
  // operator can see stalled jobs instead of silently no-oping.
  console.warn(
    `[queue] signalComplete: no pending BullMQ entry for ${mongoJobIdStr} ` +
      `(API may have restarted; BullMQ lock will expire in up to JOB_LOCK_DURATION_MS)`
  );
}

function signalFail(mongoJobIdStr, error) {
  const entry = pending.get(mongoJobIdStr);
  if (entry) {
    const err = error instanceof Error ? error : new Error(String(error || 'failed'));
    entry.reject(err);
    return;
  }
  console.warn(
    `[queue] signalFail: no pending BullMQ entry for ${mongoJobIdStr} ` +
      `(API may have restarted; BullMQ lock will expire in up to JOB_LOCK_DURATION_MS)`
  );
}

async function close() {
  if (proxyWorker) {
    await proxyWorker.close();
    proxyWorker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
}

module.exports = {
  enqueueJob,
  startProxyWorker,
  signalComplete,
  signalFail,
  close,
  getRedisConnection: getConnection,
  REDIS_URL,
  MAX_ATTEMPTS,
};
