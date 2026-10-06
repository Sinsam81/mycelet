import { test, expect } from './_setup/fixtures';
import { hasQaCreds } from './_setup/auth';

/**
 * «Følg området ditt» — stripa inne i forsidekortet.
 *
 * ⚠️ INGEN EKTE TRYKK PÅ FØLG-KNAPPEN. Det finnes én database, og et trykk i en
 * innlogget økt ville laget et ekte varselabonnement i produksjon. Derfor er
 * /api/me/soppvarsel avskåret i nettleseren her: GET besvares lokalt, og PUT
 * blokkeres. Selve trykkveien er dekket av enhetstestene
 * (src/components/home/__tests__/FolgOmrade.test.tsx).
 *
 * Det denne testen faktisk svarer på: rendres stripa inne i kortet, og skyver
 * den prognosen ut av første skjermbilde på en 390×844-telefon?
 */

const REGIONER = [
  { navn: 'Oslo', land: 'NO' },
  { navn: 'Bergen', land: 'NO' },
  { navn: 'Göteborg', land: 'SE' }
];

test.beforeEach(async ({ page }) => {
  test.skip(!hasQaCreds(), 'QA-testbruker ikke satt opp — kjør `npm run qa:setup`.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/me/soppvarsel', async (route) => {
    if (route.request().method() !== 'GET') return route.abort();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ abonnement: null, regioner: REGIONER })
    });
  });
});

test('stripa ligger inne i forsidekortet, og prognosen står fortsatt i første skjermbilde', async ({
  page,
  context
}) => {
  // Egen posisjon kjent → stripa navngir området i stedet for å spørre.
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 59.91, longitude: 10.75 });

  await page.goto('/');

  const kort = page.locator('article').filter({ has: page.locator('svg[role="img"]') }).first();
  await expect(kort).toBeVisible();

  const stripe = kort.getByRole('button', { name: /^(Følg|Följ) / });
  await expect(stripe).toBeVisible();
  // Løftet står FØR knappen: hyppighet og vei ut.
  await expect(kort.getByText(/Aldri mer enn én i uka|Aldrig mer än ett mejl i veckan/)).toBeVisible();
  await expect(kort.getByRole('button', { name: /Ikke nå|Inte nu/ })).toBeVisible();

  // Prognosen — ringen med tallet og dommen — skal fortsatt være over bretten.
  const ring = kort.locator('svg[role="img"]').first();
  const boks = await ring.boundingBox();
  expect(boks, 'fant ikke prognoseringen').not.toBeNull();
  expect(boks!.y + boks!.height).toBeLessThanOrEqual(844);
  // Ingenting har rullet siden for å få det til.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  if (process.env.QA_SKJERMBILDE) await page.screenshot({ path: process.env.QA_SKJERMBILDE });
});

test('uten posisjon navngir stripa ingenting — den spør', async ({ page }) => {
  await page.goto('/');
  const kort = page.locator('article').filter({ has: page.locator('svg[role="img"]') }).first();
  await expect(kort.getByText(/Hvor plukker du\?|Var plockar du\?/)).toBeVisible();
  // Ingen ferdig knapp for standardområdet: Oslo og Stockholm er fallback for
  // prognosen, ikke en påstand om hvor noen plukker.
  await expect(kort.getByRole('button', { name: /^(Følg|Följ) / })).toHaveCount(0);
  await expect(kort.getByRole('combobox')).toBeVisible();

  if (process.env.QA_SKJERMBILDE_SPOR) await page.screenshot({ path: process.env.QA_SKJERMBILDE_SPOR });
});
