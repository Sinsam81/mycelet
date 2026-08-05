// App Store-skjermbilder for iPhone 6,9" — mot PROD (ekte kart- og værdata).
//
// README-en i docs/app-store-screenshots/ lovet at bildene kunne «tas på nytt
// med samme skript». Det skriptet fantes ikke — bildene fra 2026-07-28 var tatt
// for hånd og kunne ikke reproduseres. Dette er skriptet.
//
// Hvorfor det betyr noe: kartbildet fra juli viste «10/100 Svake forhold» mens
// forsiden i samme sett viste «72/100 Perfekt soppdag». Det spriket kan bare
// fikses ved å ta bildene på nytt i sesong — altså må det gå an.
//
//   node scripts/capture-app-store-screenshots.mjs
//
// Krever QA_TEST_EMAIL / QA_TEST_PASSWORD i .env.local (npm run qa:setup).
// 440×956 @3x = 1320×2868 px, som er nøyaktig Apples krav for 6,9"-skjermen.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

const BASE = 'https://www.mycelet.com';
const OUT = 'docs/app-store-screenshots';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);

if (!env.QA_TEST_EMAIL || !env.QA_TEST_PASSWORD) {
  console.error('Mangler QA_TEST_EMAIL/QA_TEST_PASSWORD i .env.local — kjør `npm run qa:setup`.');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3, // → 1320×2868, Apples 6,9"-krav
  locale: 'nb-NO',
  geolocation: { latitude: 59.9639, longitude: 10.6716 }, // Nordmarka, Oslo
  permissions: ['geolocation']
});
await context.addCookies([{ name: 'MYCELET_LOCALE', value: 'nb', url: BASE }]);

const page = await context.newPage();

/** Cookie-banner, onboarding og kart-intro rekker å dukke opp med forsinkelse. */
async function dismissChrome() {
  // «Avvis analyse» først: det er samtykkebanneret som ellers dekker nederste
  // tredjedel av forsiden, og å avslå er både det personvernvennlige valget og
  // det som gir renest bilde.
  const knapper = ['Avvis analyse', 'Forstått', 'Hopp over', 'Skjønner', 'Lukk', 'Kom i gang'];
  for (let runde = 0; runde < 6; runde++) {
    let gjorde = false;
    for (const navn of knapper) {
      const b = page.getByRole('button', { name: navn });
      if (await b.count()) {
        await b.first().click({ timeout: 2000 }).catch(() => {});
        gjorde = true;
      }
    }
    if (!gjorde) break;
    await page.waitForTimeout(400);
  }
  // Rester av faste overlegg fjernes deterministisk.
  await page.evaluate(() => {
    document.querySelectorAll('body *').forEach((el) => {
      const st = getComputedStyle(el);
      if (
        st.position === 'fixed' &&
        /nødvendige informasjonskapsler|Hopp over|lovende stedene nær deg/i.test(el.textContent || '')
      ) {
        el.remove();
      }
    });
  });
}

async function skudd(fil, sti, { vent = 3500, forSkudd } = {}) {
  await page.goto(BASE + sti, { waitUntil: 'networkidle' });
  await dismissChrome();
  await page.waitForTimeout(vent); // kartfliser og prediksjon trenger tid
  if (forSkudd) await forSkudd();
  await page.screenshot({ path: `${OUT}/${fil}` });
  const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  console.log(`  ✓ ${fil}  (${w * 3}×${h * 3})`);
}

console.log('Logger inn som QA-brukeren…');
await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
await dismissChrome();
await page.getByLabel(/e-post/i).fill(env.QA_TEST_EMAIL);
await page.getByLabel(/passord/i).fill(env.QA_TEST_PASSWORD);
await page.getByRole('button', { name: /logg inn/i }).click();
await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20000 });
console.log('  ✓ innlogget\n');

console.log('Tar skjermbilder…');
await skudd('1-soppkart.png', '/map', { vent: 6000 });
await skudd('2-soppforhold.png', '/');
await skudd('3-ai-identifikasjon.png', '/identify');
// «Lovende områder» er en knapp, ikke en URL-parameter. Første forsøk brukte
// ?layer=spots og ga et bilde identisk med 1-soppkart.png.
await skudd('4-lovende-steder.png', '/map', {
  vent: 6000,
  forSkudd: async () => {
    const knapp = page.getByRole('button', { name: /lovende områder/i });
    if (!(await knapp.count())) throw new Error('fant ikke «Lovende områder»-knappen');
    await knapp.first().click();
    await page.waitForTimeout(6000); // prediksjonen regnes serverside
  }
});
await skudd('5-kalender.png', '/calendar');
await skudd('6-artsbibliotek.png', '/species');

await browser.close();
console.log(`\nFerdig. Bildene ligger i ${OUT}/`);
console.log('Kontroller at kartet og forsiden viser SAMME sesongbilde før opplasting.');
