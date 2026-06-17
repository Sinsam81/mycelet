/**
 * Empirical weather-preference audit from occurrence_weather_features.
 *
 * This is the next step after building the historical weather cache. It does
 * NOT fit production weights automatically; it summarizes what temperatures,
 * rain windows, humidity, and soil-moisture values each genus/species actually
 * appears under, plus a target-group contrast against other fungi records in
 * the same region + month.
 *
 * Run after occurrence_weather_features has data:
 *   node --env-file=.env.local scripts/fit-weather-preferences.mjs
 *   node --env-file=.env.local scripts/fit-weather-preferences.mjs --json
 *
 * Useful filters:
 *   REGION=NO MIN_N=50 GROUP_BY=species node --env-file=.env.local scripts/fit-weather-preferences.mjs
 */

const HELP = new Set(['-h', '--help']);
const args = new Set(process.argv.slice(2));

if ([...args].some((a) => HELP.has(a))) {
  console.log(`Usage: node --env-file=.env.local scripts/fit-weather-preferences.mjs [--json]

Environment:
  NEXT_PUBLIC_SUPABASE_URL       Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY      Service role key
  REGION                         Optional NO, SE, or other
  GROUP_BY                       genus or species, default genus
  MIN_N                          Minimum rows per group, default 40
  MAX_ROWS                       Max feature rows to read, default 50000
  NEG_PER_POS                    Matched target-group draws per row, default 3
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
const MAX_ROWS = clampInt(Number(process.env.MAX_ROWS || 50000), 1, Number.MAX_SAFE_INTEGER);
const REGION = process.env.REGION || null;
const GROUP_BY = process.env.GROUP_BY === 'species' ? 'species' : 'genus';
const MIN_N = clampInt(Number(process.env.MIN_N || 40), 1, Number.MAX_SAFE_INTEGER);
const NEG_PER_POS = clampInt(Number(process.env.NEG_PER_POS || 3), 1, 20);
const JSON_OUTPUT = args.has('--json') || process.env.JSON === '1';

function clampInt(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function fixed(value, digits = 3) {
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

function monthFromISO(iso) {
  return Number(String(iso).slice(5, 7));
}

function percentile(values, p) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const pos = (xs.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return xs[lo];
  return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}

function summarizeFeature(rows, key) {
  const values = rows.map((r) => r[key]).filter(Number.isFinite);
  return {
    n: values.length,
    p10: round(percentile(values, 0.1), 3),
    p25: round(percentile(values, 0.25), 3),
    p50: round(percentile(values, 0.5), 3),
    p75: round(percentile(values, 0.75), 3),
    p90: round(percentile(values, 0.9), 3)
  };
}

function round(value, digits) {
  if (value == null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function groupKey(row, speciesById) {
  const sp = speciesById.get(row.speciesId);
  if (!sp) return null;
  if (GROUP_BY === 'species') return `${sp.id}`;
  return sp.genus || null;
}

function groupLabel(key, speciesById) {
  if (GROUP_BY === 'species') {
    const sp = speciesById.get(Number(key));
    return sp ? `${sp.norwegianName} (${sp.latinName})` : `species ${key}`;
  }
  return key;
}

function indexTargetGroup(rows, speciesById) {
  const idx = new Map();
  for (const row of rows) {
    const month = monthFromISO(row.observedAt);
    const key = `${row.region}:${month}`;
    const arr = idx.get(key) ?? [];
    arr.push({ ...row, groupKey: groupKey(row, speciesById) });
    idx.set(key, arr);
  }
  return idx;
}

function aucFromPairs(pairs, scoreFn) {
  let wins = 0;
  let n = 0;
  for (const [pos, bg] of pairs) {
    const a = scoreFn(pos);
    const b = scoreFn(bg);
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (a > b) wins += 1;
    else if (a === b) wins += 0.5;
    n++;
  }
  return { auc: n ? wins / n : null, n };
}

function triangularScore(value, floor, min, max, ceil) {
  if (!Number.isFinite(value) || floor == null || min == null || max == null || ceil == null) return null;
  if (value <= floor || value >= ceil) return 0;
  if (value >= min && value <= max) return 1;
  if (value < min) return (value - floor) / Math.max(0.0001, min - floor);
  return (ceil - value) / Math.max(0.0001, ceil - max);
}

function suggestedPreference(stats) {
  const temp = stats.temperatureC;
  const rain = stats.rain3dMm;
  return {
    tempCFloor: temp.p10 == null ? null : round(temp.p10 - 2, 1),
    tempCMin: temp.p25 == null ? null : round(temp.p25, 1),
    tempCMax: temp.p75 == null ? null : round(temp.p75, 1),
    tempCCeil: temp.p90 == null ? null : round(temp.p90 + 2, 1),
    rainOptMm: rain.p75 == null ? null : round(Math.max(2, rain.p75), 1),
    note: 'Robust empirical window only. Do not copy weights without target-group validation.'
  };
}

async function fetchSpecies() {
  const rows = await rest('mushroom_species?select=id,norwegian_name,latin_name,genus&order=id');
  return new Map(
    rows.map((r) => [
      Number(r.id),
      {
        id: Number(r.id),
        norwegianName: r.norwegian_name,
        latinName: r.latin_name,
        genus: r.genus
      }
    ])
  );
}

async function fetchFeatures() {
  const rows = [];
  for (let from = 0; rows.length < MAX_ROWS; ) {
    const params = new URLSearchParams({
      select:
        'occurrence_id,species_id,observed_at,region,provider,temperature_c,humidity_pct,rain_3d_mm,rain_7d_mm,rain_14d_mm,soil_moisture_index',
      provider: 'neq.unavailable',
      temperature_c: 'not.is.null',
      species_id: 'not.is.null',
      order: 'occurrence_id',
      offset: String(from),
      limit: String(Math.min(PAGE, MAX_ROWS - rows.length))
    });
    if (REGION) params.set('region', `eq.${REGION}`);
    const page = await rest(`occurrence_weather_features?${params.toString()}`);
    rows.push(
      ...page.map((r) => ({
        occurrenceId: Number(r.occurrence_id),
        speciesId: Number(r.species_id),
        observedAt: r.observed_at,
        month: monthFromISO(r.observed_at),
        region: r.region,
        provider: r.provider,
        temperatureC: num(r.temperature_c),
        humidityPct: num(r.humidity_pct),
        rain3dMm: num(r.rain_3d_mm),
        rain7dMm: num(r.rain_7d_mm),
        rain14dMm: num(r.rain_14d_mm),
        soilMoistureIndex: num(r.soil_moisture_index)
      }))
    );
    from += page.length;
    if (page.length < PAGE) break;
  }
  return rows;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function targetGroupPairs(groupRows, allRows, group, speciesById, rng) {
  const idx = indexTargetGroup(allRows, speciesById);
  const pairs = [];
  for (const pos of groupRows) {
    const candidates = (idx.get(`${pos.region}:${pos.month}`) ?? []).filter((r) => r.groupKey !== group);
    if (!candidates.length) continue;
    for (let i = 0; i < NEG_PER_POS; i++) {
      const bg = candidates[Math.floor(rng() * candidates.length)];
      pairs.push([pos, bg]);
    }
  }
  return pairs;
}

function analyzeGroup(group, rows, allRows, speciesById, rng) {
  const stats = {
    temperatureC: summarizeFeature(rows, 'temperatureC'),
    humidityPct: summarizeFeature(rows, 'humidityPct'),
    rain3dMm: summarizeFeature(rows, 'rain3dMm'),
    rain7dMm: summarizeFeature(rows, 'rain7dMm'),
    rain14dMm: summarizeFeature(rows, 'rain14dMm'),
    soilMoistureIndex: summarizeFeature(rows, 'soilMoistureIndex')
  };
  const suggested = suggestedPreference(stats);
  const pairs = targetGroupPairs(rows, allRows, group, speciesById, rng);
  const tempAuc = aucFromPairs(pairs, (row) =>
    triangularScore(row.temperatureC, suggested.tempCFloor, suggested.tempCMin, suggested.tempCMax, suggested.tempCCeil)
  );
  const rainAuc = aucFromPairs(pairs, (row) => {
    if (!Number.isFinite(row.rain3dMm) || suggested.rainOptMm == null) return null;
    return Math.min(1, row.rain3dMm / suggested.rainOptMm);
  });
  const humidityAuc = aucFromPairs(pairs, (row) => {
    if (!Number.isFinite(row.humidityPct)) return null;
    return Math.max(0, Math.min(1, (row.humidityPct - 50) / 35));
  });
  const soilAuc = aucFromPairs(pairs, (row) => row.soilMoistureIndex);

  return {
    key: group,
    label: groupLabel(group, speciesById),
    n: rows.length,
    regions: counts(rows.map((r) => r.region)),
    providers: counts(rows.map((r) => r.provider)),
    stats,
    suggested,
    targetGroup: {
      matchedPairs: pairs.length,
      tempWindowAuc: tempAuc.auc,
      rain3dAuc: rainAuc.auc,
      humidityAuc: humidityAuc.auc,
      soilMoistureAuc: soilAuc.auc
    }
  };
}

function counts(values) {
  const out = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

function printText(report) {
  console.log('\n=== Empirical weather preferences ===');
  console.log(`Rows: ${report.rows}  | groups: ${report.groups.length}  | groupBy: ${GROUP_BY}`);
  console.log(`Filters: ${JSON.stringify(report.filters)}`);
  console.log('Target-group contrast = other fungi rows in same region + month.\n');

  for (const g of report.groups) {
    console.log(`${g.label}  n=${g.n}  regions=${JSON.stringify(g.regions)}`);
    console.log(
      `  temp p25-p75 ${fixed(g.stats.temperatureC.p25, 1)}-${fixed(g.stats.temperatureC.p75, 1)} C` +
        `  | rain3d p50/p75 ${fixed(g.stats.rain3dMm.p50, 1)}/${fixed(g.stats.rain3dMm.p75, 1)} mm` +
        `  | humidity p50 ${fixed(g.stats.humidityPct.p50, 1)}%` +
        `  | soil p50 ${fixed(g.stats.soilMoistureIndex.p50, 2)}`
    );
    console.log(
      `  suggested temp ${fixed(g.suggested.tempCFloor, 1)} / ${fixed(g.suggested.tempCMin, 1)}-${fixed(g.suggested.tempCMax, 1)} / ${fixed(g.suggested.tempCCeil, 1)} C` +
        `  rainOpt ${fixed(g.suggested.rainOptMm, 1)} mm`
    );
    console.log(
      `  AUC vs target-group: temp=${fixed(g.targetGroup.tempWindowAuc)} rain=${fixed(g.targetGroup.rain3dAuc)} humidity=${fixed(g.targetGroup.humidityAuc)} soil=${fixed(g.targetGroup.soilMoistureAuc)} pairs=${g.targetGroup.matchedPairs}\n`
    );
  }
  console.log('Do not wire suggested values blindly. Use them to update GENUS_PREFERENCES only after reviewing AUC, n, and NO/SE split.');
}

async function main() {
  const rng = makeRng(13579);
  const speciesById = await fetchSpecies();
  const rows = await fetchFeatures();
  const grouped = new Map();
  for (const row of rows) {
    const key = groupKey(row, speciesById);
    if (!key) continue;
    const arr = grouped.get(key) ?? [];
    arr.push(row);
    grouped.set(key, arr);
  }
  const groups = [...grouped.entries()]
    .filter(([, rs]) => rs.length >= MIN_N)
    .map(([key, rs]) => analyzeGroup(key, rs, rows, speciesById, rng))
    .sort((a, b) => b.n - a.n);

  const report = {
    filters: { region: REGION, groupBy: GROUP_BY, minN: MIN_N, maxRows: MAX_ROWS, negPerPos: NEG_PER_POS },
    rows: rows.length,
    groups
  };

  if (JSON_OUTPUT) console.log(JSON.stringify(report, null, 2));
  else printText(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
