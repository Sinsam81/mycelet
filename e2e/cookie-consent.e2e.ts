import type { Page } from '@playwright/test';
import { test, expect } from './_setup/fixtures';

// Analyse-samtykke skal bare kunne gis ved et trykk i samtykke-dialogen.
//
// Funn H11: notisen lå i `bottom-0` med samme z-index som bunnmenyen, og siden
// den rendres sist i layouten vant den. Et trykk på «Kart» i bunnmenyen traff i
// realiteten «Tillat analyse» — GA4 ble lastet uten at brukeren hadde tatt
// stilling til noe — og resten av bunnmenyen var død til notisen var besvart.
// Testene under kjører i mobilstørrelse, der overlappen var størst.

const CONSENT_KEY = 'mycelet:analytics-consent-v1';

// Alle posisjonene i bunnmenyen. '/map' er innloggingsbeskyttet i produksjon,
// så den brukes bare til å bekrefte at et trykk ikke gir samtykke.
const NAV_HREFS = ['/', '/species', '/map', '/calendar'];

const readConsent = (page: Page) =>
  page.evaluate((key) => window.localStorage.getItem(key), CONSENT_KEY);

async function openWithNotice(page: Page) {
  await page.goto('/species');
  const notice = page.getByRole('dialog');
  await expect(notice).toBeVisible();
  return notice;
}

test.describe('Analyse-samtykke', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    // Fellesfixturen demper førstegangsoverlays; her vil vi ha notisen synlig.
    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem('mycelet:analytics-consent-v1');
        window.localStorage.setItem('mycelet:onboarding-v1', '1');
      } catch {
        // localStorage kan være blokkert — notisen vises da uansett.
      }
    });
  });

  test('ingen posisjon i bunnmenyen kan gi samtykke', async ({ page }) => {
    for (const href of NAV_HREFS) {
      await openWithNotice(page);

      const link = page.locator(`nav a[href="${href}"]`);
      const box = await link.boundingBox();
      expect(box, `fant ikke bunnmeny-lenken ${href}`).not.toBeNull();

      // Rått trykk på koordinatene, slik en finger gjør: det treffer elementet
      // som faktisk ligger øverst. Playwright sin .click() ville nektet å
      // klikke, og dermed skjult hva som lå over lenken.
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.waitForLoadState('domcontentloaded');

      expect(await readConsent(page), `trykk på ${href} registrerte et samtykke`).toBeNull();
    }
  });

  test('et trykk i bunnmenyen navigerer mens notisen står', async ({ page }) => {
    await openWithNotice(page);

    const box = await page.locator('nav a[href="/calendar"]').boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await expect(page).toHaveURL(/\/calendar/);
  });

  test('notisen dekker ikke bunnmenyen', async ({ page }) => {
    const notice = await openWithNotice(page);

    const noticeBox = await notice.boundingBox();
    const navBox = await page.locator('nav:has(a[href="/calendar"])').boundingBox();
    expect(noticeBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(navBox!.y);
  });

  test('bunnmeny-lenkene er klikkbare mens notisen står', async ({ page }) => {
    await openWithNotice(page);

    // Hjem-lenken utelates: i dev-server ligger Next sitt utviklerpanel i samme
    // hjørne og fanger trykket. Posisjonen dekkes av rå-trykk-testen over.
    for (const href of ['/species', '/calendar']) {
      await page.locator(`nav a[href="${href}"]`).click({ timeout: 5_000 });
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await openWithNotice(page);
    }
  });

  test('«Tillat analyse» i dialogen gir fortsatt samtykke', async ({ page }) => {
    const notice = await openWithNotice(page);

    await notice.getByRole('button', { name: /Tillat analyse|Tillåt analys/ }).click();

    await expect(notice).toBeHidden();
    expect(await readConsent(page)).toBe('granted');
  });
});
