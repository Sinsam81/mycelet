import { defineConfig, devices } from '@playwright/test';

// E2E-røyktest. Kjører som standard mot den deployede appen (mycelet.com).
// Overstyr med PLAYWRIGHT_BASE_URL=http://localhost:3000 for å teste lokalt.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://www.mycelet.com';

export default defineConfig({
  testDir: './e2e',
  // Bevisst .e2e.ts (ikke .spec/.test) så Vitest ikke plukker opp disse.
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
