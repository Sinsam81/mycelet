import { test, expect } from './_setup/fixtures';
import type { Page } from '@playwright/test';
import { hasQaCreds } from './_setup/auth';

// Kart + posisjon + NO/SE-ruting — bug-klassen som rammet prod (svensk kart blankt,
// fast i Oslo, død «Finn meg»). Kartet er innlogging-gated, så authed-prosjektet
// kjører dette med lagret sesjon.

test.beforeEach(async () => {
  test.skip(!hasQaCreds(), 'QA-testbruker ikke satt opp — kjør `npm run qa:setup`.');
});

const OSLO = { latitude: 59.9139, longitude: 10.7522 };
const GOTHENBURG = { latitude: 57.7089, longitude: 11.9746 };

async function openMap(page: Page) {
  await page.goto('/map');
  await expect(page, '/map redirectet til innlogging').not.toHaveURL(/\/auth\/login/);
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });
  // Kartet skal ha faktiske tiler (ikke blankt lerret).
  await expect(page.locator('img.leaflet-tile').first()).toBeAttached({ timeout: 20_000 });
}

async function clickFindMe(page: Page) {
  const button = page.getByRole('button', { name: 'Finn min posisjon' });
  await expect(button).toBeVisible();
  await button.click();
}

async function expectDecodedTiles(page: Page, urlFragment: string) {
  await expect
    .poll(
      () =>
        page.locator(`img.leaflet-tile[src*="${urlFragment}"]`).evaluateAll((tiles) =>
          tiles.some((tile) => {
            const image = tile as HTMLImageElement;
            return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
          })
        ),
      {
        message: `forventet ferdig dekodede kartfliser fra ${urlFragment}`,
        timeout: 25_000
      }
    )
    .toBe(true);
}

test.describe('Norsk posisjon (Oslo)', () => {
  test.use({ geolocation: OSLO, permissions: ['geolocation'] });

  test('kart laster, «Finn meg» recentrer, Kartverket-tiler vises', async ({ page }) => {
    await openMap(page);
    await clickFindMe(page);
    // I Norge skal Kartverket «Terreng» være aktivt.
    await expectDecodedTiles(page, 'kartverket');
  });
});

test.describe('Svensk posisjon (Göteborg)', () => {
  test.use({ geolocation: GOTHENBURG, permissions: ['geolocation'] });

  test('«Finn meg» til Sverige → auto-bytte til OSM (ikke blankt)', async ({ page }) => {
    await openMap(page);
    await clickFindMe(page);
    // Kartverket har ingen tiler i Sverige → kartet MÅ bytte til OSM, ellers blankt.
    // Krev et faktisk dekodet bilde. En ødelagt <img>-tagg er fortsatt "attached"
    // og gjorde at den gamle regresjonstesten var grønn mens WebKit viste grått.
    await expectDecodedTiles(page, 'openstreetmap.org');
  });
});
