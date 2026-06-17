/**
 * Calibration audit for the prediction engine's real user feedback.
 *
 * Reads spot_feedback rows inserted by "Var du her? Fant du sopp?" and compares
 * score_shown (0-100) with found (boolean). This measures calibration, not just
 * ranking: if the app shows 70/100, rows around 70 should be found roughly 70%
 * of the time after enough data accumulates.
 *
 * Run:
 *   node --env-file=.env.local scripts/analyze-spot-feedback.mjs
 *
 * Useful filters:
 *   SINCE=2026-08-01 UNTIL=2026-11-01 node --env-file=.env.local scripts/analyze-spot-feedback.mjs
 *   SPECIES_ID=12 MIN_SPECIES_N=10 node --env-file=.env.local scripts/analyze-spot-feedback.mjs
 *   node --env-file=.env.local scripts/analyze-spot-feedback.mjs --json
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY because spot_feedback is intentionally
 * protected by RLS; calibration jobs need aggregate access, public clients do not.
 */

const HELP = new Set(['-h', '--help']);
const args = new Set(process.argv.slice(2));

if ([...args].some((a) => HELP.has(a))) {
  console.log(`Usage: node --env-file=.env.local scripts/analyze-spot-feedback.mjs [--json]

Environment:
  NEXT_PUBLIC_SUPABASE_URL       Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY      Service role key, required because RLS is on
  SINCE                          Optional created_at lower bound, e.g. 2026-08-01
  UNTIL                          Optional created_at upper bound, e.g. 2026-11-01
  SPECIES_ID                     Optional single-species filter
  BIN_SIZE                       Score-bin width, default 10
  MIN_BIN_N                      Hide printed bins below this n, default 1
  MIN_SPECIES_N                  Hide species rows below this n, default 20
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
const SPECIES_ID_RAW = process.env.SPECIES_ID ? Number(process.env.SPECIES_ID) : null;
const SPECIES_ID = Number.isFinite(SPECIES_ID_RAW) ? SPECIES_ID_RAW : null;
const BIN_SIZE = clampInt(Number(process.env.BIN_SIZE || 10), 1, 50);
const MIN_BIN_N = clampInt(Number(process.env.MIN_BIN_N || 1), 1, Number.MAX_SAFE_INTEGER);
const MIN_SPECIES_N = clampInt(Number(process.env.MIN_SPECIES_N || 20), 1, Number.MAX_SAFE_INTEGER);
const JSON_OUTPUT = args.has('--json') || process.env.JSON === '1';

function clampInt(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function pct(value) {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  return `${(value * 100).toFixed(1)}%`;
}

function fixed(value, digits = 4) {
  return value == null || !Number.isFinite(value) ? 'n/a' : value.toFixed(digits);
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
    select: 'id,created_at,found,score_shown,species_id',
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
      id: r.id,
      createdAt: r.created_at,
      found: Boolean(r.found),
      score: Number(r.score_shown),
      speciesId: r.species_id == null ? null : Number(r.species_id)
    }))
    .filter((r) => Number.isFinite(r.score) && r.score >= 0 && r.score <= 100);
}

async function fetchSpeciesNames(ids) {
  const out = new Map();
  const unique = [...new Set(ids.filter((id) => id != null))].sort((a, b) => a - b);
  for (let i = 0; i < unique.length; i += 150) {
    const chunk = unique.slice(i, i + 150);
    const rows = await rest(
      `mushroom_species?select=id,norwegian_name,latin_name&id=in.(${chunk.join(',')})`
    );
    for (const r of rows) out.set(Number(r.id), `${r.norwegian_name} (${r.latin_name})`);
  }
  return out;
}

function summarize(rows) {
  const n = rows.length;
  if (n === 0) return emptySummary();
  const positives = rows.filter((r) => r.found).length;
  const foundRate = positives / n;
  const meanScore = mean(rows.map((r) => r.score));
  const brier = mean(rows.map((r) => (r.score / 100 - (r.found ? 1 : 0)) ** 2));
  const baselineBrier = foundRate * (1 - foundRate);
  const brierSkill = baselineBrier > 0 ? 1 - brier / baselineBrier : null;
  const logLoss = mean(
    rows.map((r) => {
      const p = Math.min(0.999999, Math.max(0.000001, r.score / 100));
      return r.found ? -Math.log(p) : -Math.log(1 - p);
    })
  );
  return {
    n,
    positives,
    negatives: n - positives,
    foundRate,
    meanScore,
    brier,
    baselineBrier,
    brierSkill,
    logLoss,
    auc: auc(rows)
  };
}

function emptySummary() {
  return {
    n: 0,
    positives: 0,
    negatives: 0,
    foundRate: null,
    meanScore: null,
    brier: null,
    baselineBrier: null,
    brierSkill: null,
    logLoss: null,
    auc: null
  };
}

function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function auc(rows) {
  const positives = rows.filter((r) => r.found).length;
  const negatives = rows.length - positives;
  if (positives === 0 || negatives === 0) return null;

  const sorted = [...rows].sort((a, b) => a.score - b.score);
  let rank = 1;
  let positiveRankSum = 0;
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].score === sorted[i].score) j++;
    const avgRank = (rank + rank + (j - i) - 1) / 2;
    for (let k = i; k < j; k++) {
      if (sorted[k].found) positiveRankSum += avgRank;
    }
    rank += j - i;
    i = j;
  }
  return (positiveRankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

function calibrationBins(rows) {
  const bins = new Map();
  for (const r of rows) {
    const low = Math.floor(Math.min(99.999999, r.score) / BIN_SIZE) * BIN_SIZE;
    const high = Math.min(100, low + BIN_SIZE);
    const key = `${low}-${high}`;
    const arr = bins.get(key);
    if (arr) arr.push(r);
    else bins.set(key, [r]);
  }
  const out = [...bins.entries()]
    .sort((a, b) => Number(a[0].split('-')[0]) - Number(b[0].split('-')[0]))
    .map(([range, rs]) => {
      const s = summarize(rs);
      const meanPred = s.meanScore / 100;
      const gap = s.foundRate - meanPred;
      return {
        range,
        n: s.n,
        meanScore: s.meanScore,
        foundRate: s.foundRate,
        brier: s.brier,
        gap
      };
    });
  const ece = out.reduce((sum, b) => sum + (b.n / rows.length) * Math.abs(b.gap), 0);
  const mce = out.reduce((max, b) => Math.max(max, Math.abs(b.gap)), 0);
  return { bins: out, ece, mce };
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const arr = groups.get(key);
    if (arr) arr.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

function monthlyBreakdown(rows) {
  return [...groupBy(rows, (r) => String(r.createdAt).slice(0, 7)).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, rs]) => ({ month, ...summarize(rs) }));
}

function speciesBreakdown(rows, speciesNames) {
  return [...groupBy(rows.filter((r) => r.speciesId != null), (r) => r.speciesId).entries()]
    .map(([speciesId, rs]) => ({ speciesId: Number(speciesId), species: speciesNames.get(Number(speciesId)) ?? `species ${speciesId}`, ...summarize(rs) }))
    .filter((r) => r.n >= MIN_SPECIES_N)
    .sort((a, b) => b.n - a.n);
}

function printText(report) {
  const s = report.summary;
  console.log('\n=== Spot-feedback calibration ===');
  console.log(`Rows: ${s.n}  |  found: ${s.positives}/${s.n} (${pct(s.foundRate)})  |  mean score: ${fixed(s.meanScore, 1)}/100`);
  console.log(`Brier: ${fixed(s.brier)}  |  baseline Brier: ${fixed(s.baselineBrier)}  |  Brier skill: ${pct(s.brierSkill)}`);
  console.log(`ECE: ${fixed(report.calibration.ece)}  |  MCE: ${fixed(report.calibration.mce)}  |  AUC (secondary): ${fixed(s.auc)}  |  log loss: ${fixed(s.logLoss)}\n`);

  if (s.n < 100) {
    console.log('Warning: fewer than 100 feedback rows. Treat this as instrumentation QA, not model truth yet.\n');
  }

  console.log('Calibration bins (score -> observed found rate):');
  for (const b of report.calibration.bins.filter((bin) => bin.n >= MIN_BIN_N)) {
    const sign = b.gap >= 0 ? '+' : '';
    console.log(
      `  ${b.range.padStart(7)}  n=${String(b.n).padStart(4)}  mean=${fixed(b.meanScore, 1).padStart(5)}  found=${pct(b.foundRate).padStart(6)}  gap=${sign}${pct(b.gap)}  brier=${fixed(b.brier)}`
    );
  }

  if (report.bySpecies.length > 0) {
    console.log(`\nBy species (n >= ${MIN_SPECIES_N}):`);
    for (const r of report.bySpecies) {
      console.log(
        `  ${String(r.speciesId).padStart(3)}  ${r.species.padEnd(42).slice(0, 42)}  n=${String(r.n).padStart(4)}  found=${pct(r.foundRate).padStart(6)}  mean=${fixed(r.meanScore, 1).padStart(5)}  brier=${fixed(r.brier)}`
      );
    }
  }

  if (report.byMonth.length > 0) {
    console.log('\nBy month:');
    for (const r of report.byMonth) {
      console.log(
        `  ${r.month}  n=${String(r.n).padStart(4)}  found=${pct(r.foundRate).padStart(6)}  mean=${fixed(r.meanScore, 1).padStart(5)}  brier=${fixed(r.brier)}`
      );
    }
  }

  console.log('\nInterpretation: Brier/ECE are calibration metrics. AUC only says whether higher scores rank finds above non-finds.');
}

async function main() {
  const rows = await fetchFeedbackRows();
  const speciesNames = await fetchSpeciesNames(rows.map((r) => r.speciesId));
  const calibration = rows.length ? calibrationBins(rows) : { bins: [], ece: null, mce: null };
  const report = {
    filters: {
      since: SINCE,
      until: UNTIL,
      speciesId: SPECIES_ID,
      binSize: BIN_SIZE,
      minBinN: MIN_BIN_N,
      minSpeciesN: MIN_SPECIES_N
    },
    summary: summarize(rows),
    calibration,
    bySpecies: speciesBreakdown(rows, speciesNames),
    byMonth: monthlyBreakdown(rows)
  };

  if (JSON_OUTPUT) console.log(JSON.stringify(report, null, 2));
  else printText(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
