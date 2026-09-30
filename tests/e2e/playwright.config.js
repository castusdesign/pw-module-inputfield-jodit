// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  // One ProcessWire site, reset before each test, so run one test at a time
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${process.env.E2E_PORT || 8090}`,
    viewport: { width: 1400, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      browserName: 'chromium',
      // Optional: use an already-installed Chromium, e.g. where Playwright can't
      // download its own (older Linux distributions)
      launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {},
    },
  }],
});
