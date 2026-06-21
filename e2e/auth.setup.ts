import { test as setup, expect } from './_setup/fixtures';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { AUTH_FILE, QA_EMAIL, QA_PASSWORD, hasQaCreds } from './_setup/auth';

// Logs the dedicated QA user in once via the real login form and saves the
// session for the authed test project to reuse. This doubles as the
// "innlogging fungerer" check (success criterion 6) — if login breaks with
// valid creds, THIS step fails loudly.

setup('authenticate', async ({ page }) => {
  // Always ensure the storageState path exists so the authed project can point
  // at it even when no QA user is configured (those tests skip themselves).
  mkdirSync(dirname(AUTH_FILE), { recursive: true });

  if (!hasQaCreds()) {
    writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip(true, 'QA-testbruker ikke satt opp — kjør `npm run qa:setup`.');
    return;
  }

  await page.goto('/auth/login');
  await page.locator('input[type="email"]').fill(QA_EMAIL);
  await page.locator('input[type="password"]').fill(QA_PASSWORD);
  await page.getByRole('button', { name: 'Logg inn' }).click();

  // On success the app routes away from /auth/login. A wrong password keeps us
  // here and surfaces "Kunne ikke logge inn".
  await expect(page.getByText(/Kunne ikke logge inn|Invalid login/i)).toHaveCount(0);
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/login'), { timeout: 20_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
