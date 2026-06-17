/**
 * Run the prediction validation suite and write JSON artifacts + report.
 *
 * Safe default:
 *   - Writes only local files under .next/validation.
 *   - occurrence_weather_features runs as DRY_RUN unless WRITE_FEATURES=1.
 *
 * Run:
 *   npm run validation:all
 *
 * Useful knobs:
 *   MAX_TEST=1000 NEG_PER_POS=5 npm run validation:all
 *   WRITE_FEATURES=1 FEATURE_REGION=NO FEATURE_LIMIT=100 npm run validation:all
 *   SKIP_PHENOLOGY=1 SKIP_BACKTEST=1 SKIP_WEATHER_PREFS=1 npm run validation:all
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const HELP = new Set(['-h', '--help']);
const args = new Set(process.argv.slice(2));

if ([...args].some((a) => HELP.has(a))) {
  console.log(`Usage: npm run validation:all

Environment:
  VALIDATION_DIR                 Default .next/validation
  MAX_TEST                       Full-pipeline sample size, default 300
  NEG_PER_POS                    Target-group negatives, default 3
  FOREST_CONCURRENCY             Default 4
  EXPORT_SDM_JSONL               Optional full-pipeline feature export path
  SDM_FEATURE_SET                habitat (default), no_occurrence, or full
  FEATURE_LIMIT                  Weather-feature rows to inspect, default 25
  FEATURE_REGION                 Optional NO or SE
  FEATURE_OFFSET                 Optional occurrence offset
  WRITE_FEATURES=1               Actually upsert occurrence_weather_features
  SKIP_SPOT_FEEDBACK=1           Skip spot-feedback calibration
  SKIP_SCORE_CALIBRATION=1       Skip score calibration table
  SKIP_PHENOLOGY=1               Skip temporal phenology backtest
  SKIP_BACKTEST=1                Skip full-pipeline backtest
  SKIP_SDM_LOGISTIC=1            Skip SDM logistic fit even when EXPORT_SDM_JSONL is set
  SKIP_OCCURRENCE_WEATHER=1      Skip weather feature build
  SKIP_WEATHER_PREFS=1           Skip weather preference fit
`);
  process.exit(0);
}

const OUT_DIR = process.env.VALIDATION_DIR || '.next/validation';
mkdirSync(OUT_DIR, { recursive: true });

const tasks = [
  {
    name: 'spot-feedback',
    skip: process.env.SKIP_SPOT_FEEDBACK === '1',
    file: `${OUT_DIR}/spot-feedback.json`,
    cmd: ['node', '--env-file=.env.local', 'scripts/analyze-spot-feedback.mjs', '--json']
  },
  {
    name: 'score-calibration',
    skip: process.env.SKIP_SCORE_CALIBRATION === '1',
    file: `${OUT_DIR}/score-calibration.json`,
    cmd: ['node', '--env-file=.env.local', 'scripts/fit-score-calibration.mjs', '--json']
  },
  {
    name: 'phenology',
    skip: process.env.SKIP_PHENOLOGY === '1',
    file: `${OUT_DIR}/phenology.json`,
    env: {
      SPLIT_MODE: process.env.PHENOLOGY_SPLIT_MODE || process.env.SPLIT_MODE || 'year',
      CUTOFF: process.env.PHENOLOGY_CUTOFF || process.env.CUTOFF || '2021-01-01'
    },
    cmd: ['node', '--env-file=.env.local', 'scripts/backtest-phenology.mjs', '--json']
  },
  {
    name: 'full-pipeline',
    skip: process.env.SKIP_BACKTEST === '1',
    file: `${OUT_DIR}/full-pipeline.json`,
    env: {
      MAX_TEST: process.env.MAX_TEST || '300',
      NEG_PER_POS: process.env.NEG_PER_POS || '3',
      FOREST_CONCURRENCY: process.env.FOREST_CONCURRENCY || '4'
    },
    cmd: ['node', '--env-file=.env.local', 'scripts/backtest-full-pipeline.mjs', '--json']
  },
  {
    name: 'sdm-logistic',
    skip: process.env.SKIP_SDM_LOGISTIC === '1' || !process.env.EXPORT_SDM_JSONL || process.env.SKIP_BACKTEST === '1',
    file: `${OUT_DIR}/sdm-logistic.json`,
    env: {
      SDM_JSONL: process.env.EXPORT_SDM_JSONL || '',
      FEATURE_SET: process.env.SDM_FEATURE_SET || 'habitat'
    },
    cmd: ['node', 'scripts/fit-sdm-logistic.mjs', '--json']
  },
  {
    name: 'occurrence-weather',
    skip: process.env.SKIP_OCCURRENCE_WEATHER === '1',
    file: `${OUT_DIR}/occurrence-weather.json`,
    env: {
      LIMIT: process.env.FEATURE_LIMIT || '25',
      ...(process.env.FEATURE_REGION ? { REGION: process.env.FEATURE_REGION } : {}),
      ...(process.env.FEATURE_OFFSET ? { OFFSET: process.env.FEATURE_OFFSET } : {}),
      DRY_RUN: process.env.WRITE_FEATURES === '1' ? '0' : '1'
    },
    cmd: ['node', '--env-file=.env.local', 'scripts/build-occurrence-weather-features.mjs', '--json']
  },
  {
    name: 'weather-preferences',
    skip: process.env.SKIP_WEATHER_PREFS === '1',
    file: `${OUT_DIR}/weather-preferences.json`,
    cmd: ['node', '--env-file=.env.local', 'scripts/fit-weather-preferences.mjs', '--json']
  }
];

function runTask(task) {
  return new Promise((resolve) => {
    if (task.skip) {
      console.log(`skip ${task.name}`);
      resolve({ ok: true, skipped: true });
      return;
    }
    console.log(`run  ${task.name}`);
    const child = spawn(task.cmd[0], task.cmd.slice(1), {
      cwd: process.cwd(),
      env: { ...process.env, ...(task.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`fail ${task.name} (exit ${code})`);
        if (stderr.trim()) console.error(stderr.trim());
        resolve({ ok: false, code, stderr });
        return;
      }
      writeFileSync(task.file, stdout);
      console.log(`wrote ${task.file}`);
      resolve({ ok: true });
    });
  });
}

async function runReport() {
  console.log('run  validation-report');
  const child = spawn('node', ['scripts/summarize-prediction-validation.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SPOT_FEEDBACK_JSON: `${OUT_DIR}/spot-feedback.json`,
      SCORE_CALIBRATION_JSON: `${OUT_DIR}/score-calibration.json`,
      PHENOLOGY_JSON: `${OUT_DIR}/phenology.json`,
      FULL_PIPELINE_JSON: `${OUT_DIR}/full-pipeline.json`,
      SDM_LOGISTIC_JSON: `${OUT_DIR}/sdm-logistic.json`,
      OCCURRENCE_WEATHER_JSON: `${OUT_DIR}/occurrence-weather.json`,
      WEATHER_PREFERENCES_JSON: `${OUT_DIR}/weather-preferences.json`,
      OUT: `${OUT_DIR}/report.md`
    },
    stdio: 'inherit'
  });
  return new Promise((resolve) => child.on('close', (code) => resolve(code === 0)));
}

let failed = false;
for (const task of tasks) {
  const result = await runTask(task);
  if (!result.ok) failed = true;
}
const reportOk = await runReport();
if (!reportOk) failed = true;

if (failed) {
  console.error(`Validation suite finished with failures. Partial artifacts may exist in ${OUT_DIR}.`);
  process.exit(1);
}
console.log(`Validation suite complete: ${OUT_DIR}/report.md`);
