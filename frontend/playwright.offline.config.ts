import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: ['full-offline.spec.ts', 'introduction.spec.ts'], workers: 1, timeout: 60000,
  expect: { timeout: 15000 },
  use: { ...devices['Desktop Chrome'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } } : { channel: 'chrome' }), baseURL: 'http://127.0.0.1:4174', timezoneId: 'Asia/Riyadh', trace: 'retain-on-failure' },
  reporter: [['list']],
  webServer: { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4174', url: 'http://127.0.0.1:4174', reuseExistingServer: false },
});
