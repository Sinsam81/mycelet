import { test, expect } from './_setup/fixtures';

// Betaling-gating: web skal vise Stripe-kjøp + Google-login; native-skallet skal
// skjule dem (App Store 3.1.1 ekstern betaling + 4.8 Sign in with Apple).
//
// «Native» simuleres ved å injisere Capacitors plattform-markør FØR appen laster,
// så `Capacitor.isNativePlatform()` (via useIsNative → NonNativeOnly) blir true.

test.describe('Web — Stripe + Google synlig', () => {
  test('pricing viser kjøpsknappene', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('button', { name: /Velg Premium/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Velg Sesongpass/i })).toBeVisible();
  });

  test('login viser «Fortsett med Google»', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('button', { name: /Fortsett med Google/i })).toBeVisible();
  });
});

test.describe('Native (simulert) — kjøp/Google skjult', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Capacitor.getPlatform() leser denne markøren → isNativePlatform() = true.
      (window as Window & { CapacitorCustomPlatform?: unknown }).CapacitorCustomPlatform = {
        name: 'ios',
        plugins: {}
      };
    });
  });

  test('pricing skjuler kjøpsknappene', async ({ page }) => {
    await page.goto('/pricing');
    // Gi useIsNative()-effekten tid til å flippe etter mount.
    await expect(page.getByText(/Sesongpass/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Velg Premium/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Velg Sesongpass/i })).toHaveCount(0);
  });

  test('login skjuler «Fortsett med Google»', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('button', { name: 'Logg inn' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Fortsett med Google/i })).toHaveCount(0);
  });
});
