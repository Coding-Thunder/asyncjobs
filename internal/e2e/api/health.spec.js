const { test, expect } = require('@playwright/test');

const API_URL = process.env.API_URL || 'http://localhost:4000';

test.describe('API Smoke Tests — Health', () => {
  test('GET /health returns ok', async ({ request }) => {
    const res = await request.get(`${API_URL}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('GET /nonexistent returns 404', async ({ request }) => {
    const res = await request.get(`${API_URL}/nonexistent`);
    expect(res.status()).toBe(404);
  });
});
