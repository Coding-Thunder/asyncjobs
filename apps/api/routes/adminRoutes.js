const express = require('express');
const { ObjectId } = require('mongodb');
const { getCollections } = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { publishEvent } = require('../events');
const { getPlan } = require('../plans');
const { enqueueJob } = require('../queue');

const router = express.Router();

router.use(requireAuth);
router.use(requireAdmin);

function toObjectId(str) {
  try {
    return new ObjectId(str);
  } catch {
    return null;
  }
}

router.get('/users', async (req, res, next) => {
  try {
    const { users } = await getCollections();
    const list = await users
      .find({})
      .project({ password: 0 })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      users: list.map((u) => ({
        id: u._id.toString(),
        email: u.email,
        role: u.role || 'user',
        plan: u.plan || 'free',
        jobCountMonthly: u.jobCountMonthly || 0,
        lastResetAt: u.lastResetAt,
        createdAt: u.createdAt,
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/users/:id/jobs', async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.id);
    if (!oid) return res.status(400).json({ error: 'invalid user id' });

    const { jobs } = await getCollections();
    const list = await jobs
      .find({ userId: oid })
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

router.get('/jobs/:id', async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.id);
    if (!oid) return res.status(400).json({ error: 'invalid job id' });

    const { jobs } = await getCollections();
    const doc = await jobs.findOne({ _id: oid });
    if (!doc) return res.status(404).json({ error: 'not found' });

    const { _id, userId, logs, ...rest } = doc;

    res.json({
      job: { id: _id.toString(), userId: userId.toString(), ...rest },
      logs: logs || [],
    });
  } catch (e) {
    next(e);
  }
});

router.post('/jobs/:id/retry', async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.id);
    if (!oid) return res.status(400).json({ error: 'invalid job id' });

    const idStr = oid.toString();
    const { users, jobs } = await getCollections();

    const now = new Date();
    const adminLog = {
      id: new ObjectId().toString(),
      message: 'Job retry requested by admin',
      timestamp: now,
    };

    const existing = await jobs.findOne({ _id: oid }, { projection: { userId: 1 } });
    if (!existing) return res.status(404).json({ error: 'not found' });

    const updated = await jobs.findOneAndUpdate(
      { _id: oid, status: { $in: ['failed', 'completed'] } },
      {
        $set: {
          status: 'pending',
          error: null,
          result: null,
          attempts: 0,
          updatedAt: now,
        },
        $push: { logs: { $each: [adminLog], $slice: -500 } },
      },
      { returnDocument: 'after' }
    );

    const doc = updated && (updated.value || updated);
    if (!doc || !doc._id) {
      const current = await jobs.findOne({ _id: oid }, { projection: { status: 1 } });
      return res.status(409).json({
        error: 'job_not_retriable',
        status: current ? current.status : null,
      });
    }

    // Admin retry still counts against the owner's monthly plan.
    await users.updateOne(
      { _id: existing.userId },
      { $inc: { jobCountMonthly: 1 } }
    );

    publishEvent(idStr, {
      type: 'status',
      data: {
        status: 'pending',
        error: null,
        result: null,
        attempts: 0,
        updatedAt: now,
      },
    });
    publishEvent(idStr, { type: 'log', data: adminLog });

    try {
      await enqueueJob(idStr);
    } catch (e) {
      console.error('[admin] retry enqueue failed', e);
    }

    res.json({ id: idStr, status: 'pending' });
  } catch (e) {
    next(e);
  }
});

router.post('/users/:id/plan', async (req, res, next) => {
  try {
    const { plan } = req.body || {};
    if (!plan || !['free', 'pro'].includes(plan)) {
      return res.status(400).json({ error: 'plan must be "free" or "pro"' });
    }

    const oid = toObjectId(req.params.id);
    if (!oid) return res.status(400).json({ error: 'invalid user id' });

    const { users } = await getCollections();
    const result = await users.updateOne(
      { _id: oid },
      { $set: { plan } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'user not found' });
    }

    const user = await users.findOne({ _id: oid });
    const planConfig = getPlan(plan);

    res.json({
      id: user._id.toString(),
      email: user.email,
      plan: user.plan,
      jobCountMonthly: user.jobCountMonthly || 0,
      limit: planConfig.monthlyJobLimit,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
