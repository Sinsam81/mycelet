/**
 * Backtest: does the empirical phenology curve predict WHEN a species is found
 * better than the hand-coded season months?
 *
 * Method (isolates the timing dimension, which is all phenology changes):
 *   - Split the dated finds per species into 80% train / 20% test.
 *   - Build phenology curves on TRAIN only (so we measure generalization, not
 *     memorization).
 *   - For each TEST find (species, lat, true week), draw N random "negative"
 *     weeks. A good timing model scores the true week above a random week.
 *   - AUC = P(score(true) > score(random)), averaged over all test finds.
 *     0.5 = coin flip, 1.0 = perfect. Report AUC for the OLD month model and
 *     the NEW empirical model side by side.
 *
 * Honest caveat printed below: GBIF dates reflect WHEN PEOPLE LOOK as well as
 * when mushrooms fruit, so this measures "findability timing" — exactly the
 * thing the season factor is supposed to capture.
 *
 * Run:  node --env-file=.env.local scripts/backtest-phenology.mjs
 */
import {
  BANDS,
  MIN_SAMPLE_ALL,
  MIN_SAMPLE_BAND,
  curveLookup,
  emptyCounts,
  finalizeCurve,
  latBand,
  oldSeasonScore,
  weekIndexFromISO
} from './phenology-core.mjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Mangler Supabase-miljøvariabler.');
  process.exit(1);
}
const PAGE = 1000;
const NEG_PER_POS = 4; // random negative weeks drawn per test occurrence
const TEST_FRACTION = 0.2;

// Deterministic split + RNG so reruns match (no Math.random reliance for the split).
function hash32(n) {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  if (!res.ok) throw new Error(`REST ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const species = await rest(
    'mushroom_species?select=id,norwegian_name,season_start,season_end,peak_season_start,peak_season_end&order=id'
  );
  // Map DB snake_case → the camelCase shape oldSeasonScore expects (this is the
  // exact field set the production scorer reads from SpeciesContext).
  const seasonById = new Map(
    species.map((s) => [
      s.id,
      {
        seasonStart: s.season_start,
        seasonEnd: s.season_end,
        peakSeasonStart: s.peak_season_start,
        peakSeasonEnd: s.peak_season_end
      }
    ])
  );

  // Per species: train counts (all + bands) and a list of test occurrences.
  const train = new Map();
  const test = []; // { sid, band, week }
  const ensure = (sid) => {
    let c = train.get(sid);
    if (!c) {
      c = { all: emptyCounts(), south: emptyCounts(), central: emptyCounts(), north: emptyCounts() };
      train.set(sid, c);
    }
    return c;
  };

  let from = 0;
  let total = 0;
  for (;;) {
    const rows = await rest(
      `species_occurrences?select=id,species_id,latitude,observed_at&species_id=not.is.null&observed_at=not.is.null&order=id&offset=${from}&limit=${PAGE}`
    );
    if (rows.length === 0) break;
    for (const r of rows) {
      const w = weekIndexFromISO(r.observed_at);
      if (w == null) continue;
      const band = latBand(r.latitude);
      // Deterministic 80/20 split on the row id.
      const isTest = hash32(r.id) % 100 < TEST_FRACTION * 100;
      if (isTest) {
        test.push({ sid: r.species_id, band, week: w });
      } else {
        const c = ensure(r.species_id);
        c.all[w]++;
        c[band][w]++;
      }
      total++;
    }
    from += rows.length;
    if (rows.length < PAGE) break;
    if (from % 50000 === 0) process.stdout.write(`  …${from} rader\r`);
  }

  // Finalize train curves.
  const curves = new Map();
  for (const [sid, c] of train.entries()) {
    const allTotal = c.all.reduce((s, v) => s + v, 0);
    if (allTotal < MIN_SAMPLE_ALL) continue;
    const entry = { all: finalizeCurve(c.all) };
    for (const band of BANDS) {
      if (c[band].reduce((s, v) => s + v, 0) >= MIN_SAMPLE_BAND) entry[band] = finalizeCurve(c[band]);
    }
    curves.set(sid, entry);
  }

  // Seeded RNG for negative-week draws (reproducible).
  let seed = 12345;
  const rng = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  let oldWins = 0;
  let newWins = 0;
  let oldComparisons = 0;
  let newComparisons = 0;
  let evaluated = 0;
  let noCurve = 0;

  for (const t of test) {
    const season = seasonById.get(t.sid);
    if (!season) continue;
    const entry = curves.get(t.sid);
    const curve = entry ? entry[t.band] ?? entry.all : null;
    if (!curve) noCurve++;
    evaluated++;

    const oldPos = oldSeasonScore(t.week, season);
    const newPos = curve ? curveLookup(curve, t.week) : null;

    for (let k = 0; k < NEG_PER_POS; k++) {
      const negWeek = Math.floor(rng() * 52);
      // OLD model comparison
      const oldNeg = oldSeasonScore(negWeek, season);
      oldComparisons++;
      if (oldPos > oldNeg) oldWins += 1;
      else if (oldPos === oldNeg) oldWins += 0.5;
      // NEW model comparison (only when we have a curve)
      if (newPos != null) {
        const newNeg = curveLookup(curve, negWeek);
        newComparisons++;
        if (newPos > newNeg) newWins += 1;
        else if (newPos === newNeg) newWins += 0.5;
      }
    }
  }

  const aucOld = oldWins / oldComparisons;
  const aucNew = newWins / newComparisons;

  console.log(`\n=== Backtest: tidspunkt-prediksjon (sesong) ===`);
  console.log(`Treningsfunn: ${total - test.length}  |  testfunn: ${test.length}  |  arter med kurve: ${curves.size}`);
  console.log(`Testfunn evaluert: ${evaluated}  (${noCurve} uten kurve → faller til måned-modell i prod)\n`);
  console.log(`  AUC, gammel måned-modell:    ${aucOld.toFixed(4)}`);
  console.log(`  AUC, ny empirisk fenologi:   ${aucNew.toFixed(4)}`);
  const lift = ((aucNew - aucOld) / (aucOld - 0.5)) * 100;
  console.log(
    `  → ${aucNew > aucOld ? 'FORBEDRING' : 'INGEN forbedring'}: +${(aucNew - aucOld).toFixed(4)} AUC ` +
      `(${lift > 0 ? '+' : ''}${lift.toFixed(0)}% av signalet over tilfeldig)\n`
  );
  console.log('AUC 0.5 = terningkast, 1.0 = perfekt rangering av ekte funn-uke over tilfeldig uke.');
  console.log(
    'Forbehold: GBIF-datoer speiler både når sopp frukter OG når folk leter — dette måler\n' +
      '«når er arten finnbar», som er nøyaktig det sesongfaktoren skal fange.'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
