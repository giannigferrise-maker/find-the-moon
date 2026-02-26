const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './__tests_ui__',

  // Max time per test (ms)
  timeout: 15_000,

  // No retries for now; enable in CI with process.env.CI ? 2 : 0
  retries: 0,

  // Run tests sequentially in one worker — avoids any file:// race conditions
  workers: 1,

  // Concise output
  reporter: [['list']],

  use: {
    headless: true,
    // Capture screenshot only when a test fails
    screenshot: 'only-on-failure',
    // Video: keep on failure for debugging
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
