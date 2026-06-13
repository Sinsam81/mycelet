/**
 * Spatial backtest — does WHERE past finds cluster (+ WHEN, via phenology)
 * predict where/when NEW finds appear?
 *
 * This validates the dominant spatial signal (occurrence density / "beste
 * steder") and the C10 distance-decayed kernel, and gives a reusable spatial
 * baseline. It deliberately scores only the OFFLINE-computable core —
 * occurrence density + empirical phenology — because the habitat/forest terms
 * need a per-point WMS call each (the deep-dive's "multi-hour hammering" path,
 * left out on purpose). So: this gates occurrence-signal + seasonality changes,
 * NOT the forest/host-gate terms (those need a separate sampled full-pipeline run).
 *
 * DESIGN — temporal holdout, NOT spatial-block CV. For a local (~1.5 km) density
 * signal, spatial-block CV buffers out exactly what the signal measures and
 * would falsely report AUC≈0.5. The operationally honest question is "do
 * mushroom patches RECUR?", so we train on finds before a cutoff date and test
 * on finds after it. A test find scoring high because older finds cluster
 * nearby IS the signal (same patch, later year), not leakage. The test find is
 * in the future, so it never sees itself.
 *
 * Background = TARGET-GROUP: random locations drawn from the pool of all
 * training-find locations (i.e. "places people actually look"), scored for the
 * same species + date as the presence they're matched against. This corrects
 * for the accessibility/sampling bias (roads, popular forests) that uniform
 * random background would ignore.
 *
 * Metrics: presence-vs-background AUC for several model variants (so we can see
 * the kernel's lift over the old hard count, and phenology's lift), plus a
 * Continuous Boyce Index for the full model.
 *
 * Run:  node --env-file=.env.local scripts/backtest-spatial.mjs
 */
import { readFileSync } from 'node:fs';
import { latBand, weekIndexFromISO, dayOfYearFromISO } from './phenology-core.mjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Mangler Supabase-miljøvariabler.');
  process.exit(1);
}

const PAGE = 1000;
const HOLDOUT_CUTOFF = process.env.CUTOFF || '2021-01-01'; // train < cutoff, test >= cutoff
const MAX_TEST = Number(process.env.MAX_TEST || 10000); // cap test presences for speed
const NEG_PER_POS = 5; // target-group background draws per presence
const KERNEL_BW_KM = 1.5;
const KERNEL_CUTOFF_KM = 5;
const HARD_RADIUS_KM = 4; // the OLD signal, for the C10 comparison
const GRID = 0.1; // spatial index cell size (deg); ~11 km, > kernel cutoff

// --- phenology curves (parsed straight out of the generated TS) ---
function loadPhenology() {
  const src = readFileSync(new URL('../src/lib/prediction/phenology-data.ts', import.meta.url), 'utf8');
  const marker = 'PHENOLOGY: Record<string, SpeciesPhenology> = ';
  const json = src.slice(src.indexOf(marker) + marker.length).replace(/;\s*$/, '').trim();
  return JSON.parse(json);
}
const PHENOLOGY = loadPhenology();
function phenologyFactor(speciesId, lat, iso) {
  const entry = PHENOLOGY[String(speciesId)];
  if (!entry) return null;
  const band = latBand(lat);
  const curve = entry[band] ?? entry.all;
  const w = weekIndexFromISO(iso);
  if (!curve || w == null) return null;
  return curve[w] ?? null;
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  if (!res.ok) throw new Error(`REST ${res.status}: ${await res.text()}`);
  return res.json();
}

// Deterministic RNG so reruns match.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const cellKey = (lat, lng) => `${Math.round(lat / GRID)},${Math.round(lng / GRID)}`;

async function main() {
  // Per-species spatial index of TRAINING points + flat list of all training
  // locations (target-group background pool). Test presences collected separately.
  const trainIndex = new Map(); // speciesId -> Map(cellKey -> [{lat,lng}])
  const bgPool = []; // all training locations (any species)
  const testPresences = []; // {sid, lat, lng, iso}
  const bbox = { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 }; // data extent for uniform background

  const rng = makeRng(987654321);

  let from = 0;
  let total = 0;
  let trainN = 0;
  for (;;) {
    const rows = await rest(
      `species_occurrences?select=species_id,latitude,longitude,observed_at&species_id=not.is.null&observed_at=not.is.null&order=id&offset=${from}&limit=${PAGE}`
    );
    if (rows.length === 0) break;
    for (const r of rows) {
      const iso = r.observed_at;
      const lat = r.latitude;
      const lng = r.longitude;
      if (lat < bbox.minLat) bbox.minLat = lat;
      if (lat > bbox.maxLat) bbox.maxLat = lat;
      if (lng < bbox.minLng) bbox.minLng = lng;
      if (lng > bbox.maxLng) bbox.maxLng = lng;
      if (iso < HOLDOUT_CUTOFF) {
        // training
        let byCell = trainIndex.get(r.species_id);
        if (!byCell) {
          byCell = new Map();
          trainIndex.set(r.species_id, byCell);
        }
        const k = cellKey(lat, lng);
        const arr = byCell.get(k);
        if (arr) arr.push({ lat, lng });
        else byCell.set(k, [{ lat, lng }]);
        bgPool.push({ lat, lng });
        trainN++;
      } else {
        // candidate test presence — reservoir-ish cap via deterministic sampling
        testPresences.push({ sid: r.species_id, lat, lng, iso });
      }
      total++;
    }
    from += rows.length;
    if (rows.length < PAGE) break;
    if (from % 50000 === 0) process.stdout.write(`  …${from} rader\r`);
  }

  // Subsample test presences if over the cap (deterministic shuffle).
  let tests = testPresences;
  if (tests.length > MAX_TEST) {
    tests = [...testPresences].sort((a, b) => rng() - 0.5).slice(0, MAX_TEST);
  }

  // Neighbour-cell scan helpers over the training index.
  function neighbourPoints(sid, lat, lng) {
    const byCell = trainIndex.get(sid);
    if (!byCell) return [];
    const ci = Math.round(lat / GRID);
    const cj = Math.round(lng / GRID);
    const out = [];
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        const arr = byCell.get(`${ci + di},${cj + dj}`);
        if (arr) out.push(...arr);
      }
    return out;
  }
  function kernelDensity(sid, lat, lng) {
    let sum = 0;
    for (const p of neighbourPoints(sid, lat, lng)) {
      const d = haversineKm(lat, lng, p.lat, p.lng);
      if (d > KERNEL_CUTOFF_KM) continue;
      const r = d / KERNEL_BW_KM;
      sum += Math.exp(-(r * r));
    }
    return sum;
  }
  function hardCount(sid, lat, lng) {
    let n = 0;
    for (const p of neighbourPoints(sid, lat, lng)) {
      if (haversineKm(lat, lng, p.lat, p.lng) <= HARD_RADIUS_KM) n++;
    }
    return n;
  }
  // Pipeline-shaped boost so AUC reflects the real monotone combination.
  const boost = (density) => 1 + Math.min(0.6, density * 0.05);

  // Score variants for one (species, lat, lng, iso).
  function scores(sid, lat, lng, iso) {
    const dens = kernelDensity(sid, lat, lng);
    const hard = hardCount(sid, lat, lng);
    const phen = phenologyFactor(sid, lat, iso);
    const phenW = phen == null ? 0.5 : phen; // neutral when no curve
    return {
      full: boost(dens) * phenW, // kernel density × phenology (the offline pipeline core)
      kernelOnly: boost(dens),
      hardOnly: boost(hard), // OLD signal — C10 comparison
      phenOnly: phenW
    };
  }

  // AUC via paired presence-vs-background wins, per variant, for BOTH a
  // target-group background (bias-corrected, hard) and a uniform-random
  // background (easy — the contrast reveals how much of the signal is just
  // accessibility/sampling bias). Also collect full-model arrays for Boyce.
  const variants = ['full', 'kernelOnly', 'hardOnly', 'phenOnly'];
  const mkWins = () => Object.fromEntries(variants.map((v) => [v, 0]));
  const winsTG = mkWins();
  const winsUni = mkWins();
  let comparisons = 0;
  const presFull = [];
  const bgFullTG = [];

  const uniformPoint = () => ({
    lat: bbox.minLat + rng() * (bbox.maxLat - bbox.minLat),
    lng: bbox.minLng + rng() * (bbox.maxLng - bbox.minLng)
  });

  for (const t of tests) {
    const ps = scores(t.sid, t.lat, t.lng, t.iso);
    presFull.push(ps.full);
    for (let k = 0; k < NEG_PER_POS; k++) {
      // target-group background: a real place-people-look
      const tg = bgPool[Math.floor(rng() * bgPool.length)];
      const tgs = scores(t.sid, tg.lat, tg.lng, t.iso);
      bgFullTG.push(tgs.full);
      // uniform-random background: anywhere in the data bbox
      const uni = uniformPoint();
      const unis = scores(t.sid, uni.lat, uni.lng, t.iso);
      comparisons++;
      for (const v of variants) {
        if (ps[v] > tgs[v]) winsTG[v] += 1;
        else if (ps[v] === tgs[v]) winsTG[v] += 0.5;
        if (ps[v] > unis[v]) winsUni[v] += 1;
        else if (ps[v] === unis[v]) winsUni[v] += 0.5;
      }
    }
  }

  const aucTG = Object.fromEntries(variants.map((v) => [v, winsTG[v] / comparisons]));
  const aucUni = Object.fromEntries(variants.map((v) => [v, winsUni[v] / comparisons]));
  const auc = aucTG; // headline = the honest one
  const bgFull = bgFullTG;

  // Continuous Boyce Index on the full model (presence vs background), windowed.
  function continuousBoyce(pres, bg, bins = 20) {
    const all = [...pres, ...bg];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    if (hi <= lo) return null;
    const mids = [];
    const pe = [];
    const width = (hi - lo) / bins;
    for (let b = 0; b < bins; b++) {
      const a = lo + b * width;
      const z = a + width;
      const mid = a + width / 2;
      const pIn = pres.filter((x) => x >= a && x < (b === bins - 1 ? z + 1e-9 : z)).length / pres.length;
      const eIn = bg.filter((x) => x >= a && x < (b === bins - 1 ? z + 1e-9 : z)).length / bg.length;
      if (eIn > 0) {
        mids.push(mid);
        pe.push(pIn / eIn);
      }
    }
    return spearman(mids, pe);
  }
  function spearman(x, y) {
    const rank = (arr) => {
      const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
      const r = new Array(arr.length);
      idx.forEach(([, i], pos) => (r[i] = pos + 1));
      return r;
    };
    const rx = rank(x);
    const ry = rank(y);
    const n = x.length;
    if (n < 3) return null;
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const mx = mean(rx);
    const my = mean(ry);
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < n; i++) {
      num += (rx[i] - mx) * (ry[i] - my);
      dx += (rx[i] - mx) ** 2;
      dy += (ry[i] - my) ** 2;
    }
    return num / Math.sqrt(dx * dy);
  }
  const cbi = continuousBoyce(presFull, bgFull);

  console.log(`\n=== Romlig backtest — funn-gjentakelse + fenologi (tidsmessig holdout) ===`);
  console.log(`Holdout: tren observed_at < ${HOLDOUT_CUTOFF}, test >= ${HOLDOUT_CUTOFF}`);
  console.log(`Treningsfunn: ${trainN}  |  testfunn (presence): ${tests.length}${
    testPresences.length > tests.length ? ` (utvalg av ${testPresences.length})` : ''
  }  |  bakgrunn: target-group ×${NEG_PER_POS}\n`);
  const row = (label, v) => `  ${label.padEnd(34)} target-group ${aucTG[v].toFixed(4)}   |   uniform ${aucUni[v].toFixed(4)}`;
  console.log('                                          [HONEST bg]        [EASY bg]');
  console.log(row('full (kjerne-tetthet × fenologi):', 'full'));
  console.log(row('kun kjerne-tetthet (C10):', 'kernelOnly'));
  console.log(row('kun gammel hard 4km-telling:', 'hardOnly'));
  console.log(`     → C10 vs hard (target-group): ${(aucTG.kernelOnly - aucTG.hardOnly >= 0 ? '+' : '')}${(aucTG.kernelOnly - aucTG.hardOnly).toFixed(4)}`);
  console.log(row('kun fenologi (tid):', 'phenOnly'));
  console.log(`  Continuous Boyce Index (full, target-group):  ${cbi == null ? 'n/a' : cbi.toFixed(3)}\n`);
  console.log('TO bakgrunner: target-group = ekte let-steder (bias-korrigert, ÆRLIG test);');
  console.log('uniform = tilfeldige kartpunkter (LETT test — skiller bare skog-folk-går-i fra hav/fjell).');
  console.log('Sprik mellom dem = hvor mye av «signalet» som egentlig er let-skjevhet, ikke egnethet.');
  console.log('Fenologi vasker ut her (presence + bakgrunn har SAMME dato) — dens verdi er TID,');
  console.log('målt av scripts/backtest-phenology.mjs (0.89), ikke av denne romlige testen.');
  console.log('DEKKER IKKE: skog/habitat/vertstre/vær (krever per-punkt WMS — egen utvalgs-kjøring senere).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
