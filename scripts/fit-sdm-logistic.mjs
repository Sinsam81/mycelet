/**
 * Fit a small regularized logistic baseline on the SDM JSONL export.
 *
 * Input is produced by:
 *   EXPORT_SDM_JSONL=.next/validation/sdm-target-group.jsonl npm run backtest:full-pipeline
 *
 * This is not a production model writer. It is a fast audit tool for answering:
 * do habitat/forest features separate future presences from target-group
 * background better than chance, under grouped cross-validation?
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const HELP = new Set(['-h', '--help']);
const args = new Set(process.argv.slice(2));

if ([...args].some((a) => HELP.has(a))) {
  console.log(`Usage: node scripts/fit-sdm-logistic.mjs [--json]

Environment:
  SDM_JSONL                      Default .next/validation/sdm-target-group.jsonl
  FEATURE_SET                    habitat (default), no_occurrence, or full
  INCLUDE_SPECIES=1              Add species one-hot features
  INCLUDE_REGION=1               Add country one-hot; off by default to avoid region drift leakage
  INCLUDE_COORDS=1               Add latitude/longitude; off by default to avoid easy geography leakage
  FOLDS                          Spatially grouped CV folds by cvGroup, default 5
  ITERATIONS                     Gradient steps, default 1200
  LEARNING_RATE                  Default 0.08
  L2                             L2 penalty, default 0.02
  OUT                            Optional JSON report path
  --json                         Print machine-readable JSON
`);
  process.exit(0);
}

const DATA_PATH = process.env.SDM_JSONL || '.next/validation/sdm-target-group.jsonl';
const FEATURE_SET = ['habitat', 'no_occurrence', 'full'].includes(process.env.FEATURE_SET)
  ? process.env.FEATURE_SET
  : 'habitat';
const INCLUDE_SPECIES = process.env.INCLUDE_SPECIES === '1';
const INCLUDE_REGION = process.env.INCLUDE_REGION === '1';
const INCLUDE_COORDS = process.env.INCLUDE_COORDS === '1';
const FOLDS = clampInt(Number(process.env.FOLDS || 5), 2, 10);
const ITERATIONS = clampInt(Number(process.env.ITERATIONS || 1200), 50, 20000);
const LEARNING_RATE = clampNumber(Number(process.env.LEARNING_RATE || 0.08), 0.001, 1);
const L2 = clampNumber(Number(process.env.L2 || 0.02), 0, 10);
const JSON_OUTPUT = args.has('--json') || process.env.JSON === '1';

function clampInt(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function sigmoid(z) {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

function hash32(value) {
  const input = String(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function readJsonl(path) {
  if (!existsSync(path)) throw new Error(`Missing SDM JSONL: ${path}`);
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, idx) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        throw new Error(`Invalid JSONL line ${idx + 1}: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
    .filter((row) => row.label === 0 || row.label === 1);
}

function addNumeric(out, name, value) {
  const n = Number(value);
  if (Number.isFinite(n)) {
    out[name] = n;
  } else {
    out[name] = 0;
    out[`${name}:missing`] = 1;
  }
}

function addOneHot(out, name, value) {
  out[`${name}=${String(value ?? 'unknown')}`] = 1;
}

function rowFeatures(row) {
  const out = {};
  const f = row.features ?? {};

  addNumeric(out, 'forestPresent', f.forestPresent);
  addNumeric(out, 'habitatScore', f.habitatScore);
  addNumeric(out, 'hostGate', f.hostGate);
  addNumeric(out, 'forestProductivity', f.forestProductivity);
  addNumeric(out, 'forestVolumePerHa', f.forestVolumePerHa);
  if (INCLUDE_REGION) addOneHot(out, 'region', row.region);
  addOneHot(out, 'forestSource', f.forestSource);
  addOneHot(out, 'forestType', f.forestType);

  if (FEATURE_SET === 'no_occurrence' || FEATURE_SET === 'full') {
    addNumeric(out, 'phenology', f.phenology);
  }
  if (FEATURE_SET === 'full') {
    addNumeric(out, 'occurrenceDensity', f.occurrenceDensity);
    addNumeric(out, 'occurrenceBoost', f.occurrenceBoost);
  }
  if (INCLUDE_SPECIES) addOneHot(out, 'speciesId', row.speciesId);
  if (INCLUDE_COORDS) {
    addNumeric(out, 'latitude', row.latitude);
    addNumeric(out, 'longitude', row.longitude);
  }

  return out;
}

function buildMatrix(rows, featureNames = null) {
  const featureMaps = rows.map(rowFeatures);
  const names = featureNames ?? [...new Set(featureMaps.flatMap((m) => Object.keys(m)))].sort();
  const index = new Map(names.map((name, i) => [name, i]));
  const x = featureMaps.map((m) => {
    const row = new Array(names.length).fill(0);
    for (const [name, value] of Object.entries(m)) {
      const idx = index.get(name);
      if (idx != null) row[idx] = value;
    }
    return row;
  });
  return { x, names };
}

function standardize(trainX, evalX) {
  const p = trainX[0]?.length ?? 0;
  const mean = new Array(p).fill(0);
  const std = new Array(p).fill(0);
  for (const row of trainX) for (let j = 0; j < p; j++) mean[j] += row[j];
  for (let j = 0; j < p; j++) mean[j] /= trainX.length;
  for (const row of trainX) for (let j = 0; j < p; j++) std[j] += (row[j] - mean[j]) ** 2;
  for (let j = 0; j < p; j++) std[j] = Math.sqrt(std[j] / trainX.length) || 1;
  const tx = trainX.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  const ex = evalX.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  return { trainX: tx, evalX: ex, mean, std };
}

function fitLogistic(x, y) {
  const n = x.length;
  const p = x[0]?.length ?? 0;
  const w = new Array(p + 1).fill(0); // intercept + features
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const grad = new Array(p + 1).fill(0);
    for (let i = 0; i < n; i++) {
      let z = w[0];
      for (let j = 0; j < p; j++) z += w[j + 1] * x[i][j];
      const err = sigmoid(z) - y[i];
      grad[0] += err;
      for (let j = 0; j < p; j++) grad[j + 1] += err * x[i][j];
    }
    for (let j = 0; j < w.length; j++) {
      const penalty = j === 0 ? 0 : L2 * w[j];
      w[j] -= LEARNING_RATE * (grad[j] / n + penalty);
    }
  }
  return w;
}

function predict(x, w) {
  return x.map((row) => {
    let z = w[0];
    for (let j = 0; j < row.length; j++) z += w[j + 1] * row[j];
    return sigmoid(z);
  });
}

function auc(labels, scores) {
  const pairs = labels.map((label, i) => ({ label, score: scores[i] })).sort((a, b) => a.score - b.score);
  let rankSum = 0;
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < pairs.length; ) {
    let j = i + 1;
    while (j < pairs.length && pairs[j].score === pairs[i].score) j++;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) {
      if (pairs[k].label === 1) {
        rankSum += avgRank;
        pos++;
      } else {
        neg++;
      }
    }
    i = j;
  }
  if (!pos || !neg) return null;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

function pairedAuc(rows, scores) {
  const byPair = new Map();
  rows.forEach((row, i) => {
    const arr = byPair.get(row.pairId) ?? [];
    arr.push({ label: row.label, score: scores[i] });
    byPair.set(row.pairId, arr);
  });
  let wins = 0;
  let n = 0;
  for (const arr of byPair.values()) {
    const pos = arr.find((r) => r.label === 1);
    const neg = arr.find((r) => r.label === 0);
    if (!pos || !neg) continue;
    wins += pos.score > neg.score ? 1 : pos.score === neg.score ? 0.5 : 0;
    n++;
  }
  return n ? wins / n : null;
}

function brier(labels, scores) {
  return labels.reduce((sum, y, i) => sum + (scores[i] - y) ** 2, 0) / labels.length;
}

function logLoss(labels, scores) {
  return (
    labels.reduce((sum, y, i) => {
      const p = Math.max(1e-6, Math.min(1 - 1e-6, scores[i]));
      return sum - (y * Math.log(p) + (1 - y) * Math.log(1 - p));
    }, 0) / labels.length
  );
}

function summarizeCoefficients(names, w, mean, std) {
  const rows = names.map((name, i) => ({
    feature: name,
    coefficient: w[i + 1] / std[i]
  }));
  return {
    positive: [...rows].sort((a, b) => b.coefficient - a.coefficient).slice(0, 12),
    negative: [...rows].sort((a, b) => a.coefficient - b.coefficient).slice(0, 12),
    intercept: w[0] - rows.reduce((sum, row, i) => sum + (w[i + 1] * mean[i]) / std[i], 0)
  };
}

function fixed(value, digits = 4) {
  return value == null || !Number.isFinite(value) ? 'n/a' : value.toFixed(digits);
}

const rows = readJsonl(DATA_PATH);
if (rows.length < 20) throw new Error(`Need at least 20 rows, got ${rows.length}.`);
const labels = rows.map((r) => Number(r.label));
const { x, names } = buildMatrix(rows);
const predictions = new Array(rows.length).fill(null);
const cvGroups = new Set(rows.map((row) => row.cvGroup ?? row.presenceId ?? row.pairId));
if (cvGroups.size < FOLDS) {
  throw new Error(`Need at least ${FOLDS} spatial CV groups, got ${cvGroups.size}.`);
}

for (let fold = 0; fold < FOLDS; fold++) {
  const trainIdx = [];
  const evalIdx = [];
  rows.forEach((row, idx) => {
    const bucket = hash32(row.cvGroup ?? row.presenceId ?? row.pairId) % FOLDS;
    if (bucket === fold) evalIdx.push(idx);
    else trainIdx.push(idx);
  });
  if (trainIdx.length === 0 || evalIdx.length === 0) continue;
  const trainXRaw = trainIdx.map((i) => x[i]);
  const evalXRaw = evalIdx.map((i) => x[i]);
  const yTrain = trainIdx.map((i) => labels[i]);
  const { trainX, evalX } = standardize(trainXRaw, evalXRaw);
  const w = fitLogistic(trainX, yTrain);
  const foldPred = predict(evalX, w);
  evalIdx.forEach((idx, i) => {
    predictions[idx] = foldPred[i];
  });
}

const kept = rows.map((row, i) => ({ row, label: labels[i], pred: predictions[i] })).filter((r) => r.pred != null);
const keptLabels = kept.map((r) => r.label);
const keptScores = kept.map((r) => r.pred);

const fullStd = standardize(x, x);
const finalWeights = fitLogistic(fullStd.trainX, labels);
const prevalence = labels.reduce((sum, y) => sum + y, 0) / labels.length;
const baselineScores = labels.map(() => prevalence);

const report = {
  method: {
    dataPath: DATA_PATH,
    featureSet: FEATURE_SET,
    includeSpecies: INCLUDE_SPECIES,
    includeRegion: INCLUDE_REGION,
    includeCoordinates: INCLUDE_COORDS,
    folds: FOLDS,
    iterations: ITERATIONS,
    learningRate: LEARNING_RATE,
    l2: L2,
    rows: rows.length,
    evaluatedRows: kept.length,
    pairs: new Set(rows.map((r) => r.pairId)).size,
    cvGroups: cvGroups.size,
    features: names.length,
    note: 'Spatially grouped by the held-out presence block. Use as an SDM audit baseline, not as a production artifact.'
  },
  metrics: {
    auc: auc(keptLabels, keptScores),
    pairedAuc: pairedAuc(
      kept.map((r) => r.row),
      keptScores
    ),
    brier: brier(keptLabels, keptScores),
    logLoss: logLoss(keptLabels, keptScores),
    baselineBrier: brier(labels, baselineScores),
    prevalence
  },
  coefficients: summarizeCoefficients(names, finalWeights, fullStd.mean, fullStd.std)
};

if (process.env.OUT) {
  mkdirSync(dirname(process.env.OUT), { recursive: true });
  writeFileSync(process.env.OUT, `${JSON.stringify(report, null, 2)}\n`);
}

if (JSON_OUTPUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('\n=== SDM logistic baseline (target-group JSONL) ===');
  console.log(
    `Rows: ${report.method.rows}  | pairs: ${report.method.pairs}  | spatial CV groups: ${report.method.cvGroups}  | features: ${report.method.features}`
  );
  console.log(
    `Feature set: ${FEATURE_SET}${INCLUDE_SPECIES ? ' + species' : ''}${INCLUDE_REGION ? ' + region' : ''}${INCLUDE_COORDS ? ' + coords' : ''}`
  );
  console.log(`AUC: ${fixed(report.metrics.auc)}  | paired AUC: ${fixed(report.metrics.pairedAuc)}`);
  console.log(`Brier: ${fixed(report.metrics.brier)}  | baseline Brier: ${fixed(report.metrics.baselineBrier)}  | logLoss: ${fixed(report.metrics.logLoss)}`);
  console.log('\nTop positive coefficients:');
  for (const row of report.coefficients.positive.slice(0, 8)) console.log(`  ${row.feature.padEnd(34)} ${fixed(row.coefficient)}`);
  console.log('\nTop negative coefficients:');
  for (const row of report.coefficients.negative.slice(0, 8)) console.log(`  ${row.feature.padEnd(34)} ${fixed(row.coefficient)}`);
  if (process.env.OUT) console.log(`\nWrote ${process.env.OUT}`);
}
