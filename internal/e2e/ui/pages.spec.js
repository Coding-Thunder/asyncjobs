const { test, expect } = require('@playwright/test');

test.describe('Frontend Smoke Tests — Public Pages', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/AsyncOps/i);
    // Check for key landing-page content
    const body = await page.textContent('body');
    expect(body).toMatch(/async/i);
  });

  test('login page loads', async ({ page }) => {
    await page.goto('/login');
    // Should show email and password fields
    await expect(page.locator('input[aria-label="email"]')).toBeVisible();
    await expect(page.locator('input[aria-label="password"]')).toBeVisible();
  });

  test('signup page loads', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('input[aria-label="email"]')).toBeVisible();
    await expect(page.locator('input[aria-label="password"]')).toBeVisible();
  });

  test('pricing page loads', async ({ page }) => {
    await page.goto('/pricing');
    const body = await page.textContent('body');
    expect(body).toMatch(/free|pro/i);
  });
});

test.describe('Frontend Smoke Tests — Auth Flow', () => {
  const testEmail = `ui-smoke-${Date.now()}@test.com`;
  const testPassword = 'smoketest123';

  test('signup → login → dashboard redirect', async ({ page, request }) => {
    // 1. Sign up via API (faster than filling form)
    const API_URL = process.env.API_URL || 'http://localhost:4000';
    await request.post(`${API_URL}/auth/signup`, {
      data: { email: testEmail, password: testPassword },
    });

    // 2. Use login page
    await page.goto('/login');

    // Wait for boot animation to finish and inputs to appear
    await page.waitForSelector('input[aria-label="email"]', { timeout: 5000 });

    // Fill in credentials
    await page.locator('input[aria-label="email"]').fill(testEmail);
    await page.locator('input[aria-label="password"]').fill(testPassword);

    // Submit
    await page.locator('input[aria-label="password"]').press('Enter');

    // Should redirect to dashboard
    await page.waitForURL('**/dashboard/**', { timeout: 10000 });
    expect(page.url()).toContain('/dashboard');
  });
});

test.describe('Frontend Smoke Tests — Dashboard (requires auth)', () => {
  let token;
  const API_URL = process.env.API_URL || 'http://localhost:4000';

  test.beforeEach(async ({ page, request }) => {
    // Create account and get token
    const email = `dash-${Date.now()}@test.com`;
    await request.post(`${API_URL}/auth/signup`, {
      data: { email, password: 'smoketest123' },
    });
    const loginRes = await request.post(`${API_URL}/auth/login`, {
      data: { email, password: 'smoketest123' },
    });
    const body = await loginRes.json();
    token = body.token;

    // Inject auth into localStorage before navigating
    await page.goto('/');
    await page.evaluate(({ tk, user }) => {
      localStorage.setItem('token', tk);
      localStorage.setItem('user', JSON.stringify(user));
    }, { tk: token, user: body.user });
  });

  test('jobs page loads and shows empty state', async ({ page }) => {
    await page.goto('/dashboard/jobs');
    await page.waitForSelector('[class*="font-mono"]', { timeout: 5000 });
    const body = await page.textContent('body');
    // Should show jobs heading or empty state
    expect(body).toMatch(/jobs|no jobs/i);
  });

  test('keys page loads', async ({ page }) => {
    await page.goto('/dashboard/keys');
    await page.waitForSelector('[class*="font-mono"]', { timeout: 5000 });
    const body = await page.textContent('body');
    expect(body).toMatch(/key|api/i);
  });

  test('docs page loads', async ({ page }) => {
    await page.goto('/dashboard/docs');
    await page.waitForSelector('[class*="font-mono"]', { timeout: 5000 });
    const body = await page.textContent('body');
    expect(body).toMatch(/api|documentation|endpoint/i);
  });
});
