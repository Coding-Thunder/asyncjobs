const request = require('supertest');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');

let cols, app;

const userId = new ObjectId();
const token = jwt.sign(
  { sub: userId.toString(), email: 'test@example.com', role: 'user' },
  'dev-secret-change-me',
  { expiresIn: '1h' }
);

beforeEach(() => {
  jest.resetModules();

  const { setupMockDb, setupMockEvents } = require('./helpers/mocks');
  cols = setupMockDb();
  setupMockEvents();

  const { buildApp } = require('./helpers/appFactory');
  app = buildApp();
});

function authHeader() {
  return { Authorization: `Bearer ${token}` };
}

describe('GET /me', () => {
  it('returns the current user profile', async () => {
    cols.users.findOne.mockResolvedValueOnce({
      _id: userId,
      email: 'test@example.com',
      role: 'user',
      plan: 'free',
      jobCountMonthly: 5,
      lastResetAt: new Date(),
    });

    const res = await request(app)
      .get('/me')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('test@example.com');
    expect(res.body.plan).toBe('free');
    expect(res.body.limit).toBe(1000);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /upgrade', () => {
  it('upgrades user plan to pro', async () => {
    cols.users.updateOne.mockResolvedValueOnce({ matchedCount: 1 });
    cols.users.findOne.mockResolvedValueOnce({
      _id: userId,
      email: 'test@example.com',
      plan: 'pro',
      jobCountMonthly: 5,
    });

    const res = await request(app)
      .post('/upgrade')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('pro');
    expect(res.body.limit).toBe(50000);
  });
});
