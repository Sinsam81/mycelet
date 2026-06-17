/**
 * Fit a simple monotone calibration table from spot_feedback.
 *
 * This is the bridge from "we measured calibration" to "we can safely adjust
 * displayed prediction scores". It does not change production code; it outputs
 * a candidate table that should be reviewed before wiring.
 *
 * Run:
 *   node --env-file=.env.local scripts/fit-score-calibration.mjs
 *   node --env-file=.env.local scripts/fit-score-calibration.mjs --json
 *
 * Useful filters:
 *   SINCE=2026-08-01 UNTIL=2026-11-01 REGION=NO node --env-file=.env.local scripts/fit-score-calibration.mjs
 */

const HELP = new Set(['-h', '--help']);
const args = new Set(process.argv.slice(2));

if ([...args].some((a) => HELP.has(a))) {
  console.log(`Usage: node --env-file=.env.local scripts/fit-score-calibration.mjs [--json]

Environment:
  NEXT_PUBLIC_SUPABASE_URL       Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY      Service role key, required because RLS is on
  SINCE                          Optional created_at lower bound
  UNTIL                          Optional created_at upper bound
  REGION                         Optional NO, SE, other, or unknown
  SPECIES_ID                     Optional single-species filter
  BIN_SIZE                       Score-bin width, default 10
  MIN_ROWS                       Warn below this n, default 300
  PRIOR_STRENGTH                 Global-rate smoothing strength per bin, default 20
`);
  process.exit(0);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const PAGE = clampInt(Number(process.env.PAGE || 1000), 1, 5000);
const SINCE = process.env.SINCE || null;
const UNTIL = process.env.UNTIL || null;
const REGION = process.env.REGION || null;
const SPECIES_ID_RAW = process.env.SPECIES_ID ? Number(process.env.SPECIES_ID) : null;
const SPECIES_ID = Number.isFinite(SPECIES_ID_RAW) ? SPECIES_ID_RAW : null;
const BIN_SIZE = clampInt(Number(process.env.BIN_SIZE || 10), 1, 50);
const MIN_ROWS = clampInt(Number(process.env.MIN_ROWS || 300), 1, Number.MAX_SAFE_INTEGER);
const PRIOR_STRENGTH = Math.max(0, Number(process.env.PRIOR_STRENGTH || 20));
const JSON_OUTPUT = args.has('--json') || process.env.JSON === '1';

const NORWAY = { minLat: 57.7, maxLat: 71.5, minLon: 4.0, maxLon: 31.5 };
const SWEDEN = { minLat: 55.2, maxLat: 69.1, minLon: 10.9, maxLon: 24.2 };

function clampInt(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function fixed(value, digits = 4) {
  return value == null || !Number.isFinite(value) ? 'n/a' : value.toFixed(digits);
}

function pct(value) {
  return value == null || !Number.isFinite(value) ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function inBox(lat, lon, box) {
  return lat >= box.minLat && lat <= box.maxLat && lon >= box.minLon && lon <= box.maxLon;
}

function noSeBorderLon(lat) {
  if (lat <= 59) return 11.4;
  if (lat <= 61) return 11.4 + (lat - 59) * 0.6;
  if (lat <= 65) return 12.6 + (lat - 61) * 0.475;
  if (lat <= 69) return 14.5 + (lat - 65) * 1.5;
  return 20.5;
}

function getRegion(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'unknown';
  const isNorway = inBox(lat, lon, NORWAY);
  const isSweden = inBox(lat, lon, SWEDEN);
  if (isNorway && !isSweden) return 'NO';
  if (isSweden && !isNorway) return 'SE';
  if (isNorway && isSweden) return lon < noSeBorderLon(lat) ? 'NO' : 'SE';
  return 'other';
}

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`
    }
  });
  if (!res.ok) throw new Error(`REST ${res.status}: ${await res.text()}`);
  return res.json();
}

function feedbackPath(offset) {
  const params = new URLSearchParams({
    select: 'id,created_at,found,score_shown,species_id,latitude,longitude',
    score_shown: 'not.is.null',
    order: 'created_at.asc',
    offset: String(offset),
    limit: String(PAGE)
  });
  if (SINCE) params.set('created_at', `gte.${SINCE}`);
  if (UNTIL) params.append('created_at', `lt.${UNTIL}`);
  if (SPECIES_ID != null) params.set('species_id', `eq.${SPECIES_ID}`);
  return `spot_feedback?${params.toString()}`;
}

async function fetchFeedbackRows() {
  const rows = [];
  for (let from = 0; ; ) {
    const page = await rest(feedbackPath(from));
    rows.push(...page);
    from += page.length;
    if (page.length < PAGE) break;
  }
  return rows
    .map((r) => ({
      found: Boolean(r.found),
      score: Number(r.score_shown),
      speciesId: r.species_id == null ? null : Number(r.species_id),
      region: getRegion(Number(r.latitude), Number(r.longitude))
    }))
    .filter((r) => Number.isFinite(r.score) && r.score >= 0 && r.score <= 100)
    .filter((r) => !REGION || r.region === REGION);
}

function summarize(rows) {
  const n = rows.length;
  const positives = rows.filter((r) => r.found).length;
  const foundRate = n ? positives / n : null;
  const meanScore = n ? rows.reduce((sum, r) => sum + r.score, 0) / n : null;
  const brier = n ? rows.reduce((sum, r) => sum + (r.score / 100 - (r.found ? 1 : 0)) ** 2, 0) / n : null;
  const baselineBrier = foundRate == null ? null : foundRate * (1 - foundRate);
  const brierSkill = baselineBrier && brier != null ? 1 - brier / baselineBrier : null;
  return { n, positives, foundRate, meanScore, brier, baselineBrier, brierSkill };
}

function makeBins(rows, globalRate) {
  const bins = new Map();
  for (const r of rows) {
    const low = Math.floor(Math.min(99.999999, r.score) / BIN_SIZE) * BIN_SIZE;
    const high = Math.min(100, low + BIN_SIZE);
    const key = `${low}-${high}`;
    const bin = bins.get(key) ?? { minScore: low, maxScore: high, n: 0, positives: 0, scoreSum: 0 };
    bin.n++;
    bin.positives += r.found ? 1 : 0;
    bin.scoreSum += r.score;
    bins.set(key, bin);
  }
  return [...bins.values()]
    .sort((a, b) => a.minScore - b.minScore)
    .map((b) => ({
      ...b,
      meanScore: b.scoreSum / b.n,
      rawRate: b.positives / b.n,
      smoothedRate: (b.positives + globalRate * PRIOR_STRENGTH) / (b.n + PRIOR_STRENGTH)
    }));
}

function isotonicIncreasing(bins) {
  const blocks = bins.map((b) => ({
    minScore: b.minScore,
    maxScore: b.maxScore,
    n: b.n,
    positives: b.positives,
    scoreSum: b.scoreSum,
    weight: b.n + PRIOR_STRENGTH,
    value: b.smoothedRate,
    bins: [b]
  }));

  for (let i = 0; i < blocks.length - 1; ) {
    if (blocks[i].value <= blocks[i + 1].value) {
      i++;
      continue;
    }
    const merged = {
      minScore: blocks[i].minScore,
      maxScore: blocks[i + 1].maxScore,
      n: blocks[i].n + blocks[i + 1].n,
      positives: blocks[i].positives + blocks[i + 1].positives,
      scoreSum: blocks[i].scoreSum + blocks[i + 1].scoreSum,
      weight: blocks[i].weight + blocks[i + 1].weight,
      value:
        (blocks[i].value * blocks[i].weight + blocks[i + 1].value * blocks[i + 1].weight) /
        (blocks[i].weight + blocks[i + 1].weight),
      bins: [...blocks[i].bins, ...blocks[i + 1].bins]
    };
    blocks.splice(i, 2, merged);
    if (i > 0) i--;
  }

  return blocks.flatMap((block) =>
    block.bins.map((b) => ({
      minScore: b.minScore,
      maxScore: b.maxScore,
      n: b.n,
      positives: b.positives,
      meanScore: round(b.meanScore, 3),
      rawFoundRate: round(b.rawRate, 5),
      smoothedFoundRate: round(b.smoothedRate, 5),
      calibratedProbability: round(block.value, 5)
    }))
  );
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function printText(report) {
  const s = report.summary;
  console.log('\n=== Score calibration fit ===');
  console.log(`Rows: ${s.n}  | found: ${s.positives}/${s.n} (${pct(s.foundRate)})  | mean score: ${fixed(s.meanScore, 1)}/100`);
  console.log(`Brier: ${fixed(s.brier)}  | baseline Brier: ${fixed(s.baselineBrier)}  | Brier skill: ${pct(s.brierSkill)}`);
  console.log(`Filters: ${JSON.stringify(report.filters)}\n`);
  if (s.n < MIN_ROWS) {
    console.log(`Warning: n=${s.n} is below MIN_ROWS=${MIN_ROWS}. Do not wire this calibration yet.\n`);
  }

  console.log('Candidate monotone calibration table:');
  for (const row of report.table) {
    console.log(
      `  ${String(row.minScore).padStart(3)}-${String(row.maxScore).padEnd(3)}  n=${String(row.n).padStart(4)}  raw=${pct(row.rawFoundRate).padStart(6)}  smooth=${pct(row.smoothedFoundRate).padStart(6)}  calibrated=${pct(row.calibratedProbability).padStart(6)}`
    );
  }

  console.log('\nInterpretation: calibratedProbability is monotone by score and smoothed toward the global found rate.');
}

async function main() {
  const rows = await fetchFeedbackRows();
  const summary = summarize(rows);
  const globalRate = summary.foundRate ?? 0;
  const bins = summary.n ? makeBins(rows, globalRate) : [];
  const report = {
    filters: {
      since: SINCE,
      until: UNTIL,
      region: REGION,
      speciesId: SPECIES_ID,
      binSize: BIN_SIZE,
      priorStrength: PRIOR_STRENGTH,
      minRows: MIN_ROWS
    },
    summary,
    table: isotonicIncreasing(bins)
  };

  if (JSON_OUTPUT) console.log(JSON.stringify(report, null, 2));
  else printText(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
