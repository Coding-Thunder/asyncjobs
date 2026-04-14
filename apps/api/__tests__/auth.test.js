const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');

let cols, app;

beforeEach(() => {
  jest.resetModules();

  const { setupMockDb, setupMockEvents } = require('./helpers/mocks');
  cols = setupMockDb();
  setupMockEvents();

  const { buildApp } = require('./helpers/appFactory');
  app = buildApp();
});

describe('POST /auth/signup', () => {
  it('creates a new user and returns 201', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'test@example.com', password: 'secret123' });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');
    expect(cols.users.insertOne).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid email with 400', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'bad', password: 'secret123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid email/);
  });

  it('rejects short password with 400', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'test@example.com', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 characters/);
  });

  it('rejects duplicate email with 409', async () => {
    // Pre-seed a user
    cols.users.findOne.mockResolvedValueOnce({ email: 'test@example.com' });

    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'test@example.com', password: 'secret123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/);
  });
});

describe('POST /auth/login', () => {
  it('returns a JWT token for valid credentials', async () => {
    const hash = await bcrypt.hash('secret123', 10);
    const userId = new ObjectId();
    cols.users.findOne.mockResolvedValueOnce({
      _id: userId,
      email: 'test@example.com',
      password: hash,
      role: 'user',
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');

    // Verify token is valid JWT
    const decoded = jwt.verify(res.body.token, 'dev-secret-change-me');
    expect(decoded.sub).toBe(userId.toString());
  });

  it('rejects missing fields with 400', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({});

    expect(res.status).toBe(400);
  });

  it('rejects invalid credentials with 401', async () => {
    cols.users.findOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'no@user.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/);
  });

  it('rejects wrong password with 401', async () => {
    const hash = await bcrypt.hash('correct', 10);
    cols.users.findOne.mockResolvedValueOnce({
      _id: new ObjectId(),
      email: 'test@example.com',
      password: hash,
      role: 'user',
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'wrong' });

    expect(res.status).toBe(401);
  });
});
