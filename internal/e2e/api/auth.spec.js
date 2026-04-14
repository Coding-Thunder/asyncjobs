const { test, expect } = require('@playwright/test');

const API_URL = process.env.API_URL || 'http://localhost:4000';

// Unique email per test run to avoid conflicts
const testEmail = `smoke-${Date.now()}@test.com`;
const testPassword = 'smoketest123';

test.describe('API Smoke Tests — Auth', () => {
  test('POST /auth/signup creates a user', async ({ request }) => {
    const res = await request.post(`${API_URL}/auth/signup`, {
      data: { email: testEmail, password: testPassword },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.user.email).toBe(testEmail);
  });

  test('POST /auth/signup rejects duplicate email', async ({ request }) => {
    // First create the user
    await request.post(`${API_URL}/auth/signup`, {
      data: { email: `dup-${Date.now()}@test.com`, password: testPassword },
    });

    // Attempt to create the same user
    const email = `dup2-${Date.now()}@test.com`;
    await request.post(`${API_URL}/auth/signup`, {
      data: { email, password: testPassword },
    });
    const res = await request.post(`${API_URL}/auth/signup`, {
      data: { email, password: testPassword },
    });
    expect(res.status()).toBe(409);
  });

  test('POST /auth/login returns a token', async ({ request }) => {
    const email = `login-${Date.now()}@test.com`;
    await request.post(`${API_URL}/auth/signup`, {
      data: { email, password: testPassword },
    });

    const res = await request.post(`${API_URL}/auth/login`, {
      data: { email, password: testPassword },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.token).toBeDefined();
    expect(body.user.email).toBe(email);
  });

  test('POST /auth/login rejects wrong password', async ({ request }) => {
    const email = `badpw-${Date.now()}@test.com`;
    await request.post(`${API_URL}/auth/signup`, {
      data: { email, password: testPassword },
    });

    const res = await request.post(`${API_URL}/auth/login`, {
      data: { email, password: 'wrongwrong' },
    });
    expect(res.status()).toBe(401);
  });
});
