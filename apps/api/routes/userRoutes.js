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

// Public self-service plan upgrade is intentionally removed — AsyncOps has
// no billing integration yet. Plans are admin-managed via
// POST /admin/users/:id/plan. See docs/admin.md.

module.exports = router;
