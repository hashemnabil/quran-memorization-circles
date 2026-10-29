import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: 'personal-workflows.spec.ts', workers: 1, timeout: 60000,
  use: { channel: 'chrome', baseURL: 'http://127.0.0.1:4190', viewport: { width: 390, height: 844 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  reporter: [['list']],
  webServer: { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4190', url: 'http://127.0.0.1:4190', reuseExistingServer: false },
});
