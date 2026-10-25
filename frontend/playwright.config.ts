import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: [['html'], ['json']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    screenshot: process.env.CI ? 'only-on-failure' : 'on',
    trace: process.env.CI ? 'retain-on-failure' : 'on'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});