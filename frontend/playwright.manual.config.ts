import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e-manual',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:12345',
    viewport: { width: 1680, height: 950 },
    storageState: '/tmp/opencode/panshi-state.json',
    screenshot: 'off',
    trace: 'off',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { storageState: { cookies: [], origins: [] } } },
    { name: 'walk', testIgnore: /auth\.setup\.ts/, dependencies: ['setup'] },
  ],
})
