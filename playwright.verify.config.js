const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './__tests_verify__',
  testMatch: ['**/*.spec.js'],

  timeout: 15_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],

  use: {
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
