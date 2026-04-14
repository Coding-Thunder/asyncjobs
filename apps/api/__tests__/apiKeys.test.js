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

describe('POST /api-keys', () => {
  it('creates an API key and returns the raw key once', async () => {
    const res = await request(app)
      .post('/api-keys')
      .set(authHeader())
      .send({ name: 'My Key' });

    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^ak_live_/);
    expect(res.body.name).toBe('My Key');
    // Prefix is the first 8 chars of the random portion, not the marker.
    expect(res.body.prefix).toBe(res.body.key.slice(8, 16));
    expect(res.body.prefix).not.toBe('ak_live_');
    expect(cols.api_keys.insertOne).toHaveBeenCalledTimes(1);
  });

  it('rejects missing name with 400', async () => {
    const res = await request(app)
      .post('/api-keys')
      .set(authHeader())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name is required/);
  });

  it('rejects unauthenticated with 401', async () => {
    const res = await request(app)
      .post('/api-keys')
      .send({ name: 'test' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api-keys', () => {
  it('returns list of keys without hashes', async () => {
    const keyId = new ObjectId();
    cols.api_keys.find.mockReturnValue({
      project: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      toArray: jest.fn(async () => [
        { _id: keyId, name: 'My Key', prefix: 'ak_live_', createdAt: new Date(), lastUsedAt: null },
      ]),
    });

    const res = await request(app)
      .get('/api-keys')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.keys).toHaveLength(1);
    expect(res.body.keys[0].name).toBe('My Key');
    // Ensure keyHash is not exposed
    expect(res.body.keys[0].keyHash).toBeUndefined();
  });
});

describe('DELETE /api-keys/:id', () => {
  it('deletes an API key', async () => {
    const keyId = new ObjectId();
    cols.api_keys.deleteOne.mockResolvedValueOnce({ deletedCount: 1 });

    const res = await request(app)
      .delete(`/api-keys/${keyId}`)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });

  it('returns 404 for non-existent key', async () => {
    cols.api_keys.deleteOne.mockResolvedValueOnce({ deletedCount: 0 });

    const res = await request(app)
      .delete(`/api-keys/${new ObjectId()}`)
      .set(authHeader());

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid key id', async () => {
    const res = await request(app)
      .delete('/api-keys/not-valid')
      .set(authHeader());

    expect(res.status).toBe(400);
  });
});
