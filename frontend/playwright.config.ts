import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // e2e 套件共享同一 demo 数据库（manual-demo.db），多 worker 并行会相互污染
  // （破坏性 spec 删除/变更数据导致其余 spec 随机失败）。必须单 worker 串行执行。
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:9100',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 9100',
    url: 'http://localhost:9100',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});