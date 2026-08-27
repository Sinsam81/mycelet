// Engangs-backfill: ekte fotograf + lisens på artsbildene fra Wikimedia Commons.
//
// Problemet: alle 72 artsbildene er Commons-filer, men ble seedet (migrasjon
// 012 og 017) med `license = 'Wikimedia Commons'` — som er en KILDE, ikke en
// lisens — og uten fotograf. CC BY og CC BY-SA krever navngiving av fotograf
// OG lisens per bilde, med lenke til kilden. Uten dette bruker appen 72
// bilder uten å oppfylle vilkårene for noen av dem.
//
// Hva skriptet gjør, per bilde:
//   1. utleder Commons-filnavnet fra thumb-URL-en (se scripts/lib/commons-credit.mjs),
//   2. slår opp extmetadata på Commons' API (Artist, LicenseShortName, filside),
//   3. skriver photographer / license / source_url i species_photos, OG
//      primary_image_* på mushroom_species for samme bilde-URL.
//
// Begge tabellene fordi `mushroom_species.primary_image_url` er en bevisst
// denormalisering: artslista, forsiden, kalenderen, AI-resultatet og
// forvekslingssjekken leser den direkte uten å røre species_photos. Samme
// mønster som seedingen selv (se CLAUDE.md).
//
// KJØR MIGRASJON 055 FØRST — skriptet nekter å starte uten kolonnene.
//
// Tørrkjøring (skriver INGENTING, standard):
//   node --env-file=.env.local scripts/backfill-photo-credits.mjs
// Skriv til basen (treffer PRODUKSJON — det finnes ingen staging):
//   node --env-file=.env.local scripts/backfill-photo-credits.mjs --apply
//
// Flagg:
//   --apply    skriv til basen (uten dette: bare rapport)
//   --force    overskriv også krediteringer som IKKE ser ut som plassholdere
//   --limit N  behandle bare de N første bildene (til prøvekjøring)
//
// Idempotent: trygt å kjøre på nytt. Rader som allerede har riktig verdi
// hoppes over, og en ekte, manuelt satt kreditering røres ikke uten --force.

import { createClient } from '@supabase/supabase-js';
import {
  buildPatch,
  commonsFileNameFromUrl,
  commonsTitle,
  creditFromExtMetadata
} from './lib/commons-credit.mjs';

// --- oppsett ------------------------------------------------------------

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  if (i === -1) return Infinity;
  const n = Number(args[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
})();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    'MANGLER MILJØVARIABLER: NEXT_PUBLIC_SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Kjør med:  node --env-file=.env.local scripts/backfill-photo-credits.mjs'
  );
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

// Wikimedias API-retningslinjer krever en identifiserende User-Agent med en
// kontaktvei. Uten den blir anonyme kall strupet eller blokkert.
const USER_AGENT = 'MyceletPhotoCreditBackfill/1.0 (https://mycelet.com; post@mycelet.com)';
const API = 'https://commons.wikimedia.org/w/api.php';
// Anonyme kall tar maks 50 titler per spørring.
const BATCH_SIZE = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Commons-oppslag ----------------------------------------------------

/**
 * Henter extmetadata for en bunke filnavn. Returnerer Map<filnavn, {
 * photographer, license, sourceUrl }>. Filer som ikke finnes utelates —
 * kalleren rapporterer dem som uløste.
 */
async function fetchCreditsForBatch(fileNames) {
  const titles = fileNames.map(commonsTitle);
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'imageinfo',
    // `user` = opplasteren. Brukes ikke som fotograf (det ville vært en
    // gjetning), men rapporteres for de bildene Commons ikke har forfatter
    // på, så de kan krediteres for hånd.
    iiprop: 'extmetadata|url|user',
    iiextmetadatafilter: 'Artist|LicenseShortName|UsageTerms|License|AttributionRequired',
    redirects: '1',
    maxlag: '5',
    titles: titles.join('|')
  });

  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Commons API svarte ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  if (body.error) {
    throw new Error(`Commons API-feil: ${body.error.code} — ${body.error.info}`);
  }

  // MediaWiki normaliserer titler (understrek → mellomrom, stor forbokstav)
  // og følger fil-omdirigeringer ved omdøping. Svaret er nøklet på den
  // ENDELIGE tittelen, så kjeden må følges tilbake til det vi spurte om —
  // ellers ser en omdøpt fil ut som «finnes ikke».
  const step = new Map();
  for (const { from, to } of body.query?.normalized ?? []) step.set(from, to);
  for (const { from, to } of body.query?.redirects ?? []) step.set(from, to);

  const pageByTitle = new Map();
  for (const page of body.query?.pages ?? []) pageByTitle.set(page.title, page);

  const out = new Map();
  for (let i = 0; i < fileNames.length; i++) {
    let title = titles[i];
    // Taket hindrer evig løkke om Commons skulle svare med en syklisk kjede.
    for (let hop = 0; hop < 5 && step.has(title); hop++) title = step.get(title);

    const page = pageByTitle.get(title);
    const info = page?.imageinfo?.[0];
    if (!page || page.missing || !info) continue;

    const { photographer, license, attributionRequired } = creditFromExtMetadata(info.extmetadata);
    out.set(fileNames[i], {
      photographer,
      license,
      attributionRequired,
      uploader: info.user ?? null,
      sourceUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`
    });
  }
  return out;
}

// --- hjelpere -----------------------------------------------------------

function truncate(value, max = 60) {
  if (value == null) return '—';
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

// --- hovedløp -----------------------------------------------------------

async function main() {
  console.log(APPLY ? '=== SKRIVER TIL BASEN (--apply) ===' : '=== TØRRKJØRING — ingenting skrives ===');
  if (FORCE) console.log('--force: overskriver også krediteringer som ikke er plassholdere.');

  // 1. Les begge tabellene. Feiler selecten på de nye kolonnene, er migrasjon
  //    055 ikke kjørt — og det er den eneste realistiske grunnen, så si det
  //    rett ut i stedet for å la PostgREST-koden 42703 stå alene.
  const [{ data: photos, error: photoErr }, { data: species, error: speciesErr }] = await Promise.all([
    admin
      .from('species_photos')
      .select('id,species_id,image_url,photographer,license,source_url')
      .order('species_id', { ascending: true }),
    admin
      .from('mushroom_species')
      .select(
        'id,latin_name,primary_image_url,primary_image_photographer,primary_image_license,primary_image_source_url'
      )
      .not('primary_image_url', 'is', null)
      .order('id', { ascending: true })
  ]);

  for (const err of [photoErr, speciesErr]) {
    if (!err) continue;
    if (err.code === '42703' || /column .* does not exist/i.test(err.message ?? '')) {
      console.error(
        'Kolonnene mangler. Kjør supabase/migrations/055_bildekreditering.sql i\n' +
          'Supabase SQL Editor først, så dette skriptet.\n\nDetaljer: ' +
          err.message
      );
      process.exit(1);
    }
    console.error('Databasefeil:', err.message);
    process.exit(1);
  }

  const photoRows = (photos ?? []).slice(0, LIMIT);
  const speciesRows = species ?? [];
  const latinById = new Map(speciesRows.map((s) => [s.id, s.latin_name]));

  // 2. Samle alle Commons-filnavn fra BEGGE tabellene. Samme fil brukes typisk
  //    begge steder, så oppslaget gjøres én gang per fil.
  const fileByUrl = new Map();
  const unresolved = [];
  for (const [label, imageUrl] of [
    ...photoRows.map((p) => [`species_photos#${p.id} (art ${latinById.get(p.species_id) ?? p.species_id})`, p.image_url]),
    ...speciesRows.map((s) => [`mushroom_species#${s.id} (${s.latin_name})`, s.primary_image_url])
  ]) {
    if (!imageUrl || fileByUrl.has(imageUrl)) continue;
    const fileName = commonsFileNameFromUrl(imageUrl);
    if (fileName) fileByUrl.set(imageUrl, fileName);
    else unresolved.push({ label, imageUrl });
  }

  const uniqueFiles = [...new Set(fileByUrl.values())];
  console.log(
    `\n${photoRows.length} rader i species_photos, ${speciesRows.length} arter med primærbilde ` +
      `→ ${uniqueFiles.length} unike Commons-filer å slå opp.`
  );
  if (unresolved.length > 0) {
    console.log(`${unresolved.length} bilde-URL(er) er ikke Commons-filer og hoppes over (listes til slutt).`);
  }

  // 3. Slå opp på Commons.
  const creditByFile = new Map();
  for (let i = 0; i < uniqueFiles.length; i += BATCH_SIZE) {
    const batch = uniqueFiles.slice(i, i + BATCH_SIZE);
    process.stdout.write(`  Commons-oppslag ${i + 1}–${i + batch.length} av ${uniqueFiles.length} … `);
    const credits = await fetchCreditsForBatch(batch);
    for (const [file, credit] of credits) creditByFile.set(file, credit);
    console.log(`${credits.size}/${batch.length} funnet`);
    if (i + BATCH_SIZE < uniqueFiles.length) await sleep(250);
  }

  const missingOnCommons = uniqueFiles.filter((f) => !creditByFile.has(f));

  // 4. Regn ut endringene og vis dem FØR noe skrives.
  const photoPatches = [];
  for (const row of photoRows) {
    const file = row.image_url ? fileByUrl.get(row.image_url) : null;
    const credit = file ? creditByFile.get(file) : null;
    if (!credit) continue;
    const patch = buildPatch(
      row,
      credit,
      { photographer: 'photographer', license: 'license', sourceUrl: 'source_url' },
      FORCE
    );
    if (patch) photoPatches.push({ id: row.id, speciesId: row.species_id, file, credit, patch });
  }

  const speciesPatches = [];
  for (const row of speciesRows) {
    const file = row.primary_image_url ? fileByUrl.get(row.primary_image_url) : null;
    const credit = file ? creditByFile.get(file) : null;
    if (!credit) continue;
    const patch = buildPatch(
      row,
      credit,
      {
        photographer: 'primary_image_photographer',
        license: 'primary_image_license',
        sourceUrl: 'primary_image_source_url'
      },
      FORCE
    );
    if (patch) speciesPatches.push({ id: row.id, latin: row.latin_name, file, credit, patch });
  }

  console.log('\n--- Krediteringer hentet fra Commons ---');
  console.log(`${'ART'.padEnd(30)} ${'FOTOGRAF'.padEnd(38)} LISENS`);
  for (const p of photoPatches) {
    const art = truncate(latinById.get(p.speciesId) ?? String(p.speciesId), 29);
    console.log(`${art.padEnd(30)} ${truncate(p.credit.photographer, 37).padEnd(38)} ${p.credit.license ?? '—'}`);
  }

  console.log('\n--- Oppsummering ---');
  console.log(`species_photos   : ${photoPatches.length} rad(er) endres av ${photoRows.length}`);
  console.log(`mushroom_species : ${speciesPatches.length} rad(er) endres av ${speciesRows.length}`);

  if (missingOnCommons.length > 0) {
    console.log(`\n⚠️  ${missingOnCommons.length} fil(er) ble ikke funnet på Commons — må krediteres for hånd:`);
    for (const f of missingOnCommons) console.log(`   · ${f}`);
  }
  // Den viktigste advarselen: Commons sier selv at lisensen KREVER
  // navngiving, men har ingen maskinlesbar forfatter. Da er bildet i bruk
  // uten at vilkårene er oppfylt, og NULL i basen skjuler det ikke — det er
  // nettopp derfor det står her, med opplasteren og filsiden så det kan
  // krediteres for hånd (eller bildet byttes ut).
  const attributionGaps = uniqueFiles
    .map((f) => [f, creditByFile.get(f)])
    .filter(([, c]) => c && c.attributionRequired && !c.photographer);
  if (attributionGaps.length > 0) {
    console.log(
      `\n⛔ ${attributionGaps.length} fil(er) KREVER navngiving, men Commons har ingen forfatter på dem.\n` +
        '   Krediter for hånd (opplasteren er ofte fotografen) eller bytt bilde:'
    );
    for (const [f, c] of attributionGaps) {
      console.log(`   · ${f}\n     opplaster: ${c.uploader ?? 'ukjent'}   ${c.sourceUrl}`);
    }
  }

  const noLicense = uniqueFiles.filter((f) => creditByFile.get(f) && !creditByFile.get(f).license);
  if (noLicense.length > 0) {
    console.log(`\n⚠️  ${noLicense.length} fil(er) mangler lisensfelt hos Commons — sjekk filsiden manuelt:`);
    for (const f of noLicense) console.log(`   · ${f}   ${creditByFile.get(f).sourceUrl}`);
  }
  if (unresolved.length > 0) {
    console.log(`\n⚠️  ${unresolved.length} bilde-URL(er) er ikke Commons-filer:`);
    for (const u of unresolved) console.log(`   · ${u.label}: ${u.imageUrl}`);
  }

  // 5. Skriv.
  if (!APPLY) {
    console.log('\nTørrkjøring ferdig. Kjør på nytt med --apply for å skrive til basen.');
    return;
  }

  let written = 0;
  let failed = 0;
  for (const p of photoPatches) {
    const { error } = await admin.from('species_photos').update(p.patch).eq('id', p.id);
    if (error) {
      failed++;
      console.error(`  FEIL species_photos#${p.id}: ${error.message}`);
    } else written++;
  }
  for (const p of speciesPatches) {
    const { error } = await admin.from('mushroom_species').update(p.patch).eq('id', p.id);
    if (error) {
      failed++;
      console.error(`  FEIL mushroom_species#${p.id} (${p.latin}): ${error.message}`);
    } else written++;
  }

  console.log(`\nSkrevet: ${written} rad(er). Feilet: ${failed}.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\nAvbrutt:', err.message);
  process.exit(1);
});
