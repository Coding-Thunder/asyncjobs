const express = require('express');
const { getCollections } = require('../db');
const { requireAuth } = require('../auth');
const { getPlan, ensureMonthlyReset } = require('../plans');

const router = express.Router();
router.use(requireAuth);

router.get('/me', async (req, res, next) => {
  try {
    const { users } = await getCollections();
    const user = await users.findOne({ _id: req.user.id });
    if (!user) return res.status(401).json({ error: 'user not found' });

    await ensureMonthlyReset(users, user);
    const plan = getPlan(user.plan);

    res.json({
      email: user.email,
      role: user.role || 'user',
      plan: user.plan || 'free',
      jobCountMonthly: user.jobCountMonthly || 0,
      limit: plan.monthlyJobLimit,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/upgrade', async (req, res, next) => {
  try {
    const { users } = await getCollections();
    await users.updateOne(
      { _id: req.user.id },
      { $set: { plan: 'pro' } }
    );

    const plan = getPlan('pro');
    const user = await users.findOne({ _id: req.user.id });

    res.json({
      email: user.email,
      plan: 'pro',
      jobCountMonthly: user.jobCountMonthly || 0,
      limit: plan.monthlyJobLimit,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
