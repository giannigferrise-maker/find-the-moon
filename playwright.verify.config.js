const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './__tests_verify__',
  testMatch: ['**/*.spec.js'],

  timeout: 15_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],

  webServer: {
    command: 'python3 -m http.server 3999',
    url: 'http://localhost:3999',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },

  use: {
    headless: true,
    baseURL: 'http://localhost:3999',
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
