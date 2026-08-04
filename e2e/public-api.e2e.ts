import { test, expect } from './_setup/fixtures';
import { PREDICTION_TILE_REGIONS } from '../src/lib/prediction/tile-regions';

// Offentlige API-er — ingen auth. Kjøres mot localhost (gjeldende kode) i `npm run qa`.

const OSLO = { lat: 59.91, lon: 10.75 }; // NO → MET Frost
const GOTHENBURG = { lat: 57.71, lon: 11.97 }; // SE → SMHI

test.describe('Helse', () => {
  test('GET /api/health svarer 200 ok (eller 503 degraded — rapporter hvilken sjekk)', async ({ request }) => {
    const res = await request.get('/api/health');
    const body = await res.json().catch(() => ({}));
    if (res.status() !== 200) {
      // Synliggjør hvilken sjekk som feilet, så loopen kan rapportere det.
      throw new Error(`/api/health status ${res.status()} — checks: ${JSON.stringify(body.checks ?? body)}`);
    }
    expect(body.status).toBe('ok');
  });

  test('GET /api/health?fast=1 svarer raskt 200', async ({ request }) => {
    const res = await request.get('/api/health?fast=1');
    expect(res.status()).toBe(200);
  });

  test('GET /api/health/predictions rapporterer flisferskhet per region', async ({ request }) => {
    const res = await request.get('/api/health/predictions');
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(body.status === 'ok' || body.status === 'degraded').toBeTruthy();
    expect(body.expectedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Ikke hardkodet antall: lista vokser når nye regioner legges til (Sverige
    // kom inn 2026-08-03 og tok den fra 5 til 13). Testen skal fange at
    // helsesjekken mangler regioner, ikke at noen la til en.
    expect(body.regions.length).toBe(PREDICTION_TILE_REGIONS.length);
    // Begge landene må rapporteres — hver kjøres av sin egen cron, og en stille
    // svikt i den ene skal ikke se ut som at alt er friskt.
    const land = new Set(
      body.regions.map((r: { region: string }) =>
        PREDICTION_TILE_REGIONS.find((x) => x.name === r.region)?.country)
    );
    expect(land.has('NO')).toBe(true);
    expect(land.has('SE')).toBe(true);
    expect(body.regions.every((region: { fresh?: unknown }) => typeof region.fresh === 'boolean')).toBe(true);
  });
});

test.describe('Prediksjon / Lovende områder', () => {
  test('NO-punkt (Oslo) svarer (Frost-ruting)', async ({ request }) => {
    const res = await request.get(`/api/prediction?lat=${OSLO.lat}&lon=${OSLO.lon}`);
    // 502 = ingen værkilde nåbar = infrastruktur, ikke kodefeil. Alt annet enn
    // 200/502 (f.eks. 400/500) er en regresjon.
    expect([200, 502], `uventet status ${res.status()}`).toContain(res.status());
    if (res.status() === 502) console.warn('⚠ /api/prediction (NO) 502 — ingen værkilde nåbar (infra).');
  });

  test('SE-punkt (Göteborg) svarer (SMHI-ruting)', async ({ request }) => {
    const res = await request.get(`/api/prediction?lat=${GOTHENBURG.lat}&lon=${GOTHENBURG.lon}`);
    expect([200, 502], `uventet status ${res.status()}`).toContain(res.status());
    if (res.status() === 502) console.warn('⚠ /api/prediction (SE) 502 — ingen værkilde nåbar (infra).');
  });

  test('ugyldige koordinater gir 400', async ({ request }) => {
    const res = await request.get('/api/prediction?lat=foo&lon=bar');
    expect(res.status()).toBe(400);
  });

  // Number(null) er 0, så en manglende parameter slapp gjennom som en gyldig
  // koordinat på 0°N 0°Ø — ruta svarte 200 med en troverdig score for et punkt i
  // Atlanterhavet, og ingenting i svaret sa at inndata var tomme.
  test('manglende koordinater gir 400, ikke en score for 0°N 0°Ø', async ({ request }) => {
    expect((await request.get('/api/prediction')).status()).toBe(400);
    expect((await request.get('/api/prediction?lat=59.91')).status()).toBe(400);
    expect((await request.get('/api/prediction?lon=10.75')).status()).toBe(400);
  });

  test('koordinater utenfor jorden gir 400', async ({ request }) => {
    expect((await request.get('/api/prediction?lat=91&lon=10.75')).status()).toBe(400);
    expect((await request.get('/api/prediction?lat=59.91&lon=200')).status()).toBe(400);
  });

  // Artsnummeret gikk rått inn i en int-parameter i RPC-en, så ruta svarte 500
  // med PostgreSQLs egen feiltekst — og avslørte kolonnetypen bak parameteren.
  test('ugyldig artsnummer gir 400 uten databasens feiltekst', async ({ request }) => {
    const res = await request.get('/api/prediction?lat=59.91&lon=10.75&speciesId=1.5');
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(String(body.error ?? '')).not.toMatch(/integer|syntax|postgres/i);
  });

  test('GET /api/mushroom-day svarer med score', async ({ request }) => {
    const res = await request.get(`/api/mushroom-day?lat=${OSLO.lat}&lon=${OSLO.lon}`);
    expect([200, 502], `uventet status ${res.status()}`).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body.score === 'number' || typeof body.title === 'string').toBeTruthy();
    } else {
      console.warn('⚠ /api/mushroom-day 502 — ingen værkilde nåbar (infra).');
    }
  });
});

test.describe('Feltfeedback', () => {
  test('funn og hotspot-feedback krever innlogging', async ({ request }) => {
    const payload = { latitude: OSLO.lat, longitude: OSLO.lon, visibility: 'private' };
    const [finding, feedback] = await Promise.all([
      request.post('/api/findings', { data: payload }),
      request.post('/api/spot-feedback', {
        data: { lat: OSLO.lat, lng: OSLO.lon, found: false }
      })
    ]);

    expect(finding.status()).toBe(401);
    expect(feedback.status()).toBe(401);
  });

  test('historisk vær-backfill krever cron-hemmelighet', async ({ request }) => {
    const response = await request.get('/api/cron/backfill-occurrence-weather?speciesId=1&limit=1');
    expect(response.status()).toBe(401);
  });
});
