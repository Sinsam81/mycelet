/**
 * Local preflight for the prediction-validation suite.
 *
 * Default mode is intentionally offline: no Supabase, Frost, SMHI, NIBIO, or
 * CORINE calls. It checks whether the validation commands can start cleanly and
 * whether the expected local migration/script scaffolding exists.
 *
 * Optional:
 *   LIVE_DB_CHECK=1 npm run validation:preflight
 *
 * That performs tiny Supabase REST reads to verify table access after applying
 * migrations. It never prints secret values.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HELP = new Set(['-h', '--help']);
const args = new Set(process.argv.slice(2));
const JSON_OUTPUT = args.has('--json') || process.env.JSON === '1';
const LIVE_DB_CHECK = process.env.LIVE_DB_CHECK === '1';

if ([...args].some((a) => HELP.has(a))) {
  console.log(`Usage: npm run validation:preflight

Environment:
  LIVE_DB_CHECK=1                Optional tiny Supabase REST table checks
  JSON=1 or --json               Print machine-readable result

Checks:
  - Node version supports --env-file used by validation scripts
  - package.json contains the expected validation npm scripts
  - validation scripts and migration 022 exist locally
  - .env.local / shell env contains required Supabase keys
  - .next/validation is writable
  - optional Frost key is present for Norwegian historical-weather rows
`);
  process.exit(0);
}

const checks = [];

function add(level, label, detail = '') {
  checks.push({ level, label, detail });
}

function ok(label, detail = '') {
  add('ok', label, detail);
}

function warn(label, detail = '') {
  add('warn', label, detail);
}

function error(label, detail = '') {
  add('error', label, detail);
}

function parseEnvFile(path) {
  if (!existsSync(path)) return { exists: false, values: {} };
  const values = {};
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const hash = value.search(/\s#/);
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    values[match[1]] = value;
  }
  return { exists: true, values };
}

function effectiveEnv(fileEnv, key) {
  const shellValue = process.env[key];
  if (shellValue != null && shellValue.trim() !== '') return { present: true, source: 'shell' };
  const fileValue = fileEnv.values[key];
  if (fileValue != null && fileValue.trim() !== '') return { present: true, source: '.env.local' };
  return { present: false, source: null };
}

function effectiveEnvValue(fileEnv, key) {
  const shellValue = process.env[key];
  if (shellValue != null && shellValue.trim() !== '') return shellValue;
  const fileValue = fileEnv.values[key];
  return fileValue != null && fileValue.trim() !== '' ? fileValue : null;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    error(path, err instanceof Error ? err.message : String(err));
    return null;
  }
}

function compareNodeVersion(version, min) {
  const actual = version.split('.').map((p) => Number(p));
  const required = min.split('.').map((p) => Number(p));
  for (let i = 0; i < required.length; i++) {
    const a = actual[i] ?? 0;
    const r = required[i] ?? 0;
    if (a > r) return 1;
    if (a < r) return -1;
  }
  return 0;
}

function checkNode() {
  const min = '20.6.0';
  if (compareNodeVersion(process.versions.node, min) >= 0) {
    ok('Node version', `${process.versions.node} supports --env-file.`);
  } else {
    error('Node version', `${process.versions.node} is too old; validation scripts need Node >= ${min}.`);
  }
}

function checkPackageScripts() {
  const pkg = readJson('package.json');
  if (!pkg) return;
  const required = [
    'calibrate:spot-feedback',
    'calibrate:fit-score',
    'backtest:phenology',
    'backtest:full-pipeline',
    'features:occurrence-weather',
    'fit:weather-preferences',
    'fit:sdm-logistic',
    'validation:preflight',
    'validation:all',
    'validation:report'
  ];
  const scripts = pkg.scripts ?? {};
  const missing = required.filter((name) => !scripts[name]);
  if (missing.length === 0) ok('package scripts', `${required.length} validation scripts present.`);
  else error('package scripts', `Missing: ${missing.join(', ')}.`);
}

function checkFiles() {
  const required = [
    'scripts/analyze-spot-feedback.mjs',
    'scripts/fit-score-calibration.mjs',
    'scripts/backtest-phenology.mjs',
    'scripts/backtest-full-pipeline.mjs',
    'scripts/build-occurrence-weather-features.mjs',
    'scripts/fit-weather-preferences.mjs',
    'scripts/fit-sdm-logistic.mjs',
    'scripts/run-prediction-validation.mjs',
    'scripts/summarize-prediction-validation.mjs',
    'supabase/migrations/021_spot_feedback.sql',
    'supabase/migrations/022_occurrence_weather_features.sql'
  ];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length === 0) ok('validation files', `${required.length} scripts/migrations present.`);
  else error('validation files', `Missing: ${missing.join(', ')}.`);

  const migration = 'supabase/migrations/022_occurrence_weather_features.sql';
  if (existsSync(migration)) {
    const body = readFileSync(migration, 'utf8');
    if (body.includes('occurrence_weather_features') && body.includes('occurrence_id')) {
      ok('migration 022', 'Local weather-feature migration contains occurrence_weather_features.');
    } else {
      error('migration 022', 'File exists but does not look like the weather-feature migration.');
    }
  }
}

function checkEnv() {
  const fileEnv = parseEnvFile('.env.local');
  if (fileEnv.exists) ok('.env.local', 'Found local env file.');
  else error('.env.local', 'Not found. npm validation commands use node --env-file=.env.local.');

  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  for (const key of required) {
    const state = effectiveEnv(fileEnv, key);
    if (state.present) ok(key, `Present from ${state.source}; value hidden.`);
    else error(key, 'Missing. Validation scripts need Supabase REST access.');
  }

  const url = effectiveEnvValue(fileEnv, 'NEXT_PUBLIC_SUPABASE_URL');
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && parsed.hostname.includes('supabase')) {
        ok('Supabase URL shape', 'Looks like an HTTPS Supabase URL.');
      } else {
        warn('Supabase URL shape', 'Present, but not an obvious HTTPS Supabase URL.');
      }
    } catch {
      error('Supabase URL shape', 'NEXT_PUBLIC_SUPABASE_URL is not a valid URL.');
    }
  }

  const frost = effectiveEnv(fileEnv, 'MET_FROST_CLIENT_ID');
  if (frost.present) ok('MET_FROST_CLIENT_ID', `Present from ${frost.source}; value hidden.`);
  else warn('MET_FROST_CLIENT_ID', 'Missing. Norwegian historical-weather rows will be skipped/error in feature builds.');

  return fileEnv;
}

function checkWritableOutputDir() {
  const dir = process.env.VALIDATION_DIR || '.next/validation';
  const probe = join(dir, `.preflight-${Date.now()}.tmp`);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(probe, 'ok\n');
    unlinkSync(probe);
    ok('validation output dir', `${dir} is writable.`);
  } catch (err) {
    error('validation output dir', err instanceof Error ? err.message : String(err));
  }
}

function checkDependencies() {
  if (existsSync('node_modules')) ok('node_modules', 'Dependencies appear installed.');
  else warn('node_modules', 'Missing. Run npm install before validation.');

  if (existsSync('package-lock.json')) ok('package-lock.json', 'Lockfile present.');
  else warn('package-lock.json', 'No npm lockfile found.');
}

async function liveDbCheck(fileEnv) {
  if (!LIVE_DB_CHECK) {
    ok('live DB check', 'Skipped by default. Set LIVE_DB_CHECK=1 to verify remote table access.');
    return;
  }

  const url = effectiveEnvValue(fileEnv, 'NEXT_PUBLIC_SUPABASE_URL');
  const key = effectiveEnvValue(fileEnv, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    error('live DB check', 'Skipped because Supabase env is missing.');
    return;
  }

  const tables = [
    { table: 'species_occurrences', select: 'id' },
    { table: 'spot_feedback', select: 'id' },
    { table: 'occurrence_weather_features', select: 'occurrence_id' }
  ];

  for (const t of tables) {
    const endpoint = `${url.replace(/\/$/, '')}/rest/v1/${t.table}?select=${t.select}&limit=1`;
    try {
      const res = await fetch(endpoint, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`
        }
      });
      if (res.ok) {
        ok(`live table ${t.table}`, 'Readable with service role.');
      } else {
        const body = (await res.text()).slice(0, 240).replace(/\s+/g, ' ');
        error(`live table ${t.table}`, `REST ${res.status}: ${body}`);
      }
    } catch (err) {
      error(`live table ${t.table}`, err instanceof Error ? err.message : String(err));
    }
  }
}

function render() {
  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ ok: !checks.some((c) => c.level === 'error'), checks }, null, 2));
    return;
  }

  console.log('Prediction validation preflight\n');
  for (const c of checks) {
    const tag = c.level === 'ok' ? 'OK' : c.level === 'warn' ? 'WARN' : 'ERROR';
    console.log(`[${tag}] ${c.label}${c.detail ? ` - ${c.detail}` : ''}`);
  }
  const errors = checks.filter((c) => c.level === 'error').length;
  const warnings = checks.filter((c) => c.level === 'warn').length;
  console.log(`\nResult: ${errors} error(s), ${warnings} warning(s).`);
}

checkNode();
checkPackageScripts();
checkFiles();
checkDependencies();
const fileEnv = checkEnv();
checkWritableOutputDir();
await liveDbCheck(fileEnv);
render();

if (checks.some((c) => c.level === 'error')) process.exit(1);
