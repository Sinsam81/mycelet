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

  test('«Legg til funn» måler posisjonen på nytt og tilbyr begge stedene (åpnes og avbrytes)', async ({ page }) => {
    // Skjemaet lagret før posisjonen fra da kartet ble åpnet, og kartsenteret
    // kunne ikke velges når GPS fantes. Ren lesing: skjemaet åpnes, valgene
    // sjekkes, og det avbrytes — ingenting sendes.
    await openMap(page);
    await page.getByRole('button', { name: 'Legg til funn' }).click();
    // Kartet står på posisjonen (ikke flyttet), så den ferske målingen velges.
    await expect(page.getByRole('radio', { name: /Der jeg står nå/ })).toBeChecked({ timeout: 15_000 });
    await expect(page.getByRole('radio', { name: /Der kartet står/ })).toBeEnabled();
    await page.getByRole('button', { name: 'Avbryt' }).click();
    await expect(page.getByRole('radio', { name: /Der jeg står nå/ })).toHaveCount(0);
  });
});

test.describe('/map?mine=1 (landingen etter lagret funn)', () => {
  test.use({ geolocation: OSLO, permissions: ['geolocation'] });

  test('åpner med «Kun mine funn» på — private funn skal synes etter lagring', async ({ page }) => {
    // Lagringsflytene navigerer hit: et privat funn er usynlig i standard-
    // laget, så uten dette leses «Funn lagret!» som at lagringen feilet.
    // Ren lesing — ingenting skrives.
    await page.goto('/map?mine=1');
    await expect(page, '/map?mine=1 redirectet til innlogging').not.toHaveURL(/\/auth\/login/);
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Filtre', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Kun mine funn' })).toBeChecked();
    // Og perioden står på «Alle»: med standarden «Denne måneden» åpnet lenken
    // fra Mine steder til et kart uten egne funn i alle andre måneder enn
    // funnets egen.
    await expect(page.getByLabel('Periode')).toHaveValue('all');
  });
});

test.describe('Filterarket på kartet', () => {
  test.use({ geolocation: OSLO, permissions: ['geolocation'] });

  test('har periode og «Kun mine funn» — art og sted velges i søkefeltet øverst', async ({ page }) => {
    // Arket hadde egne søkefelt for art og sted, og de skrev bare halve
    // tilstanden: en art uten synlig navn (og et usynlig filter ved neste
    // besøk), et sted uten værstripe. Ren lesing — ingenting skrives.
    await openMap(page);
    await page.getByRole('button', { name: 'Filtre', exact: true }).click();
    await expect(page.getByLabel('Periode')).toHaveValue('month');
    await expect(page.getByRole('checkbox', { name: 'Kun mine funn' })).not.toBeChecked();
    await expect(page.getByText('Art og sted velger du i søkefeltet øverst på kartet.')).toBeVisible();
    // De to gamle søkefeltene i arket er borte.
    await expect(page.getByPlaceholder('Nordmarka, Trondheim …')).toHaveCount(0);
    await expect(page.getByPlaceholder('Kantarell', { exact: true })).toHaveCount(0);
  });
});

test.describe('Trykkflater på kartet', () => {
  // Telefonbredde: der står kontrollene tettest, og der betjenes de med tommelen.
  test.use({ viewport: { width: 375, height: 812 }, geolocation: OSLO, permissions: ['geolocation'] });

  test('kontrollene oppå kartet tar imot et trykk 21 px fra midten, i alle fire retninger', async ({ page }) => {
    // Flere av kontrollene ser mindre ut enn 44 px med vilje (de dekker kart),
    // og får resten av flaten fra et usynlig ::after eller fra etiketten rundt
    // (se src/components/map/trykkflate.ts). Derfor måles ikke størrelsen på
    // elementet, men hva et trykk faktisk treffer. Ren lesing — ingenting
    // trykkes på.
    await openMap(page);

    const kontroller = [
      page.getByRole('button', { name: 'Filtre', exact: true }),
      page.getByRole('textbox', { name: /Søk sopp eller sted/ }),
      page.getByRole('button', { name: /Skjul funn|Vis funn/ }),
      page.getByRole('button', { name: 'Filtrer funnene' }),
      page.getByRole('button', { name: /Lovende/ }),
      page.getByRole('button', { name: 'Mer', exact: true }),
      page.getByRole('button', { name: 'Finn min posisjon' }),
      page.getByRole('button', { name: 'Legg til funn' })
    ];

    for (const kontroll of kontroller) {
      await expect(kontroll).toBeVisible();
      const resultat = await kontroll.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        // Søkefeltet er et <input> og får flaten sin fra etiketten rundt.
        const flate = el.tagName === 'INPUT' && el.parentElement?.tagName === 'LABEL' ? el.parentElement : el;
        const treffer = (x: number, y: number) => {
          const truffet = document.elementFromPoint(x, y);
          return truffet !== null && flate.contains(truffet);
        };
        return {
          navn: el.getAttribute('aria-label') ?? el.textContent ?? '',
          opp: treffer(cx, cy - 21),
          ned: treffer(cx, cy + 21),
          venstre: treffer(cx - 21, cy),
          hoyre: treffer(cx + 21, cy)
        };
      });
      expect(resultat, `treffflaten til «${resultat.navn}»`).toMatchObject({
        opp: true,
        ned: true,
        venstre: true,
        hoyre: true
      });
    }

    // Leaflets zoomknapper står kant i kant, så flatene deres vokser hver sin
    // vei: «inn» oppover, «ut» nedover. Til sidene vokser begge.
    for (const [navn, loddrett] of [
      ['Zoom inn', -21],
      ['Zoom ut', 21]
    ] as const) {
      const knapp = page.getByRole('button', { name: navn, exact: true });
      await expect(knapp).toBeVisible();
      const treff = await knapp.evaluate((el, dy) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const treffer = (x: number, y: number) => {
          const truffet = document.elementFromPoint(x, y);
          return truffet !== null && el.contains(truffet);
        };
        return { loddrett: treffer(cx, cy + dy), venstre: treffer(cx - 21, cy), hoyre: treffer(cx + 21, cy) };
      }, loddrett);
      expect(treff, `treffflaten til «${navn}»`).toEqual({ loddrett: true, venstre: true, hoyre: true });
    }
  });

  test('verktøyraden holder seg på to rader på en smal telefon', async ({ page }) => {
    // Med GPX som femte knapp ble det tre rader oppå kartet. Knappene er nå
    // fire, og kolonnen rommer to i bredden.
    await openMap(page);
    // Radene telles på knappenes MIDTLINJE, ikke på toppkanten: pillene og den
    // runde filterknappen har ulik høyde og er midtstilt i raden, så toppene
    // deres skiller seg med et par piksler selv om de står side om side.
    const midter: number[] = [];
    for (const navn of [/Skjul funn|Vis funn/, 'Filtrer funnene', /Lovende/]) {
      const boks = await page.getByRole('button', { name: navn }).boundingBox();
      expect(boks, `fant ikke knappen ${String(navn)}`).not.toBeNull();
      midter.push(boks!.y + boks!.height / 2);
    }
    const mer = await page.getByRole('button', { name: 'Mer', exact: true }).boundingBox();
    expect(mer).not.toBeNull();
    midter.push(mer!.y + mer!.height / 2);
    midter.sort((a, b) => a - b);
    // En ny rad begynner der midtlinja hopper mer enn en halv knappehøyde.
    const rader = midter.reduce((antall, midt, i) => (i > 0 && midt - midter[i - 1] > 18 ? antall + 1 : antall), 1);
    expect(rader).toBeLessThanOrEqual(2);
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
