/**
 * Backtest: does the empirical phenology curve predict WHEN a species is found
 * better than the hand-coded season months?
 *
 * Method (isolates the timing dimension, which is all phenology changes):
 *   - Default: temporal split (train before CUTOFF, test on/after CUTOFF).
 *     SPLIT_MODE=hash keeps the older deterministic 80/20 row holdout.
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

const HELP = new Set(['-h', '--help']);
const args = new Set(process.argv.slice(2));

if ([...args].some((a) => HELP.has(a))) {
  console.log(`Usage: node --env-file=.env.local scripts/backtest-phenology.mjs [--json]

Environment:
  NEXT_PUBLIC_SUPABASE_URL       Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY      Service role key
  SPLIT_MODE                     year (default) or hash
  CUTOFF                         Temporal split for SPLIT_MODE=year, default 2021-01-01
  TEST_FRACTION                  Hash holdout fraction, default 0.2
  NEG_PER_POS                    Random negative weeks per test occurrence, default 4
  --json                         Print machine-readable JSON
`);
  process.exit(0);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Mangler Supabase-miljøvariabler.');
  process.exit(1);
}
const PAGE = clampInt(Number(process.env.PAGE || 1000), 1, 5000);
const NEG_PER_POS = clampInt(Number(process.env.NEG_PER_POS || 4), 1, 50);
const TEST_FRACTION = clampNumber(Number(process.env.TEST_FRACTION || 0.2), 0.01, 0.9);
const SPLIT_MODE = process.env.SPLIT_MODE === 'hash' ? 'hash' : 'year';
const CUTOFF = process.env.CUTOFF || '2021-01-01';
const JSON_OUTPUT = args.has('--json') || process.env.JSON === '1';

function clampInt(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function fixed(value, digits = 4) {
  return value == null || !Number.isFinite(value) ? 'n/a' : value.toFixed(digits);
}

// Deterministic split + RNG so reruns match (no Math.random reliance for the split).
function hash32(n) {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function isTestRow(row) {
  if (SPLIT_MODE === 'year') return row.observed_at >= CUTOFF;
  return hash32(row.id) % 100 < TEST_FRACTION * 100;
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
      const isTest = isTestRow(r);
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
    if (from % 50000 === 0) process.stderr.write(`  …${from} rader\r`);
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

  const aucOld = oldComparisons > 0 ? oldWins / oldComparisons : null;
  const aucNew = newComparisons > 0 ? newWins / newComparisons : null;
  const lift =
    aucOld != null && aucNew != null && aucOld !== 0.5 ? ((aucNew - aucOld) / (aucOld - 0.5)) * 100 : null;
  const delta = aucOld != null && aucNew != null ? aucNew - aucOld : null;
  const report = {
    method: {
      splitMode: SPLIT_MODE,
      cutoff: SPLIT_MODE === 'year' ? CUTOFF : null,
      testFraction: SPLIT_MODE === 'hash' ? TEST_FRACTION : null,
      negativeWeeksPerPositive: NEG_PER_POS,
      totalDatedFruitingRows: total,
      trainRows: total - test.length,
      testRows: test.length,
      curves: curves.size
    },
    evaluated: {
      testRowsEvaluated: evaluated,
      rowsWithoutCurve: noCurve,
      oldComparisons,
      empiricalComparisons: newComparisons
    },
    auc: {
      oldMonthModel: aucOld,
      empiricalPhenology: aucNew,
      delta,
      liftOverOldSignalPct: lift
    }
  };

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n=== Backtest: tidspunkt-prediksjon (sesong) ===`);
  console.log(
    `Split: ${
      SPLIT_MODE === 'year' ? `temporal train < ${CUTOFF}, test >= ${CUTOFF}` : `hash holdout ${Math.round(TEST_FRACTION * 100)}%`
    }`
  );
  console.log(`Treningsfunn: ${total - test.length}  |  testfunn: ${test.length}  |  arter med kurve: ${curves.size}`);
  console.log(`Testfunn evaluert: ${evaluated}  (${noCurve} uten kurve → faller til måned-modell i prod)\n`);
  console.log(`  AUC, gammel måned-modell:    ${fixed(aucOld)}`);
  console.log(`  AUC, ny empirisk fenologi:   ${fixed(aucNew)}`);
  console.log(
    `  → ${delta != null && delta > 0 ? 'FORBEDRING' : 'INGEN forbedring'}: ` +
      `${delta != null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(4)}` : 'n/a'} AUC ` +
      `(${lift != null ? `${lift > 0 ? '+' : ''}${lift.toFixed(0)}%` : 'n/a'} av signalet over tilfeldig)\n`
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
