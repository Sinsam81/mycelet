/**
 * Summarize prediction-validation JSON artifacts into a decision report.
 *
 * This script does not call Supabase. It reads the JSON files produced by the
 * validation scripts and turns them into a compact "what now?" report.
 *
 * Expected default files:
 *   .next/validation/spot-feedback.json
 *   .next/validation/score-calibration.json
 *   .next/validation/phenology.json
 *   .next/validation/full-pipeline.json
 *   .next/validation/occurrence-weather.json
 *   .next/validation/weather-preferences.json
 *
 * Run:
 *   npm run validation:report
 *   OUT=.next/validation/report.md npm run validation:report
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const HELP = new Set(['-h', '--help']);
const args = new Set(process.argv.slice(2));

if ([...args].some((a) => HELP.has(a))) {
  console.log(`Usage: node scripts/summarize-prediction-validation.mjs

Environment:
  SPOT_FEEDBACK_JSON             Default .next/validation/spot-feedback.json
  SCORE_CALIBRATION_JSON         Default .next/validation/score-calibration.json
  PHENOLOGY_JSON                 Default .next/validation/phenology.json
  FULL_PIPELINE_JSON             Default .next/validation/full-pipeline.json
  OCCURRENCE_WEATHER_JSON        Default .next/validation/occurrence-weather.json
  WEATHER_PREFERENCES_JSON       Default .next/validation/weather-preferences.json
  OUT                            Optional markdown output path
`);
  process.exit(0);
}

const PATHS = {
  spotFeedback: process.env.SPOT_FEEDBACK_JSON || '.next/validation/spot-feedback.json',
  scoreCalibration: process.env.SCORE_CALIBRATION_JSON || '.next/validation/score-calibration.json',
  phenology: process.env.PHENOLOGY_JSON || '.next/validation/phenology.json',
  fullPipeline: process.env.FULL_PIPELINE_JSON || '.next/validation/full-pipeline.json',
  occurrenceWeather: process.env.OCCURRENCE_WEATHER_JSON || '.next/validation/occurrence-weather.json',
  weatherPreferences: process.env.WEATHER_PREFERENCES_JSON || '.next/validation/weather-preferences.json'
};

function readJson(path) {
  if (!existsSync(path)) return { ok: false, path };
  try {
    return { ok: true, path, data: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (err) {
    return { ok: false, path, error: err instanceof Error ? err.message : String(err) };
  }
}

function fixed(value, digits = 3) {
  return value == null || !Number.isFinite(value) ? 'n/a' : value.toFixed(digits);
}

function pct(value) {
  return value == null || !Number.isFinite(value) ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function decision(label, status, why) {
  return `- **${label}:** ${status}. ${why}`;
}

function summarizeSpotFeedback(file) {
  if (!file.ok) {
    return {
      lines: [
        decision('Spot-feedback calibration', 'mangler data', `Kjør \`npm run calibrate:spot-feedback -- --json > ${file.path}\`.`)
      ],
      gates: []
    };
  }
  const s = file.data.summary ?? {};
  const gates = [];
  const n = Number(s.n ?? 0);
  const brierSkill = s.brierSkill;
  const ece = file.data.calibration?.ece;
  const overconfidence = s.meanScore != null && s.foundRate != null ? s.meanScore / 100 - s.foundRate : null;

  let status = 'ikke nok data';
  if (n >= 500 && brierSkill > 0 && ece <= 0.1) status = 'kan brukes som kalibreringssignal';
  else if (n >= 100 && brierSkill > 0) status = 'svakt, men nyttig signal';
  else if (n >= 100 && brierSkill <= 0) status = 'score slår ikke baseline';

  gates.push({ key: 'spotFeedbackN', pass: n >= 300, value: n, need: '>=300 for seriøs kalibrering' });
  gates.push({ key: 'brierSkill', pass: brierSkill > 0, value: brierSkill, need: '>0' });
  gates.push({ key: 'ece', pass: ece != null && ece <= 0.1, value: ece, need: '<=0.10' });

  const lines = [
    decision(
      'Spot-feedback calibration',
      status,
      `n=${n}, found=${pct(s.foundRate)}, meanScore=${fixed(s.meanScore, 1)}/100, Brier skill=${pct(brierSkill)}, ECE=${fixed(ece)}.`
    )
  ];
  if (overconfidence != null && overconfidence > 0.15) {
    lines.push(decision('Overconfidence', 'risiko', `Mean score ligger ${pct(overconfidence)} over funnrate. Kalibrer ned før mer aggressiv UI.`));
  }
  for (const r of file.data.byRegion ?? []) {
    lines.push(`  - Region ${r.region}: n=${r.n}, found=${pct(r.foundRate)}, brier=${fixed(r.brier)}, auc=${fixed(r.auc)}.`);
  }
  return { lines, gates };
}

function summarizeScoreCalibration(file) {
  if (!file.ok) {
    return {
      lines: [
        decision('Score calibration table', 'mangler data', `Kjør \`npm run calibrate:fit-score -- --json > ${file.path}\`.`)
      ],
      gates: []
    };
  }
  const s = file.data.summary ?? {};
  const rows = file.data.table ?? [];
  const minRows = file.data.filters?.minRows ?? 300;
  const usable = s.n >= minRows && s.brierSkill > 0;
  return {
    lines: [
      decision(
        'Score calibration table',
        usable ? 'kandidat' : 'ikke wire ennå',
        `n=${s.n}, minRows=${minRows}, Brier skill=${pct(s.brierSkill)}, bins=${rows.length}.`
      )
    ],
    gates: [{ key: 'scoreCalibrationUsable', pass: usable, value: s.n, need: `>=${minRows} rows and positive Brier skill` }]
  };
}

function summarizePhenology(file) {
  if (!file.ok) {
    return {
      lines: [
        decision('Temporal phenology backtest', 'mangler data', `Kjør \`npm run backtest:phenology -- --json > ${file.path}\`.`)
      ],
      gates: []
    };
  }
  const method = file.data.method ?? {};
  const auc = file.data.auc ?? {};
  const splitMode = method.splitMode ?? 'unknown';
  const empirical = auc.empiricalPhenology;
  const oldMonth = auc.oldMonthModel;
  const delta = auc.delta;
  const temporal = splitMode === 'year';
  const useful = temporal && empirical != null && oldMonth != null && delta > 0 && empirical >= 0.75;
  const lines = [
    decision(
      'Temporal phenology backtest',
      useful ? 'sterkt timing-signal' : 'timing må tolkes forsiktig',
      `split=${splitMode}${method.cutoff ? ` cutoff=${method.cutoff}` : ''}, old=${fixed(oldMonth)}, empirical=${fixed(empirical)}, delta=${fixed(delta)}, testRows=${method.testRows}, curves=${method.curves}.`
    )
  ];
  if (!temporal) {
    lines.push(decision('Phenology split', 'ikke temporal', 'Hash-holdout måler rad-generaliserering, ikke fremtidig årsdrift.'));
  }
  return {
    lines,
    gates: [
      { key: 'phenologyTemporalSplit', pass: temporal, value: temporal ? 1 : 0, need: 'SPLIT_MODE=year' },
      { key: 'phenologyAuc', pass: empirical != null && empirical >= 0.75, value: empirical, need: '>=0.75' },
      { key: 'phenologyDelta', pass: delta != null && delta > 0, value: delta, need: '>0 over old month model' }
    ]
  };
}

function summarizeFullPipeline(file) {
  if (!file.ok) {
    return {
      lines: [
        decision('Full-pipeline spatial audit', 'mangler data', `Kjør \`npm run backtest:full-pipeline -- --json > ${file.path}\`.`)
      ],
      gates: []
    };
  }
  const auc = file.data.auc ?? {};
  const fullCore = auc.fullCore;
  const occurrenceOnly = auc.occurrenceOnly;
  const habitatWithinForest = auc.habitatWithinForest;
  const forestMask = auc.forestMask;
  const delta = fullCore != null && occurrenceOnly != null ? fullCore - occurrenceOnly : null;
  const habitatUseful = habitatWithinForest != null && habitatWithinForest >= 0.55;
  const additive = delta != null && delta >= 0.02;

  const lines = [
    decision(
      'Full-pipeline spatial audit',
      habitatUseful || additive ? 'habitat kan ha signal' : 'habitat ikke bevist',
      `fullCore=${fixed(fullCore)}, occurrenceOnly=${fixed(occurrenceOnly)}, delta=${fixed(delta)}, habitatWithinForest=${fixed(habitatWithinForest)}, forestMask=${fixed(forestMask)}.`
    )
  ];

  for (const [region, result] of Object.entries(file.data.byRegion ?? {})) {
    lines.push(
      `  - Region ${region}: fullCore=${fixed(result.auc?.fullCore)}, habitatWithinForest=${fixed(result.auc?.habitatWithinForest)}, occurrenceOnly=${fixed(result.auc?.occurrenceOnly)}, forestMask=${fixed(result.auc?.forestMask)}.`
    );
  }

  return {
    lines,
    gates: [
      { key: 'habitatWithinForest', pass: habitatUseful, value: habitatWithinForest, need: '>=0.55' },
      { key: 'fullCoreDelta', pass: additive, value: delta, need: '>=+0.02 over occurrenceOnly' }
    ]
  };
}

function summarizeOccurrenceWeather(file) {
  if (!file.ok) {
    return {
      lines: [
        decision('Historical weather feature cache', 'mangler data', `Kjør \`npm run features:occurrence-weather -- --json > ${file.path}\`.`)
      ],
      gates: []
    };
  }
  const ready = Number(file.data.featuresReady ?? 0);
  const attempted = Number(file.data.attempted ?? 0);
  const errorCount = Number(file.data.skippedErrors?.count ?? 0);
  const usable = ready >= 500;
  return {
    lines: [
      decision(
        'Historical weather feature cache',
        usable ? 'klar for værpreferanser' : 'fortsett batch-fylling',
        `featuresReady=${ready}, attempted=${attempted}, errors=${errorCount}, byRegion=${JSON.stringify(file.data.byRegion ?? {})}.`
      )
    ],
    gates: [{ key: 'weatherFeatureRows', pass: usable, value: ready, need: '>=500 for first useful weather preference pass' }]
  };
}

function summarizeWeatherPreferences(file) {
  if (!file.ok) {
    return {
      lines: [
        decision('Weather preference fit', 'mangler data', `Kjør \`npm run fit:weather-preferences -- --json > ${file.path}\`.`)
      ],
      gates: []
    };
  }
  const groups = file.data.groups ?? [];
  const useful = groups
    .map((g) => ({
      label: g.label,
      n: g.n,
      temp: g.targetGroup?.tempWindowAuc,
      rain: g.targetGroup?.rain3dAuc,
      humidity: g.targetGroup?.humidityAuc,
      soil: g.targetGroup?.soilMoistureAuc
    }))
    .filter((g) => [g.temp, g.rain, g.humidity, g.soil].some((v) => v != null && v >= 0.55))
    .slice(0, 8);

  const lines = [
    decision(
      'Weather preference fit',
      useful.length ? 'noen værledd har signal' : 'ingen tydelig vær-AUC ennå',
      `rows=${file.data.rows}, groups=${groups.length}, usefulGroups=${useful.length}.`
    )
  ];
  for (const g of useful) {
    lines.push(`  - ${g.label}: n=${g.n}, temp=${fixed(g.temp)}, rain=${fixed(g.rain)}, humidity=${fixed(g.humidity)}, soil=${fixed(g.soil)}.`);
  }
  return {
    lines,
    gates: [{ key: 'weatherPreferenceUsefulGroups', pass: useful.length > 0, value: useful.length, need: 'at least one feature AUC >=0.55' }]
  };
}

function renderReport(parts) {
  const lines = ['# Prediction Validation Report', '', `Generated: ${new Date().toISOString()}`, ''];
  lines.push('## Verdict');
  const allGates = parts.flatMap((p) => p.gates);
  const passed = allGates.filter((g) => g.pass).length;
  const total = allGates.length;
  lines.push(`Decision gates passed: ${passed}/${total}.`);
  lines.push('');
  if (total > 0) {
    for (const g of allGates) {
      lines.push(`- ${g.pass ? 'PASS' : 'WAIT'} ${g.key}: value=${fixed(g.value)}; need ${g.need}.`);
    }
  }
  lines.push('');
  lines.push('## Findings');
  for (const part of parts) {
    lines.push(...part.lines);
  }
  lines.push('');
  lines.push('## Next Actions');
  if (parts.some((p) => p.lines.some((line) => line.includes('mangler data')))) {
    lines.push('- Kjør manglende JSON-kommandoer i `docs/prediction-validation-runbook.md`.');
  }
  const gate = Object.fromEntries(allGates.map((g) => [g.key, g]));
  if (gate.spotFeedbackN && !gate.spotFeedbackN.pass) lines.push('- Samle mer `spot_feedback` før scorekalibrering wires.');
  if (gate.phenologyTemporalSplit && !gate.phenologyTemporalSplit.pass) lines.push('- Kjør fenologi med `SPLIT_MODE=year` før timing omtales som temporal validering.');
  if (gate.phenologyDelta && !gate.phenologyDelta.pass) lines.push('- Ikke forsterk timing-claims før empirisk fenologi slår måned-modellen i temporal split.');
  if (gate.fullCoreDelta && !gate.fullCoreDelta.pass && gate.habitatWithinForest && !gate.habitatWithinForest.pass) {
    lines.push('- Ikke bruk mer tid på håndtuning av habitatregler før SDM/accessibility-modell er vurdert.');
  }
  if (gate.weatherFeatureRows && !gate.weatherFeatureRows.pass) lines.push('- Fyll flere `occurrence_weather_features`-batcher før værpreferanser tolkes.');
  if (gate.weatherPreferenceUsefulGroups?.pass) lines.push('- Vurder målrettede endringer i `GENUS_PREFERENCES`, men bare for grupper med nok n og AUC-løft.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

const files = {
  spotFeedback: readJson(PATHS.spotFeedback),
  scoreCalibration: readJson(PATHS.scoreCalibration),
  phenology: readJson(PATHS.phenology),
  fullPipeline: readJson(PATHS.fullPipeline),
  occurrenceWeather: readJson(PATHS.occurrenceWeather),
  weatherPreferences: readJson(PATHS.weatherPreferences)
};

const parts = [
  summarizeSpotFeedback(files.spotFeedback),
  summarizeScoreCalibration(files.scoreCalibration),
  summarizePhenology(files.phenology),
  summarizeFullPipeline(files.fullPipeline),
  summarizeOccurrenceWeather(files.occurrenceWeather),
  summarizeWeatherPreferences(files.weatherPreferences)
];

const report = renderReport(parts);
if (process.env.OUT) {
  mkdirSync(dirname(process.env.OUT), { recursive: true });
  writeFileSync(process.env.OUT, report);
  console.log(`Wrote ${process.env.OUT}`);
} else {
  process.stdout.write(report);
}
