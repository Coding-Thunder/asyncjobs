const PLANS = {
  free: {
    name: 'free',
    monthlyJobLimit: 1000,
  },
  pro: {
    name: 'pro',
    monthlyJobLimit: 50000,
  },
};

function getPlan(name) {
  return PLANS[name] || PLANS.free;
}

function sameMonth(a, b) {
  if (!a || !b) return false;
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth()
  );
}

async function ensureMonthlyReset(users, user) {
  const now = new Date();
  const last = user.lastResetAt ? new Date(user.lastResetAt) : null;
  if (sameMonth(last, now)) return user;

  await users.updateOne(
    { _id: user._id },
    { $set: { jobCountMonthly: 0, lastResetAt: now } }
  );
  user.jobCountMonthly = 0;
  user.lastResetAt = now;
  return user;
}

module.exports = { PLANS, getPlan, ensureMonthlyReset };
