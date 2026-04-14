const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: 0,
  use: {
    headless: true,
    baseURL: process.env.WEB_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'api-smoke',
      testMatch: /api\/.*\.spec\.js/,
    },
    {
      name: 'ui-smoke',
      testMatch: /ui\/.*\.spec\.js/,
    },
  ],
});
