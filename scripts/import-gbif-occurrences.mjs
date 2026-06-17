// Import real Norwegian fungi occurrence records from GBIF into
// species_occurrences, matched to our mushroom_species by Latin name.
//
// Run: node --env-file=.env.local scripts/import-gbif-occurrences.mjs
//
// Idempotent: occurrences are upserted on gbif_key, so re-running refreshes
// without duplicates. GBIF is open data (no account needed for the search API).
//
// LEGAL: only CC0 and CC BY records are fetched (the `license` filter below).
// GBIF also hosts CC BY-NC datasets, which a commercial app cannot use — so
// they never enter the table. License + dataset key are stored per row
// (migration 016), and after a large successful import the script prunes rows
// without a license (anything no longer obtainable under a free license).
//
// QUALITY: by default the importer keeps only present human/specimen records
// with exact day-level dates, no GBIF geospatial issue flag, and coordinate
// uncertainty <= 1000 m. Bad dates poison phenology; vague coordinates poison
// habitat validation.

import { createClient } from '@supabase/supabase-js';

const HELP = new Set(['-h', '--help']);
const args = process.argv.slice(2);

if (args.some((a) => HELP.has(a))) {
  console.log(`Usage: node --env-file=.env.local scripts/import-gbif-occurrences.mjs [NO] [SE]

Environment:
  ONLY_MISSING=1                         Only import species with no current rows
  MAX_COORDINATE_UNCERTAINTY_M=1000      Drop rows above this coordinate uncertainty
  ALLOW_UNKNOWN_COORDINATE_UNCERTAINTY=1 Keep rows where GBIF lacks uncertainty
  GBIF_BASIS_OF_RECORD=HUMAN_OBSERVATION,PRESERVED_SPECIMEN

Quality filters:
  - hasCoordinate=true
  - hasGeospatialIssue=false
  - occurrenceStatus=PRESENT
  - license in CC0_1_0 / CC_BY_4_0
  - exact day-level observed_at
`);
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log('MISSING_ENV');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

const PER_SPECIES_CAP = 4000;
const PAGE = 300;
const GBIF_LICENSES = ['CC0_1_0', 'CC_BY_4_0'];
const DEFAULT_BASIS_OF_RECORD = ['HUMAN_OBSERVATION', 'PRESERVED_SPECIMEN'];
const ALLOWED_BASIS_OF_RECORD = parseList(process.env.GBIF_BASIS_OF_RECORD, DEFAULT_BASIS_OF_RECORD);
const MAX_COORDINATE_UNCERTAINTY_M = clampNumber(
  Number(process.env.MAX_COORDINATE_UNCERTAINTY_M || 1000),
  0,
  Number.MAX_SAFE_INTEGER
);
const ALLOW_UNKNOWN_COORDINATE_UNCERTAINTY = process.env.ALLOW_UNKNOWN_COORDINATE_UNCERTAINTY === '1';
// Countries to import. Pass as CLI args (e.g. `... import-gbif-occurrences.mjs SE`),
// or default to both Norway and Sweden.
const countryArgs = args.filter((a) => !a.startsWith('-'));
const COUNTRIES = countryArgs.length ? countryArgs : ['NO', 'SE'];

function parseList(value, fallback) {
  const parsed = String(value ?? '')
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

// Fetch JSON, throwing on a non-OK response with a couple of retries on the
// transient classes (429 + 5xx). Without this a GBIF backend outage (e.g. the
// 503 "Backend fetch failed" page) was silently parsed as zero occurrences,
// recording false "0 funn" for every species instead of failing loudly.
async function fetchJson(url) {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'mycelet.com/1.0 occurrence-import (support@mycelet.com)' } });
    if (res.ok) return res.json();
    lastStatus = res.status;
    if (res.status !== 429 && res.status < 500) throw new Error(`GBIF HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  throw new Error(`GBIF HTTP ${lastStatus} (after retries)`);
}

async function gbifMatch(latin) {
  const j = await fetchJson(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(latin)}`);
  return j && j.usageKey && j.matchType !== 'NONE' ? j.usageKey : null;
}

function ymd(year, month, day) {
  if (![year, month, day].every((v) => Number.isInteger(v))) return null;
  if (year < 1800 || year > new Date().getUTCFullYear()) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseObservedAt(r) {
  if (typeof r.eventDate === 'string') {
    const match = r.eventDate.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
    if (match) return ymd(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  return ymd(Number(r.year), Number(r.month), Number(r.day));
}

function emptySkipStats() {
  return {
    missingKey: 0,
    badCoordinates: 0,
    geospatialIssue: 0,
    notPresent: 0,
    disallowedBasisOfRecord: 0,
    impreciseDate: 0,
    unknownCoordinateUncertainty: 0,
    highCoordinateUncertainty: 0
  };
}

function mergeSkipStats(target, source) {
  for (const [key, value] of Object.entries(source)) target[key] = (target[key] ?? 0) + value;
}

function compactSkipStats(stats) {
  return Object.fromEntries(Object.entries(stats).filter(([, value]) => value > 0));
}

function formatSkipStats(stats) {
  const compact = compactSkipStats(stats);
  const total = Object.values(compact).reduce((sum, value) => sum + value, 0);
  if (!total) return '0 skippet';
  return `${total} skippet (${Object.entries(compact)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ')})`;
}

function gbifSearchUrl(taxonKey, country, offset) {
  const params = new URLSearchParams({
    taxonKey: String(taxonKey),
    country,
    hasCoordinate: 'true',
    hasGeospatialIssue: 'false',
    occurrenceStatus: 'PRESENT',
    limit: String(PAGE),
    offset: String(offset)
  });
  for (const license of GBIF_LICENSES) params.append('license', license);
  for (const basis of ALLOWED_BASIS_OF_RECORD) params.append('basisOfRecord', basis);
  return `https://api.gbif.org/v1/occurrence/search?${params.toString()}`;
}

function normalizeOccurrence(r, skipStats) {
  if (r.key == null) {
    skipStats.missingKey += 1;
    return null;
  }
  const latitude = Number(r.decimalLatitude);
  const longitude = Number(r.decimalLongitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    skipStats.badCoordinates += 1;
    return null;
  }
  if (r.hasGeospatialIssues === true) {
    skipStats.geospatialIssue += 1;
    return null;
  }
  if (r.occurrenceStatus && String(r.occurrenceStatus).toUpperCase() !== 'PRESENT') {
    skipStats.notPresent += 1;
    return null;
  }
  const basisOfRecord = String(r.basisOfRecord ?? '').toUpperCase();
  if (!ALLOWED_BASIS_OF_RECORD.includes(basisOfRecord)) {
    skipStats.disallowedBasisOfRecord += 1;
    return null;
  }
  const observedAt = parseObservedAt(r);
  if (!observedAt) {
    skipStats.impreciseDate += 1;
    return null;
  }
  const uncertaintyRaw = r.coordinateUncertaintyInMeters;
  if (uncertaintyRaw == null || uncertaintyRaw === '') {
    if (!ALLOW_UNKNOWN_COORDINATE_UNCERTAINTY) {
      skipStats.unknownCoordinateUncertainty += 1;
      return null;
    }
  } else {
    const uncertainty = Number(uncertaintyRaw);
    if (!Number.isFinite(uncertainty) || uncertainty > MAX_COORDINATE_UNCERTAINTY_M) {
      skipStats.highCoordinateUncertainty += 1;
      return null;
    }
  }
  return {
    gbif_key: r.key,
    latitude,
    longitude,
    observed_at: observedAt,
    license: r.license ?? null,
    dataset_key: r.datasetKey ?? null
  };
}

async function gbifOccurrences(taxonKey, country) {
  const out = [];
  const skipped = emptySkipStats();
  for (let offset = 0; offset < PER_SPECIES_CAP; offset += PAGE) {
    const j = await fetchJson(gbifSearchUrl(taxonKey, country, offset));
    const results = j.results ?? [];
    for (const r of results) {
      const normalized = normalizeOccurrence(r, skipped);
      if (normalized) out.push(normalized);
    }
    if (j.endOfRecords || results.length === 0) break;
  }
  return { occurrences: out, skipped };
}

// Guard: confirm the table exists (migration applied).
const probe = await admin.from('species_occurrences').select('id').limit(1);
if (probe.error) {
  console.log('TABLE_MISSING — kjør migrasjon 013 først.', probe.error.message);
  process.exit(1);
}

const { data: allSpecies, error: spErr } = await admin
  .from('mushroom_species')
  .select('id, latin_name, norwegian_name')
  .not('latin_name', 'is', null);
if (spErr) {
  console.log('SPECIES_ERR', spErr.message);
  process.exit(1);
}

// ONLY_MISSING=1 limits the run to species that currently have zero occurrence
// rows (e.g. freshly added catalog entries), so a backfill doesn't re-fetch the
// thousands of records already stored for established species. NOTE: this also
// skips the license-prune step, which is only meant to run after a full sweep.
const onlyMissing = process.env.ONLY_MISSING === '1';
let species = allSpecies;
if (onlyMissing) {
  const filtered = [];
  for (const sp of allSpecies) {
    const { count } = await admin
      .from('species_occurrences')
      .select('id', { count: 'exact', head: true })
      .eq('species_id', sp.id);
    if (!count) filtered.push(sp);
  }
  species = filtered;
}
console.log('Arter å hente:', species.length, onlyMissing ? '(kun arter uten funn fra før)' : '');
console.log(
  `GBIF-filtre: basis=${ALLOWED_BASIS_OF_RECORD.join(',')} | max koordinatusikkerhet=${MAX_COORDINATE_UNCERTAINTY_M}m | ukjent usikkerhet=${ALLOW_UNKNOWN_COORDINATE_UNCERTAINTY ? 'tillatt' : 'droppes'}`
);

let grandTotal = 0;
let upsertErrors = 0;
const grandSkipped = emptySkipStats();
for (const sp of species) {
  try {
    const taxonKey = await gbifMatch(sp.latin_name);
    if (!taxonKey) {
      console.log(`- ${sp.latin_name}: ingen GBIF-match`);
      continue;
    }
    for (const country of COUNTRIES) {
      const { occurrences: occ, skipped } = await gbifOccurrences(taxonKey, country);
      mergeSkipStats(grandSkipped, skipped);
      if (occ.length === 0) {
        console.log(`- ${sp.norwegian_name} [${country}]: 0 funn (${formatSkipStats(skipped)})`);
        continue;
      }
      const rows = occ.map((o) => ({ ...o, species_id: sp.id, source: 'gbif' }));
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        // Merge (not ignore) so re-runs backfill license/dataset on existing rows.
        const { error } = await admin
          .from('species_occurrences')
          .upsert(chunk, { onConflict: 'gbif_key' });
        if (error) {
          upsertErrors += 1;
          console.log(`  upsert-feil (${sp.latin_name} ${country}):`, error.message);
        }
      }
      grandTotal += rows.length;
      console.log(`✓ ${sp.norwegian_name} [${country}]: ${rows.length} funn (${formatSkipStats(skipped)})`);
    }
  } catch (e) {
    console.log(`! ${sp.latin_name}: ${e.message}`);
  }
}

// Prune rows that didn't get a license backfilled — they were imported before
// the license filter and are no longer obtainable under CC0/CC-BY, so we must
// not keep using them. Guarded: only after a clearly successful import, so a
// failed run can't wipe the table.
if (!onlyMissing && grandTotal >= 10000 && upsertErrors === 0) {
  const { count: unlicensed } = await admin
    .from('species_occurrences')
    .select('id', { count: 'exact', head: true })
    .is('license', null);
  if (unlicensed && unlicensed > 0) {
    const { error: delErr } = await admin.from('species_occurrences').delete().is('license', null);
    console.log(delErr ? `PRUNE-FEIL: ${delErr.message}` : `Slettet ${unlicensed} rader uten fri lisens.`);
  } else {
    console.log('Ingen ulisensierte rader å slette.');
  }
} else {
  console.log(`Hoppet over sletting (kun ${grandTotal} hentet — for lite til å være en full kjøring).`);
}

const { count } = await admin.from('species_occurrences').select('id', { count: 'exact', head: true });
console.log(`\nFERDIG. Hentet ~${grandTotal} funn. Totalt i tabellen nå: ${count}`);
console.log(`GBIF-rader droppet av lokale kvalitetsfiltre: ${formatSkipStats(grandSkipped)}`);
