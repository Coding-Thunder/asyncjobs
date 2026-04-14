const { test, expect } = require('@playwright/test');

const API_URL = process.env.API_URL || 'http://localhost:4000';

let token;

test.beforeAll(async ({ request }) => {
  const email = `jobs-smoke-${Date.now()}@test.com`;
  await request.post(`${API_URL}/auth/signup`, {
    data: { email, password: 'smoketest123' },
  });
  const loginRes = await request.post(`${API_URL}/auth/login`, {
    data: { email, password: 'smoketest123' },
  });
  const body = await loginRes.json();
  token = body.token;
});

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

test.describe('API Smoke Tests — Jobs', () => {
  test('POST /jobs creates a job', async ({ request }) => {
    const res = await request.post(`${API_URL}/jobs`, {
      headers: authHeaders(),
      data: { type: 'send-email', data: { to: 'test@example.com' } },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.status).toBe('pending');
  });

  test('GET /jobs lists jobs', async ({ request }) => {
    const res = await request.get(`${API_URL}/jobs`, {
      headers: authHeaders(),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.jobs)).toBe(true);
  });

  test('GET /jobs/:id returns job detail', async ({ request }) => {
    // Create a job first
    const createRes = await request.post(`${API_URL}/jobs`, {
      headers: authHeaders(),
      data: { type: 'process-data', data: { items: [1, 2] } },
    });
    const { id } = await createRes.json();

    const res = await request.get(`${API_URL}/jobs/${id}`, {
      headers: authHeaders(),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.job.id).toBe(id);
    expect(Array.isArray(body.logs)).toBe(true);
  });

  test('POST /jobs rejects without auth', async ({ request }) => {
    const res = await request.post(`${API_URL}/jobs`, {
      data: { type: 'test' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /jobs/:id returns 400 for invalid id', async ({ request }) => {
    const res = await request.get(`${API_URL}/jobs/not-a-valid-id`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('API Smoke Tests — User Profile', () => {
  test('GET /me returns current user', async ({ request }) => {
    const res = await request.get(`${API_URL}/me`, {
      headers: authHeaders(),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.email).toBeDefined();
    expect(body.plan).toBe('free');
  });
});

test.describe('API Smoke Tests — API Keys', () => {
  test('full CRUD lifecycle for API keys', async ({ request }) => {
    // Create
    const createRes = await request.post(`${API_URL}/api-keys`, {
      headers: authHeaders(),
      data: { name: 'Smoke Test Key' },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    expect(created.key).toMatch(/^ak_live_/);

    // List
    const listRes = await request.get(`${API_URL}/api-keys`, {
      headers: authHeaders(),
    });
    expect(listRes.ok()).toBeTruthy();
    const listed = await listRes.json();
    expect(listed.keys.length).toBeGreaterThanOrEqual(1);

    // Delete
    const delRes = await request.delete(`${API_URL}/api-keys/${created.id}`, {
      headers: authHeaders(),
    });
    expect(delRes.ok()).toBeTruthy();
    const deleted = await delRes.json();
    expect(deleted.deleted).toBe(true);
  });
});
