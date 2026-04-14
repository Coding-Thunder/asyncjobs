const { PLANS, getPlan, ensureMonthlyReset } = require('../plans');

describe('getPlan', () => {
  it('returns free plan by default', () => {
    expect(getPlan('free').name).toBe('free');
    expect(getPlan('free').monthlyJobLimit).toBe(1000);
  });

  it('returns pro plan', () => {
    expect(getPlan('pro').name).toBe('pro');
    expect(getPlan('pro').monthlyJobLimit).toBe(50000);
  });

  it('falls back to free for unknown plan', () => {
    expect(getPlan('enterprise').name).toBe('free');
    expect(getPlan(undefined).name).toBe('free');
  });
});

describe('ensureMonthlyReset', () => {
  it('does not reset if same month', async () => {
    const mockUsers = { updateOne: jest.fn() };
    const user = {
      _id: 'u1',
      jobCountMonthly: 50,
      lastResetAt: new Date(),
    };

    await ensureMonthlyReset(mockUsers, user);

    expect(mockUsers.updateOne).not.toHaveBeenCalled();
    expect(user.jobCountMonthly).toBe(50);
  });

  it('resets counter if different month', async () => {
    const mockUsers = { updateOne: jest.fn(async () => {}) };
    const oldDate = new Date();
    oldDate.setUTCMonth(oldDate.getUTCMonth() - 2);

    const user = {
      _id: 'u1',
      jobCountMonthly: 500,
      lastResetAt: oldDate,
    };

    await ensureMonthlyReset(mockUsers, user);

    expect(mockUsers.updateOne).toHaveBeenCalledTimes(1);
    expect(user.jobCountMonthly).toBe(0);
  });

  it('resets if lastResetAt is null', async () => {
    const mockUsers = { updateOne: jest.fn(async () => {}) };
    const user = {
      _id: 'u1',
      jobCountMonthly: 100,
      lastResetAt: null,
    };

    await ensureMonthlyReset(mockUsers, user);

    expect(mockUsers.updateOne).toHaveBeenCalledTimes(1);
    expect(user.jobCountMonthly).toBe(0);
  });
});

describe('PLANS constants', () => {
  it('free plan has a monthly job limit', () => {
    expect(PLANS.free.monthlyJobLimit).toBe(1000);
  });

  it('pro plan has a higher monthly job limit', () => {
    expect(PLANS.pro.monthlyJobLimit).toBe(50000);
  });
});
