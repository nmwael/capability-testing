import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 0 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: [['html'], ['json']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    screenshot: process.env.CI ? 'off' : 'off',
    trace: process.env.CI ? 'off' : 'off'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});