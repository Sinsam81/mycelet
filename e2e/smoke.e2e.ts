import { test, expect } from './_setup/fixtures';

// Offentlige sider — kun lesing, ingen innlogging, ingen skriving til databasen.
// Trygg å kjøre mot produksjon (`npm run qa:prod`).

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

  test('prissiden viser begge planene med riktige priser (bygges i nettleseren)', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText('Premium').first()).toBeVisible();
    await expect(page.getByText(/Sesongpass/i).first()).toBeVisible();
    await expect(page.getByText('79').first()).toBeVisible();
    await expect(page.getByText('249').first()).toBeVisible();
  });

  test('sikkerhetssiden viser Giftinformasjonen', async ({ page }) => {
    await page.goto('/sikkerhet');
    await expect(page.getByText('Giftinformasjonen').first()).toBeVisible();
    await expect(page.getByText('22 59 13 00').first()).toBeVisible();
  });

  test('datakilder-siden krediterer kildene', async ({ page }) => {
    await page.goto('/datakilder');
    await expect(page.getByRole('heading', { name: /Datakilder/i }).first()).toBeVisible();
  });

  test('personvernsiden laster', async ({ page }) => {
    await page.goto('/personvern');
    await expect(page).toHaveTitle(/Personvern/i);
  });
});
