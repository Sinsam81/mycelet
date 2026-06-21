import { defineConfig, devices } from '@playwright/test';
import { AUTH_FILE } from './e2e/_setup/auth';

// Full produktevaluering + røyktest.
//
// `npm run qa`       → mot http://localhost:3000 (starter dev-server automatisk).
// `npm run qa:prod`  → kun lesende røyktest mot mycelet.com (trygg mot prod).
//
// Overstyr fritt med PLAYWRIGHT_BASE_URL.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://www.mycelet.com';
const isLocal = baseURL.includes('localhost') || baseURL.includes('127.0.0.1');

export default defineConfig({
  testDir: './e2e',
  // Bevisst .e2e.ts / .setup.ts (ikke .spec/.test) så Vitest ikke plukker dem opp.
  testMatch: ['**/*.e2e.ts', '**/*.setup.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Lokalt: 1 retry så en sjelden kald-kompilerings-flak ikke gir falsk rød.
  retries: process.env.CI ? 2 : isLocal ? 1 : 0,
  // Lokal dev-server kompilerer ruter ved første treff → litt rausere tid.
  timeout: isLocal ? 60_000 : 30_000,
  // Varm opp serveren (ruter + middleware) før testene kjører.
  globalSetup: './e2e/_setup/global-setup.ts',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    navigationTimeout: isLocal ? 30_000 : 15_000
  },

  projects: [
    // Logger QA-brukeren inn én gang og lagrer sesjonen.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    // Offentlige flyt — ingen innlogging nødvendig. Kjører alltid.
    {
      name: 'public',
      testMatch: ['smoke.e2e.ts', 'public-api.e2e.ts', 'auth-pages.e2e.ts', 'billing-gating.e2e.ts'],
      use: { ...devices['Desktop Chrome'] }
    },

    // Innlogget flyt — krever testbruker. Bruker lagret sesjon fra `setup`.
    {
      name: 'authed',
      testMatch: ['authed-flows.e2e.ts', 'map-geo.e2e.ts'],
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE }
    }
  ],

  // Bare lokalt: start (eller gjenbruk) dev-serveren før testene.
  webServer: isLocal
    ? {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000
      }
    : undefined
});
