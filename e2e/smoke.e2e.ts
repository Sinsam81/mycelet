import { test, expect } from '@playwright/test';

// Røyktest mot den deployede appen. Leser kun — ingen innlogging og ingen
// skriving til databasen — så den er trygg å kjøre mot produksjon.

test.describe('Offentlige sider', () => {
  test('forsiden laster og viser Mycelet', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Mycelet/i);
    await expect(page.getByText('Mycelet').first()).toBeVisible();
  });

  test('artsoversikten viser arter', async ({ page }) => {
    await page.goto('/species');
    await expect(page.locator('a[href^="/species/"]').first()).toBeVisible();
  });

  test('en art kan åpnes og viser detaljer', async ({ page }) => {
    await page.goto('/species');
    await page.locator('a[href^="/species/"]').first().click();
    await expect(page).toHaveURL(/\/species\/.+/);
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  test('kalenderen laster', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page).toHaveTitle(/Mycelet/i);
    await expect(page.getByText(/sesong/i).first()).toBeVisible();
  });

  test('prissiden viser begge planene (bygges i nettleseren)', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText('Premium').first()).toBeVisible();
    await expect(page.getByText(/Sesongpass/i).first()).toBeVisible();
    await expect(page.getByText('79').first()).toBeVisible();
    await expect(page.getByText('199').first()).toBeVisible();
  });

  test('sikkerhetssiden viser Giftinformasjonen', async ({ page }) => {
    await page.goto('/sikkerhet');
    await expect(page.getByText('Giftinformasjonen').first()).toBeVisible();
    await expect(page.getByText('22 59 13 00').first()).toBeVisible();
  });

  test('personvernsiden laster', async ({ page }) => {
    await page.goto('/personvern');
    await expect(page).toHaveTitle(/Personvern/i);
  });
});

test.describe('Innlogging og tilgangskontroll', () => {
  test('innloggingssiden har et passordfelt', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test('registreringssiden laster med skjemafelt', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page.locator('input').first()).toBeVisible();
  });

  test('beskyttet side (/profile) sender til innlogging', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('beskyttet side (/map) sender til innlogging', async ({ page }) => {
    await page.goto('/map');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
