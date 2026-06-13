/**
 * Does Swedish surficial-deposit drainage (SGU jordart) actually discriminate
 * real mushroom finds from background — i.e. is it a genuine per-cell
 * suitability signal, or just more accessibility bias?
 *
 * Gate for wiring src/lib/slu/jordart.ts into live scoring. Mirrors the spatial
 * backtest's two-background design:
 *   - target-group background = other SE find locations (HONEST: controls for
 *     "where people look"). AUC > 0.5 here ⇒ finds prefer better-drained ground
 *     MORE than other finds do ⇒ real suitability beyond accessibility.
 *   - uniform-random SE land (EASY): does drainage explain finds vs random land.
 *
 * Paced + cached SGU calls (government open data — be polite).
 * Run:  node --env-file=.env.local scripts/validate-sgu-drainage.mjs
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SGU_BASE = 'https://api.sgu.se/oppnadata/jordarter25k-100k/ogc/features/v1';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Mangler Supabase-miljø.'); process.exit(1); }

const N = Number(process.env.N || 200); // presences (and each background type)
// Sweden-ish bbox that excludes mainland Norway (Norway is west of ~11.5°E at
// these latitudes); SGU returns null outside Sweden anyway.
const SE_BBOX = { minLat: 55.4, maxLat: 68.5, minLng: 12.5, maxLng: 23.5 };

// Mirrors jordartToDrainage() in src/lib/slu/jordart.ts — keep in sync.
function drainageFactor(t) {
  t = (t || '').toLowerCase();
  if (!t) return null;
  if (/(torv|kärr|karr|mosse|myr)/.test(t)) return 0.7;
  if (/morän|moran/.test(t)) return 1.15;
  if (/(isälv|isalv|glacifluv|svallsediment)/.test(t) || /\b(sand|grus)\b/.test(t)) return 1.05;
  if (/(lera|silt|ler\b)/.test(t)) return 0.9;
  if (/(urberg|berg|tunt|block)/.test(t)) return 0.8;
  if (/(fyllning|fyllnad|vatten)/.test(t)) return 1.0;
  return 1.0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cache = new Map();

async function sguDrainage(lat, lng) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);
  const d = 0.0005;
  for (const coll of ['grundlager', 'ytlager']) {
    try {
      const res = await fetch(
        `${SGU_BASE}/collections/${coll}/items?bbox=${lng - d},${lat - d},${lng + d},${lat + d}&f=json&limit=10`,
        { headers: { 'User-Agent': 'Mycelet (mushroom prediction; data: SGU CC0)' } }
      );
      if (!res.ok) continue;
      const json = await res.json();
      const feats = (json.features || []).filter((f) => f.properties?.jg2_tx);
      if (feats.length) {
        const dom = feats.reduce((b, f) => ((f.properties.geom_area ?? 0) > (b.properties.geom_area ?? 0) ? f : b));
        const v = { tx: dom.properties.jg2_tx, factor: drainageFactor(dom.properties.jg2_tx) };
        cache.set(key, v);
        await sleep(70);
        return v;
      }
    } catch { /* try next collection */ }
  }
  cache.set(key, null);
  await sleep(70);
  return null;
}

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!res.ok) throw new Error(`REST ${res.status}`);
  return res.json();
}
function makeRng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

async function main() {
  const rng = makeRng(424242);
  // Swedish presence sample: occurrences inside the SE bbox.
  const occ = await rest(
    `species_occurrences?select=latitude,longitude&latitude=gte.${SE_BBOX.minLat}&latitude=lte.${SE_BBOX.maxLat}&longitude=gte.${SE_BBOX.minLng}&longitude=lte.${SE_BBOX.maxLng}&limit=4000`
  );
  if (occ.length < N) { console.error(`For få SE-funn (${occ.length}).`); process.exit(1); }
  const shuffled = [...occ].sort(() => rng() - 0.5);
  const presences = shuffled.slice(0, N);
  const tgPool = shuffled; // target-group background pool = other SE find locations

  console.log(`Henter jordart for ${N} funn + ${N} target-group + ${N} uniform (cachet, paced)…`);

  async function factorsFor(points) {
    const out = [];
    for (const p of points) {
      const r = await sguDrainage(p.latitude ?? p.lat, p.longitude ?? p.lng);
      if (r && r.factor != null) out.push(r.factor);
    }
    return out;
  }

  const presF = await factorsFor(presences);
  const tgF = await factorsFor(Array.from({ length: N }, () => tgPool[Math.floor(rng() * tgPool.length)]));
  // uniform-random SE land (resample until SGU returns a deposit, capped)
  const uni = [];
  let tries = 0;
  while (uni.length < N && tries < N * 4) {
    tries++;
    const lat = SE_BBOX.minLat + rng() * (SE_BBOX.maxLat - SE_BBOX.minLat);
    const lng = SE_BBOX.minLng + rng() * (SE_BBOX.maxLng - SE_BBOX.minLng);
    const r = await sguDrainage(lat, lng);
    if (r && r.factor != null) uni.push(r.factor);
  }

  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  // AUC presence vs a background set: P(random presence factor > random bg factor), ties 0.5.
  function auc(pos, neg) {
    let win = 0, n = 0;
    for (const a of pos) for (const b of neg) { n++; if (a > b) win++; else if (a === b) win += 0.5; }
    return win / n;
  }
  const dist = (a) => {
    const c = {};
    for (const f of a) c[f] = (c[f] || 0) + 1;
    return Object.entries(c).sort((x, y) => y[1] - x[1]).map(([f, n]) => `${f}:${(100 * n / a.length).toFixed(0)}%`).join(' ');
  };

  console.log(`\n=== SGU jordart-drenering: diskriminerer den funn? (n_presence=${presF.length}) ===`);
  console.log(`Snitt drenerings-faktor — funn: ${mean(presF).toFixed(3)} | target-group: ${mean(tgF).toFixed(3)} | uniform land: ${mean(uni).toFixed(3)}`);
  console.log(`Faktor-fordeling funn:        ${dist(presF)}`);
  console.log(`Faktor-fordeling uniform land:${dist(uni)}`);
  console.log(`\n  AUC funn vs target-group (ÆRLIG): ${auc(presF, tgF).toFixed(4)}`);
  console.log(`  AUC funn vs uniform land (LETT):  ${auc(presF, uni).toFixed(4)}`);
  console.log('\nTolkning: target-group > 0.5 ⇒ funn ligger på bedre drenert mark ENN andre let-steder');
  console.log('⇒ ekte egnethet utover let-skjevhet → verdt å koble inn. ≈0.5 ⇒ fanget av let-skjevhet.');
}
main().catch((e) => { console.error(e); process.exit(1); });
