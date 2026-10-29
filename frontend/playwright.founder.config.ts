import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: 'founder.spec.ts', workers: 1, timeout: 60000,
  use: { channel: 'chrome', baseURL: 'http://127.0.0.1:4192', viewport: { width: 390, height: 844 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  reporter: [['list']], webServer: { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4192', url: 'http://127.0.0.1:4192', reuseExistingServer: false },
});
