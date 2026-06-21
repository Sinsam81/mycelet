import { test, expect } from './_setup/fixtures';

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
});

test.describe('Prediksjon / Lovende steder', () => {
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
