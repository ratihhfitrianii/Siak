import { defineConfig } from '@playwright/test';

/**
 * E2E Playwright (T5.7) — critical path: login (AC-08).
 * - Backend: dev server :3000 (reuse bila sudah jalan — mis. stack docker lokal)
 * - Frontend: vite dev :5173 (proxy /api → :3000)
 * Di CI: kedua server di-start oleh Playwright (cwd diarahkan ke folder masing-masing).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../backend',
      url: 'http://localhost:3000/api/v1/health/ready',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      cwd: '.',
      url: 'http://localhost:5173/login',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
