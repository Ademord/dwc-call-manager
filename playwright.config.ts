import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 7000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/browser-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4320',
    browserName: 'chromium',
    channel:
      process.env.DWC_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true,
    viewport: { width: 1536, height: 1024 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node --import tsx src/server/start.ts',
    url: 'http://127.0.0.1:4320/',
    reuseExistingServer: false,
    timeout: 30000,
    env: { PORT: '4320', DWC_DB_PATH: '.data/browser-tests.sqlite' },
  },
});
