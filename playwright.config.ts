import { defineConfig, devices } from '@playwright/test';

// Use PORT env var (set by npm test scripts) to avoid conflicts when multiple test sessions run in parallel
const port = Number(process.env.PORT) || 8765;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html']] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${port}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npx serve -l ${port} -s .`,
    port,
    reuseExistingServer: !process.env.CI,
  },
});
