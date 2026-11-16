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
    // 99 siden 2026-09-01 (prisendringen i PR #213) — 79 gjelder kun eksisterende abonnenter.
    await expect(page.getByText('99').first()).toBeVisible();
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

// Landingssiden besøkende faktisk ser er den STATISKE fila i public/landing/,
// som mellomvaren skriver «/» om til. React-komponenten LandingPage er bare
// reserven der mellomvaren ikke kjører — altså lokalt, og dermed i `npm run qa`.
// QA-løkka prøvde derfor en landingsside ingen besøkende får. Denne ene sjekken
// kjører mot prod og ser at «/» virkelig er den statiske fila.
test.describe('Den ekte landingssiden', () => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? '';
  const isLocalDev = baseURL.includes('localhost') || baseURL.includes('127.0.0.1');

  test('«/» serverer den statiske landingssiden til utloggede', async ({ request }) => {
    test.skip(
      isLocalDev,
      'Mellomvaren kjører ikke i lokal Turbopack-dev — verifiseres mot prod (npm run qa:prod).'
    );
    const svar = await request.get('/');
    expect(svar.status()).toBe(200);
    // Selvhostet skrift som bare den statiske fila laster (norsk og svensk utgave).
    expect(await svar.text()).toContain('/landing/f1.woff2');
  });
});

// Toppen og bunnmenyen for en som IKKE er logget inn. Reglene er enhetstestet
// (src/lib/nav/__tests__/hjem.test.ts); her sjekkes at de to komponentene
// faktisk får innlogging og plattform fra nettleseren. Kun lesing.
test.describe('Utlogget — toppen og bunnmenyen', () => {
  test('toppen har «Logg inn», med veien tilbake til siden', async ({ page }) => {
    await page.goto('/species');
    const lenke = page.locator('header').first().getByRole('link', { name: /^(Logg inn|Logga in)$/ });
    await expect(lenke).toBeVisible();
    await expect(lenke).toHaveAttribute('href', '/auth/login?next=%2Fspecies');
  });

  test('i appen (simulert) er Hjem /soppforhold, og fanen lyser der', async ({ page }) => {
    // Samme markør som billing-gating.e2e.ts: Capacitor.isNativePlatform() blir sann.
    await page.addInitScript(() => {
      (window as Window & { CapacitorCustomPlatform?: unknown }).CapacitorCustomPlatform = {
        name: 'ios',
        plugins: {}
      };
    });
    await page.goto('/soppforhold');
    const hjem = page
      .getByRole('navigation', { name: /Hovedmeny|Huvudmeny/ })
      .getByRole('link', { name: /^(Hjem|Hem)$/ });
    // «/» var en full sidelasting via landingssiden og tilbake hit, og ingen fane lyste.
    await expect(hjem).toHaveAttribute('href', '/soppforhold');
    await expect(hjem).toHaveAttribute('aria-current', 'page');
  });
});
