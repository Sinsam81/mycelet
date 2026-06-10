// One-off applier for migration 017 (species expansion 36 -> 72).
// There is no psql / Supabase CLI / DB password available locally, only the
// service-role key (PostgREST). To avoid hand-transcribing safety-critical
// edibility/toxin/symptom text, this reads the EXACT byte values straight out
// of supabase/migrations/017_expand_species_catalog.sql and replays them via
// the data API with the same idempotent semantics as the SQL:
//   - mushroom_species : upsert on latin_name
//   - species_photos   : insert one primary photo, guarded (skip if any exists)
//   - look_alikes      : upsert on (species_id, look_alike_id)
//
// Run: node --env-file=.env.local scripts/apply-migration-017.mjs
// Idempotent: safe to re-run.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('MISSING_ENV'); process.exit(1); }
const admin = createClient(url, key, { auth: { persistSession: false } });

const sql = readFileSync(new URL('../supabase/migrations/017_expand_species_catalog.sql', import.meta.url), 'utf8');

// --- tiny faithful SQL-literal parser (single-quote strings with '' escape,
//     ARRAY[...] literals, NULL, integers). Reads bytes verbatim. ---
function stripLineComments(t) {
  return t.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
}
function extractGroups(text) {
  const groups = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    while (i < n && text[i] !== '(') i++;
    if (i >= n) break;
    let depth = 0, inStr = false, buf = '', j = i;
    for (; j < n; j++) {
      const c = text[j];
      if (inStr) {
        if (c === "'") { if (text[j + 1] === "'") { buf += "''"; j++; continue; } inStr = false; buf += c; continue; }
        buf += c; continue;
      }
      if (c === "'") { inStr = true; buf += c; continue; }
      if (c === '(') { depth++; buf += c; continue; }
      if (c === ')') { depth--; buf += c; if (depth === 0) { j++; break; } continue; }
      buf += c;
    }
    groups.push(buf.slice(1, -1)); // strip outer parens
    i = j;
  }
  return groups;
}
function splitFields(inner) {
  const fields = [];
  let buf = '', depthB = 0, inStr = false;
  for (let j = 0; j < inner.length; j++) {
    const c = inner[j];
    if (inStr) {
      if (c === "'") { if (inner[j + 1] === "'") { buf += "''"; j++; continue; } inStr = false; buf += c; continue; }
      buf += c; continue;
    }
    if (c === "'") { inStr = true; buf += c; continue; }
    if (c === '[') { depthB++; buf += c; continue; }
    if (c === ']') { depthB--; buf += c; continue; }
    if (c === ',' && depthB === 0) { fields.push(buf.trim()); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim().length) fields.push(buf.trim());
  return fields;
}
function coerce(f) {
  if (/^NULL$/i.test(f)) return null;
  if (/^ARRAY\[/i.test(f)) {
    const inner = f.slice(f.indexOf('[') + 1, f.lastIndexOf(']'));
    if (!inner.trim()) return [];
    return splitFields(inner).map(coerce);
  }
  if (f.startsWith("'")) return f.slice(1, -1).replace(/''/g, "'");
  return Number(f);
}

// --- slice out the three VALUES regions ---
function between(s, startMarker, endMarker, fromIdx = 0) {
  const a = s.indexOf(startMarker, fromIdx);
  const b = s.indexOf(endMarker, a + startMarker.length);
  return s.slice(a + startMarker.length, b);
}

const SPECIES_COLS = [
  'norwegian_name', 'latin_name', 'english_name', 'family', 'genus', 'description',
  'edibility', 'edibility_notes', 'toxin_info', 'symptoms',
  'habitat', 'substrate', 'mycorrhizal_partners',
  'season_start', 'season_end', 'peak_season_start', 'peak_season_end',
  'regions', 'commonality', 'data_source', 'primary_image_url'
];

const speciesRegion = between(sql, ') VALUES', 'ON CONFLICT (latin_name)');
const speciesRows = extractGroups(stripLineComments(speciesRegion)).map((g) => {
  const f = splitFields(g);
  if (f.length !== SPECIES_COLS.length) {
    throw new Error(`Species row has ${f.length} fields, expected ${SPECIES_COLS.length}: ${g.slice(0, 80)}`);
  }
  const obj = {};
  SPECIES_COLS.forEach((c, idx) => { obj[c] = coerce(f[idx]); });
  return obj;
});

const laRegion = between(sql, 'VALUES', ') AS rel(', sql.indexOf('INSERT INTO look_alikes'));
const laRows = extractGroups(stripLineComments(laRegion)).map((g) => {
  const f = splitFields(g);
  if (f.length !== 5) throw new Error(`look_alike row has ${f.length} fields, expected 5: ${g.slice(0, 80)}`);
  return { species_no: coerce(f[0]), la_latin: coerce(f[1]), sim: coerce(f[2]), diff: coerce(f[3]), lvl: coerce(f[4]) };
});

// --- sanity on the parse before writing anything ---
const byEdi = speciesRows.reduce((m, r) => ((m[r.edibility] = (m[r.edibility] || 0) + 1), m), {});
console.log('Parsed species:', speciesRows.length, '| edibility split:', JSON.stringify(byEdi));
console.log('Parsed look-alikes:', laRows.length);
const expect = { species: 36, deadly: 4, toxic: 7, conditionally_edible: 2, inedible: 2, edible: 21, la: 11 };
const ok =
  speciesRows.length === expect.species &&
  byEdi.deadly === expect.deadly && byEdi.toxic === expect.toxic &&
  byEdi.conditionally_edible === expect.conditionally_edible &&
  byEdi.inedible === expect.inedible && byEdi.edible === expect.edible &&
  laRows.length === expect.la;
if (!ok) { console.error('PARSE SANITY FAILED — aborting before any write.'); process.exit(1); }
// spot-check a deadly row text round-trips intact
const dc = speciesRows.find((r) => r.latin_name === 'Amanita phalloides');
if (dc.edibility !== 'deadly' || !/amanitin/i.test(dc.toxin_info) || !dc.symptoms.includes('22 59 13 00')) {
  console.error('SPOT-CHECK FAILED on Amanita phalloides — aborting.'); process.exit(1);
}
console.log('Parse sanity OK. Writing to live DB...\n');

// --- 1. species upsert ---
const { data: upData, error: upErr } = await admin
  .from('mushroom_species')
  .upsert(speciesRows, { onConflict: 'latin_name' })
  .select('id, latin_name, norwegian_name, edibility, primary_image_url');
if (upErr) { console.error('SPECIES UPSERT FAILED:', upErr.message); process.exit(1); }
console.log('Species upserted:', upData.length);
const idByLatin = new Map(upData.map((r) => [r.latin_name, r.id]));

// --- 2. species_photos (guarded: skip species that already have a photo) ---
const latins = speciesRows.map((r) => r.latin_name);
const { data: existingPhotos } = await admin
  .from('species_photos').select('species_id').in('species_id', [...idByLatin.values()]);
const havePhoto = new Set((existingPhotos || []).map((p) => p.species_id));
const photoRows = upData
  .filter((r) => r.primary_image_url && !havePhoto.has(r.id))
  .map((r) => ({ species_id: r.id, image_url: r.primary_image_url, is_primary: true, photo_type: 'general', license: 'Wikimedia Commons' }));
if (photoRows.length) {
  const { error: pErr } = await admin.from('species_photos').insert(photoRows);
  if (pErr) { console.error('PHOTO INSERT FAILED:', pErr.message); process.exit(1); }
}
console.log('Primary photos inserted:', photoRows.length, '(skipped, already had one:', upData.length - photoRows.length, ')');

// --- 3. look_alikes (resolve ids by name, upsert) ---
// species side joins by norwegian_name; look-alike side joins by latin_name.
const { data: allSpecies } = await admin.from('mushroom_species').select('id, norwegian_name, latin_name');
const idByNo = new Map(allSpecies.map((r) => [r.norwegian_name, r.id]));
const idByLat = new Map(allSpecies.map((r) => [r.latin_name, r.id]));
const laInsert = [];
const laSkipped = [];
for (const r of laRows) {
  const sid = idByNo.get(r.species_no);
  const lid = idByLat.get(r.la_latin);
  if (!sid || !lid) { laSkipped.push(`${r.species_no} -> ${r.la_latin} (${!sid ? 'species' : 'lookalike'} missing)`); continue; }
  laInsert.push({ species_id: sid, look_alike_id: lid, similarity_description: r.sim, difference_description: r.diff, danger_level: r.lvl });
}
const { error: laErr } = await admin.from('look_alikes').upsert(laInsert, { onConflict: 'species_id,look_alike_id' });
if (laErr) { console.error('LOOK_ALIKE UPSERT FAILED:', laErr.message); process.exit(1); }
console.log('Look-alikes upserted:', laInsert.length, laSkipped.length ? `| SKIPPED: ${laSkipped.join('; ')}` : '| none skipped');

// --- 4. readback verification ---
const { count: total } = await admin.from('mushroom_species').select('*', { count: 'exact', head: true });
console.log('\n=== READBACK ===');
console.log('Total species now:', total, total === 72 ? 'OK' : 'EXPECTED 72');
const { data: check } = await admin.from('mushroom_species')
  .select('latin_name, edibility').in('latin_name', latins);
let mism = 0;
for (const r of speciesRows) {
  const got = check.find((c) => c.latin_name === r.latin_name);
  if (!got || got.edibility !== r.edibility) { mism++; console.log('  MISMATCH', r.latin_name, '->', got?.edibility); }
}
console.log('Edibility round-trip mismatches:', mism, mism === 0 ? 'OK' : 'CHECK');
console.log(mism === 0 && total === 72 ? '\nMIGRATION 017 APPLIED SUCCESSFULLY.' : '\nMIGRATION 017 COMPLETED WITH WARNINGS — review above.');
