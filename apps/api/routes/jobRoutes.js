// Job routes — the debugging and control layer.
//
// Clients (via API key or JWT) create jobs with { type, data }.
// External workers (via API key) claim jobs by type, execute the handler in
// their own process, and report back via complete / fail / logs endpoints.
//
// Internally, BullMQ is the queue (see queue.js). Workers never talk to Redis
// directly.

const express = require('express');
const { ObjectId } = require('mongodb');

const { getCollections } = require('../db');
const { requireAuth } = require('../auth');
const { addListener, removeListener, publishEvent } = require('../events');
const { getPlan, ensureMonthlyReset } = require('../plans');
const { enqueueJob, signalComplete, signalFail } = require('../queue');

const router = express.Router();

const MAX_LOGS_PER_JOB = 500;

// EventSource cannot set custom headers, so allow ?token=... as a fallback
// for the SSE endpoint only. (Browsers call this from the dashboard.)
router.use((req, _res, next) => {
  if (!req.headers.authorization && req.query && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
});

router.use(requireAuth);

function toObjectId(str) {
  try {
    return new ObjectId(str);
  } catch {
    return null;
  }
}

function shapeJob(doc) {
  if (!doc) return null;
  const { _id, userId, logs, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}

async function appendLog(jobs, jobId, message) {
  const entry = {
    id: new ObjectId().toString(),
    message: String(message),
    timestamp: new Date(),
  };
  await jobs.updateOne(
    { _id: jobId },
    {
      $push: { logs: { $each: [entry], $slice: -MAX_LOGS_PER_JOB } },
      $set: { updatedAt: entry.timestamp },
    }
  );
  publishEvent(jobId.toString(), { type: 'log', data: entry });
  return entry;
}

function validateCreate(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'request body is required' };
  }
  const type = body.type;
  if (!type || typeof type !== 'string' || !/^[a-zA-Z0-9._:\-]{1,100}$/.test(type)) {
    return {
      error: 'type is required and must be a short string (letters, digits, . _ : -)',
    };
  }
  const data = body.data === undefined ? null : body.data;
  // data can be any JSON-serializable value; just enforce it's not a function
  // or symbol (trivially enforced by JSON traversal).
  try {
    JSON.stringify(data);
  } catch {
    return { error: 'data must be JSON-serializable' };
  }
  return { type, data };
}

// ---------- Client: create job ----------
router.post('/', async (req, res, next) => {
  try {
    const parsed = validateCreate(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const idempotencyKey =
      (req.headers['idempotency-key'] && String(req.headers['idempotency-key'])) ||
      (req.body && req.body.idempotencyKey ? String(req.body.idempotencyKey) : null) ||
      null;

    const { users, jobs } = await getCollections();

    const user = await users.findOne({ _id: req.user.id });
    if (!user) return res.status(401).json({ error: 'user not found' });

    await ensureMonthlyReset(users, user);
    const plan = getPlan(user.plan);

    if (user.jobCountMonthly >= plan.monthlyJobLimit) {
      return res.status(429).json({
        error: `Monthly limit reached (${plan.monthlyJobLimit}). Upgrade to Pro for more.`,
      });
    }

    if (idempotencyKey) {
      const existing = await jobs.findOne({
        userId: req.user.id,
        idempotencyKey,
      });
      if (existing) {
        return res.status(200).json({
          id: existing._id.toString(),
          type: existing.type,
          status: existing.status,
          idempotent: true,
        });
      }
    }

    const now = new Date();
    const initialLog = {
      id: new ObjectId().toString(),
      message: 'Job created',
      timestamp: now,
    };

    let insertResult;
    try {
      insertResult = await jobs.insertOne({
        userId: req.user.id,
        type: parsed.type,
        status: 'pending',
        data: parsed.data,
        idempotencyKey: idempotencyKey || null,
        attempts: 0,
        result: null,
        error: null,
        logs: [initialLog],
        createdAt: now,
        updatedAt: now,
      });
    } catch (e) {
      if (e && e.code === 11000 && idempotencyKey) {
        const existing = await jobs.findOne({
          userId: req.user.id,
          idempotencyKey,
        });
        if (existing) {
          return res.status(200).json({
            id: existing._id.toString(),
            type: existing.type,
            status: existing.status,
            idempotent: true,
          });
        }
      }
      throw e;
    }

    const id = insertResult.insertedId;
    const idStr = id.toString();

    await users.updateOne(
      { _id: req.user.id },
      { $inc: { jobCountMonthly: 1 } }
    );

    publishEvent(idStr, {
      type: 'status',
      data: { status: 'pending', updatedAt: now },
    });
    publishEvent(idStr, { type: 'log', data: initialLog });

    try {
      await enqueueJob(idStr);
    } catch (e) {
      console.error('[jobs] enqueue failed', e);
      // Leave the doc as pending — BullMQ failure shouldn't lose the record.
      // Operator can retry via POST /jobs/:id/retry.
    }

    res.status(201).json({ id: idStr, type: parsed.type, status: 'pending' });
  } catch (e) {
    next(e);
  }
});

// ---------- Client: list jobs ----------
router.get('/', async (req, res, next) => {
  try {
    const { jobs } = await getCollections();
    const list = await jobs
      .find({ userId: req.user.id })
      .project({ type: 1, status: 1, createdAt: 1, updatedAt: 1, attempts: 1 })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    res.json({
      jobs: list.map((j) => ({
        id: j._id.toString(),
        type: j.type,
        status: j.status,
        attempts: j.attempts || 0,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
      })),
    });
  } catch (e) {
    next(e);
  }
});

// ---------- Worker: claim next job ----------
// GET /jobs/next?types=send-email,generate-report
// Atomically claims one pending job for this user whose type is in the list.
router.get('/next', async (req, res, next) => {
  try {
    const { jobs } = await getCollections();

    const filter = { userId: req.user.id, status: 'pending' };
    if (req.query && typeof req.query.types === 'string' && req.query.types.trim()) {
      const types = req.query.types
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (types.length === 0) {
        return res.status(400).json({ error: 'types query is empty' });
      }
      filter.type = { $in: types };
    } else {
      return res.status(400).json({
        error: 'types query is required (e.g. /jobs/next?types=send-email)',
      });
    }

    const now = new Date();
    const claimed = await jobs.findOneAndUpdate(
      filter,
      { $set: { status: 'processing', updatedAt: now } },
      { sort: { createdAt: 1 }, returnDocument: 'after' }
    );

    // Driver v6 returns the doc directly; older drivers returned { value }.
    const doc = claimed && (claimed.value || claimed);
    const jobDoc = doc && doc._id ? doc : null;

    if (!jobDoc) {
      return res.json({ job: null });
    }

    publishEvent(jobDoc._id.toString(), {
      type: 'status',
      data: { status: 'processing', updatedAt: now },
    });
    await appendLog(jobs, jobDoc._id, 'Worker picked up job');

    res.json({ job: shapeJob(jobDoc) });
  } catch (e) {
    next(e);
  }
});

// ---------- Client: job detail ----------
router.get('/:id', async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.id);
    if (!oid) return res.status(400).json({ error: 'invalid job id' });

    const { jobs } = await getCollections();
    const doc = await jobs.findOne({ _id: oid, userId: req.user.id });
    if (!doc) {
      return res.status(404).json({ error: 'not found' });
    }

    res.json({
      job: shapeJob(doc),
      logs: doc.logs || [],
    });
  } catch (e) {
    next(e);
  }
});

// ---------- Worker: report success ----------
// POST /jobs/:id/complete  { result }
router.post('/:id/complete', async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.id);
    if (!oid) return res.status(400).json({ error: 'invalid job id' });

    const { jobs } = await getCollections();
    const { result = null } = req.body || {};

    const now = new Date();
    const upd = await jobs.updateOne(
      { _id: oid, userId: req.user.id },
      {
        $set: {
          status: 'completed',
          result,
          error: null,
          updatedAt: now,
        },
      }
    );

    if (upd.matchedCount === 0) {
      return res.status(404).json({ error: 'not found' });
    }

    const idStr = oid.toString();
    publishEvent(idStr, {
      type: 'status',
      data: { status: 'completed', result, error: null, updatedAt: now },
    });
    await appendLog(jobs, oid, 'Job completed');

    // Resolve the internal BullMQ promise so the queue marks it done.
    signalComplete(idStr, result);

    res.json({ id: idStr, status: 'completed' });
  } catch (e) {
    next(e);
  }
});

// ---------- Worker: report failure ----------
// POST /jobs/:id/fail  { error }
router.post('/:id/fail', async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.id);
    if (!oid) return res.status(400).json({ error: 'invalid job id' });

    const { jobs } = await getCollections();
    const rawErr = (req.body && req.body.error) || 'unknown error';
    const errMsg = typeof rawErr === 'string' ? rawErr : String(rawErr);

    const now = new Date();
    const upd = await jobs.updateOne(
      { _id: oid, userId: req.user.id },
      {
        $set: {
          status: 'failed',
          error: errMsg,
          updatedAt: now,
        },
      }
    );

    if (upd.matchedCount === 0) {
      return res.status(404).json({ error: 'not found' });
    }

    const idStr = oid.toString();
    publishEvent(idStr, {
      type: 'status',
      data: { status: 'failed', error: errMsg, updatedAt: now },
    });
    await appendLog(jobs, oid, `Job failed: ${errMsg}`);

    // Reject the BullMQ promise — the queue will retry with backoff if
    // attempts remain, or give up and mark the doc terminally failed.
    signalFail(idStr, errMsg);

    res.json({ id: idStr, status: 'failed' });
  } catch (e) {
    next(e);
  }
});

// ---------- Worker: stream log line ----------
// POST /jobs/:id/logs  { message }
router.post('/:id/logs', async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.id);
    if (!oid) return res.status(400).json({ error: 'invalid job id' });

    const { message } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    const { jobs } = await getCollections();
    const doc = await jobs.findOne(
      { _id: oid, userId: req.user.id },
      { projection: { _id: 1 } }
    );
    if (!doc) return res.status(404).json({ error: 'not found' });

    await appendLog(jobs, oid, message);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------- Client: manual retry ----------
router.post('/:id/retry', async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.id);
    if (!oid) return res.status(400).json({ error: 'invalid job id' });

    const idStr = oid.toString();
    const { jobs } = await getCollections();

    const now = new Date();
    const result = await jobs.updateOne(
      { _id: oid, userId: req.user.id },
      {
        $set: {
          status: 'pending',
          error: null,
          result: null,
          updatedAt: now,
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'not found' });
    }

    publishEvent(idStr, {
      type: 'status',
      data: { status: 'pending', error: null, result: null, updatedAt: now },
    });
    await appendLog(jobs, oid, 'Job retry requested');

    try {
      await enqueueJob(idStr);
    } catch (e) {
      console.error('[jobs] retry enqueue failed', e);
    }

    res.json({ id: idStr, status: 'pending' });
  } catch (e) {
    next(e);
  }
});

// ---------- Client: SSE stream ----------
router.get('/:id/stream', async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.id);
    if (!oid) return res.status(400).json({ error: 'invalid job id' });

    const idStr = oid.toString();
    const { jobs } = await getCollections();

    const doc = await jobs.findOne({ _id: oid, userId: req.user.id });
    if (!doc) {
      return res.status(404).json({ error: 'not found' });
    }

    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const send = (event) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (_) {}
    };

    send({
      type: 'status',
      data: {
        status: doc.status,
        result: doc.result,
        error: doc.error,
        attempts: doc.attempts || 0,
        updatedAt: doc.updatedAt,
      },
    });

    for (const l of doc.logs || []) {
      send({ type: 'log', data: l });
    }

    addListener(idStr, res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch (_) {}
    }, 25000);

    const cleanup = () => {
      clearInterval(heartbeat);
      removeListener(idStr, res);
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
