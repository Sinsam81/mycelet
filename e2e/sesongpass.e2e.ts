import { test, expect } from './_setup/fixtures';
import { hasQaCreds } from './_setup/auth';

/**
 * Sesongpasset først — på telefonbredde, innlogget (authed-prosjektet).
 *
 * 7 av 8 prøver siden 12. september 2026 valgte måned, fordi passet var det
 * tredje kortet under bretten og arket bare leste Premium-tilbudet. Disse to
 * testene låser det som skal være annerledes: passet er første kort på
 * prissiden med sin pris, og prøvearket leder med passet og viser måneden
 * som et synlig alternativ.
 *
 * Lesende mot prod-databasen: betalingsstatusen mockes til «gratisbruker uten
 * rad» (så arket kan vises uansett hva QA-kontoen har), og bruksdag-kallet
 * stoppes i nettleseren i tillegg til at arket selv hopper over
 * navigator.webdriver. Ingen kjøp og ingen prøve startes.
 *
 * QA_SKJERMBILDE_DIR: settes til en mappe utenfor repoet for å få
 * skjermbilder; uten den tas ingen.
 */
test.use({ viewport: { width: 390, height: 844 } });

const SKJERMBILDER = process.env.QA_SKJERMBILDE_DIR;

async function skjermbilde(page: import('@playwright/test').Page, navn: string) {
  if (!SKJERMBILDER) return;
  await page.screenshot({ path: `${SKJERMBILDER}/${navn}.png` });
}

test.describe('Sesongpass først (390×844, innlogget)', () => {
  test.skip(!hasQaCreds(), 'QA-testbruker ikke satt opp — kjør `npm run qa:setup`.');

  test('prissiden: sesongpasset er første kort, anbefalt, med pris og fornyelsesdato', async ({ page }) => {
    await page.goto('/pricing?plan=season_pass');
    const kort = page.locator('article[data-plan]');
    await expect(kort).toHaveCount(3);
    await expect(kort.nth(0)).toHaveAttribute('data-plan', 'season_pass');
    await expect(kort.nth(1)).toHaveAttribute('data-plan', 'premium');
    await expect(kort.nth(2)).toHaveAttribute('data-plan', 'free');

    const pass = kort.nth(0);
    await expect(pass).toContainText('Sesongpass');
    await expect(pass).toContainText('249 kr');
    await expect(pass).toContainText('Anbefalt');
    await expect(pass).toContainText(/Tilsvarer ca\. 21 kr per måned/);
    await expect(pass).toContainText(/Fornyes ca\. \d{1,2}\. [a-zæøå]+ \d{4} om du ikke avslutter/);
    await expect(pass.getByRole('button', { name: /Velg Sesongpass/ })).toBeVisible();
    // ?plan=season_pass gir passet fokus.
    await expect(pass).toBeFocused();

    await skjermbilde(page, 'prissiden-390');
  });

  test('prøvearket leder med sesongpasset og viser måneden som synlig alternativ', async ({ page }) => {
    await page.route('**/api/billing/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subscription: null,
          capabilities: { tier: 'free', status: 'inactive', paid: false, aiDailyLimit: 5 }
        })
      })
    );
    await page.route('**/api/me/bruksdag', (route) => route.fulfill({ status: 204 }));
    // Utløseren «andre dag»: én kartdag lagret fra før, så dagens besøk er den andre.
    await page.addInitScript(() => {
      localStorage.setItem('mycelet:kartdager-v1', JSON.stringify(['2026-09-01']));
      localStorage.removeItem('mycelet:provetilbud-v1');
    });

    await page.goto('/map');
    const ark = page.getByRole('dialog');
    await expect(ark).toBeVisible({ timeout: 30_000 });
    await expect(ark.getByRole('heading')).toHaveText('Prøv Sesongpass gratis i 7 dager');
    await expect(ark).toContainText(/Passet gjelder til ca\. \d{1,2}\. [a-zæøå]+ \d{4}/);
    await expect(ark).toContainText('Deretter 249 kr per år');

    const lenker = ark.getByRole('link');
    await expect(lenker).toHaveCount(2);
    await expect(lenker.nth(0)).toHaveText('Prøv Sesongpass gratis');
    await expect(lenker.nth(0)).toHaveAttribute('href', '/pricing?plan=season_pass');
    await expect(lenker.nth(1)).toHaveText('Heller måned for måned? 99 kr per måned, de første 7 dagene gratis');
    await expect(lenker.nth(1)).toHaveAttribute('href', '/pricing?plan=premium');
    await expect(ark.getByRole('button', { name: 'Ikke nå' })).toBeVisible();

    await skjermbilde(page, 'provearket-390');
  });
});
