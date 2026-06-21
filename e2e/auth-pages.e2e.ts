import { test, expect } from './_setup/fixtures';

// Innlogging, glemt-passord og tilgangskontroll. Kun lesing av offentlige
// auth-sider — ingen ekte innlogging her (det skjer i auth.setup.ts).

test.describe('Innlogging og glemt passord', () => {
  test('innloggingssiden har e-post + passord + Logg inn', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logg inn' })).toBeVisible();
  });

  test('«Glemt passord?» går til /auth/forgot med e-postfelt', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('link', { name: /Glemt passord/i }).click();
    await expect(page).toHaveURL(/\/auth\/forgot/);
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Send lenke/i })).toBeVisible();
  });

  test('registreringssiden laster med skjemafelt', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page.locator('input').first()).toBeVisible();
  });
});

test.describe('Tilgangskontroll — beskyttede sider sender til innlogging', () => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? '';
  const isLocalDev = baseURL.includes('localhost') || baseURL.includes('127.0.0.1');

  // /mine-steder gater på side-nivå (server `redirect()`) → virker i dev OG prod.
  for (const path of ['/mine-steder']) {
    test(`${path} redirecter uinnlogget til /auth/login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth\/login/);
    });
  }

  // Disse gater via middleware. Next/Turbopack kjører IKKE middleware i lokal dev
  // (verifisert: virker i prod). Derfor sjekkes de mot prod (npm run qa:prod) og
  // hoppes over lokalt — ellers falsk rød.
  for (const path of ['/profile', '/map', '/forum/new', '/admin']) {
    test(`${path} redirecter uinnlogget til /auth/login`, async ({ page }) => {
      test.skip(
        isLocalDev,
        'Middleware-gating kjører ikke i lokal Turbopack-dev — verifiseres mot prod (npm run qa:prod).'
      );
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth\/login/);
    });
  }
});
