import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 0 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: [['html'], ['json']],
  // The specs target http://127.0.0.1:3000 but nothing in the repository
  // started the app, so the suite only ran if a dev server was launched by
  // hand first. Playwright now starts one and tears it down afterwards.
  // reuseExistingServer means a server already on :3000 (a hand-started one, or
  // the previous config's setup) is used rather than rejected, but CI always
  // starts from a clean slate so a stale process can never mask a real failure.
  webServer: {
    command: 'npm run dev -- --port 3000 --host 127.0.0.1',
    url: 'http://127.0.0.1:3000/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  use: {
    baseURL: 'http://127.0.0.1:3000',
    screenshot: process.env.CI ? 'off' : 'off',
    trace: process.env.CI ? 'off' : 'off',
    launchOptions: process.env.CI
      ? {
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-features=VizDisplayCompositor,BlinkGenPropertyTrees,SkiaRenderer',
          ],
        }
      : {},
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
