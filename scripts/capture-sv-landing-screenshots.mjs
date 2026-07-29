// Capture Swedish app screenshots for the Swedish landing page — against PROD
// (real map data + live AI page). The weather card's API texts are Norwegian
// (known i18n gap) and today's score is what it is, so the card is staged to
// mirror the Norwegian original marketing shot (72/100 good day) in Swedish.
// Run from the worktree root: node .claude/capture-sv-screenshots.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const BASE = 'https://www.mycelet.com';
const OUT = 'public/landing';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 662, height: 1440 },
  deviceScaleFactor: 1,
  locale: 'sv-SE',
  geolocation: { latitude: 59.334, longitude: 18.063 }, // Stockholm
  permissions: ['geolocation']
});

await context.addCookies([{ name: 'MYCELET_LOCALE', value: 'sv', url: BASE }]);

const page = await context.newPage();

async function killBanners() {
  // Deterministic: remove fixed overlays (cookie notice etc.) from the DOM.
  await page.evaluate(() => {
    document.querySelectorAll('body *').forEach((el) => {
      const st = getComputedStyle(el);
      if (st.position === 'fixed' && /nödvändiga kakor|Hoppa över|lovande platserna nära dig/.test(el.textContent || '')) {
        el.remove();
      }
    });
  });
}

async function dismissChrome() {
  // Cookie notice + onboarding can render with a delay — retry a few rounds.
  for (let i = 0; i < 6; i++) {
    let acted = false;
    const ok = page.getByRole('button', { name: 'Förstått' });
    if (await ok.count()) {
      await ok.first().click().catch(() => {});
      acted = true;
    }
    const skip = page.getByText('Hoppa över');
    if (await skip.count()) {
      await skip.first().click().catch(() => {});
      acted = true;
    }
    await page.waitForTimeout(800);
    if (!acted && i > 1) break;
  }
}

// Log in as the QA user (same flow as e2e/auth.setup.ts)
await page.goto(`${BASE}/auth/login`);
await page.locator('input[type="email"]').fill(env.QA_TEST_EMAIL);
await page.locator('input[type="password"]').fill(env.QA_TEST_PASSWORD);
await page.getByRole('button', { name: /Logg inn|Logga in/ }).click();
await page.waitForURL((url) => !url.pathname.startsWith('/auth/login'), { timeout: 25_000 });
console.log('logged in');

// 1) App home (svampläget) — staged Swedish good-day card
await page.goto(`${BASE}/`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3500);
await dismissChrome();
await page.evaluate(() => {
  const replace = (from, to) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.includes(from)) {
        node.nodeValue = node.nodeValue.replace(from, to);
      }
    }
  };
  // Norwegian API strings → Swedish, staged as a good day (mirrors the NO shot)
  replace('Soppforhold i dag', '🍄 Perfekt svampdag i dag!');
  replace('Forholdene er ikke helt optimale akkurat nå. Sjekk kartet for ditt nærområde.',
          'Förhållandena är fina för att hitta svamp i dag — ge dig ut!');
  replace('Tørt — soppen venter på regn', 'Svampen är på väg');
  replace('Lite fukt og ingen regn i sikte. Sjansene er små inntil det kommer nedbør.',
          'Det regnade nyligen — ge det några dagar, så är förhållandena goda.');
  // Norwegian weekday labels (nb date formatting gap) → Swedish
  replace('lør', 'lör');
  replace('søn', 'sön');
  replace('tir', 'tis');
  replace('ons', 'ons');
  // Norwegian species names where the DB lacks Swedish ones
  replace('Bleklodden steinsopp', 'Finluden stensopp');
  replace('Broket kremle', 'Brokkremla');
  replace('Giftkremle', 'Giftkremla');
  replace('Pluggskiving', 'Pluggskivling');
  replace('Potetrøyksopp', 'Gul rottryffel');
  replace('Rødnende trådsopp', 'Rodnande trådskivling');
  // Score 22 → 72 with a green ring filled to 72 %
  replace('22', '72');
  document.querySelectorAll('svg circle[stroke]').forEach((c) => {
    const s = (c.getAttribute('stroke') || '').toLowerCase();
    const isTrack = s === 'none' || s === '#e5e7eb' || s === '#e2e8f0' || s === '#eee';
    if (!s || isTrack) return;
    c.setAttribute('stroke', '#16803c');
    c.setAttribute('pathLength', '100');
    c.setAttribute('stroke-dasharray', '72 100');
    c.style.strokeDasharray = '72 100';
    c.style.strokeDashoffset = '0';
    c.removeAttribute('stroke-dashoffset');
  });
  // Score text color, if styled inline by score
  document.querySelectorAll('*').forEach((el) => {
    if (el.childElementCount === 0 && el.textContent.trim() === '72') {
      el.style.color = '#166534';
    }
  });
  // The status box: tint it like the NO original's warm "on its way" box
  document.querySelectorAll('*').forEach((el) => {
    if (el.childElementCount === 0 && el.textContent.trim() === 'Svampen är på väg') {
      let box = el;
      for (let i = 0; i < 4 && box; i++) {
        const st = getComputedStyle(box);
        if (parseFloat(st.borderRadius) > 4) break;
        box = box.parentElement;
      }
      if (box) {
        box.style.background = '#fdf6e0';
        box.style.borderColor = '#eadfb8';
      }
    }
  });
});
await killBanners();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/soppforhold.sv.jpg`, type: 'jpeg', quality: 88 });
console.log('captured soppforhold.sv.jpg');

// 2) Map (Stockholm area)
await page.goto(`${BASE}/map`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(4000);
await dismissChrome();
const gotIt = page.getByRole('button', { name: 'Jag förstår!' });
if (await gotIt.count()) {
  await gotIt.first().click();
}
await page.waitForTimeout(1500);
// Turn on the findings + promising-places layers (pills toggle them)
for (const pill of ['Fynd', 'Lovande platser']) {
  const el = page.getByText(pill, { exact: false }).first();
  if (await el.count()) await el.click().catch(() => {});
  await page.waitForTimeout(1200);
}
// Zoom out so the forest clusters around Stockholm are visible
for (let i = 0; i < 2; i++) {
  await page.locator('.leaflet-control-zoom-out').click().catch(() => {});
  await page.waitForTimeout(1500);
}
await page.waitForTimeout(6000); // tiles + clusters
await killBanners();
await page.screenshot({ path: `${OUT}/soppkart.sv.jpg`, type: 'jpeg', quality: 88 });
console.log('captured soppkart.sv.jpg');

// 3) AI identify (live on prod)
await page.goto(`${BASE}/identify`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2500);
await dismissChrome();
await killBanners();
await page.screenshot({ path: `${OUT}/ai-side.sv.jpg`, type: 'jpeg', quality: 88 });
console.log('captured ai-side.sv.jpg');

await browser.close();
console.log('done');
