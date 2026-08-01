#!/usr/bin/env node
/**
 * Gir gamle bildefiler en ny, ugjettbar sti — og oppdaterer databasen samtidig.
 *
 * BAKGRUNN
 * Opplastinger før 2026-08-01 fikk stien `${user_id}/${Date.now()}.jpg`. Begge
 * delene er gjettbare: user_id ligger åpent i public_findings for alle som har
 * lagt ut ett offentlig funn, og et tidsstempel er et tidspunkt. For en som vil
 * målrette én bruker er søkerommet lite nok. Nye opplastinger bruker allerede
 * en tilfeldig UUID (src/lib/storage/upload-path.ts); dette skriptet tar de
 * gamle.
 *
 * Se docs/beslutning-bildebotter.md for hvorfor bøttene forblir offentlige.
 *
 * BRUK
 *   node --env-file=.env.local scripts/rekey-storage-objects.mjs --dry-run
 *   node --env-file=.env.local scripts/rekey-storage-objects.mjs
 *
 * Krever SUPABASE_SERVICE_ROLE_KEY og NEXT_PUBLIC_SUPABASE_URL i miljøet.
 *
 * SIKKERHET I KJØRINGEN
 * - Rekkefølgen er: kopier ny → oppdater databasen → slett gammel. Brytes den
 *   midtveis, peker databasen enten på den gamle (uendret, fungerer) eller på
 *   den nye (kopiert, fungerer). Det finnes ikke et vindu der en rad peker på
 *   noe som ikke er der.
 * - Skriptet er idempotent: filer som allerede har UUID-navn hoppes over, så
 *   en avbrutt kjøring kan startes på nytt.
 * - Ingenting slettes i --dry-run.
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const DRY_RUN = process.argv.includes('--dry-run');
const BUCKETS = ['finding-images', 'forum-images'];
const PAGE = 1000;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Mangler NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Kjør med:  node --env-file=.env.local scripts/rekey-storage-objects.mjs --dry-run');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

/**
 * De to gamle formene:
 *   funn:  `${Date.now()}.jpg`                        — rent gjettbar
 *   forum: `${Date.now()}-${Math.random()...}.jpg`    — mindre utsatt, men
 *          Math.random() er ikke en kryptografisk kilde og skal ikke bære en
 *          tilgangskontroll.
 *
 * En UUID starter aldri slik: selv en UUID som begynner med siffer har fire
 * bindestreks-grupper, og mønsteret tillater bare én.
 */
const OLD_NAME = /^\d+(-[a-z0-9]+)?(\.\w+)?$/;

function newNameFor(oldName) {
  const dot = oldName.lastIndexOf('.');
  const ext = dot > 0 ? oldName.slice(dot + 1) : 'jpg';
  return `${randomUUID()}.${ext}`;
}

/** Alle brukermapper i en bøtte (list uten prefiks gir mappene). */
async function listUserFolders(bucket) {
  const folders = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.storage.from(bucket).list('', { limit: PAGE, offset });
    if (error) throw new Error(`list(${bucket}) feilet: ${error.message}`);
    if (!data?.length) break;
    // Mapper har id === null i Supabase sitt list-svar.
    folders.push(...data.filter((e) => e.id === null).map((e) => e.name));
    if (data.length < PAGE) break;
  }
  return folders;
}

async function listFiles(bucket, folder) {
  const files = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.storage.from(bucket).list(folder, { limit: PAGE, offset });
    if (error) throw new Error(`list(${bucket}/${folder}) feilet: ${error.message}`);
    if (!data?.length) break;
    files.push(...data.filter((e) => e.id !== null).map((e) => e.name));
    if (data.length < PAGE) break;
  }
  return files;
}

const publicUrlFor = (bucket, path) => db.storage.from(bucket).getPublicUrl(path).data.publicUrl;

/**
 * Oppdaterer hver rad som peker på den gamle URL-en.
 * Returnerer antall rader som ble endret, slik at en fil uten treff kan varsles
 * i stedet for å slettes i blinde.
 */
async function repointDatabase(oldUrl, newUrl) {
  let changed = 0;

  for (const column of ['image_url', 'thumbnail_url']) {
    const { data, error } = await db
      .from('findings')
      .update({ [column]: newUrl })
      .eq(column, oldUrl)
      .select('id');
    if (error) throw new Error(`findings.${column} feilet: ${error.message}`);
    changed += data?.length ?? 0;
  }

  // forum_posts.images er en JSONB-array med URL-er; den må leses, endres og
  // skrives tilbake. Vi henter bare radene som faktisk inneholder URL-en.
  const { data: posts, error: postErr } = await db
    .from('forum_posts')
    .select('id,images')
    .contains('images', JSON.stringify([oldUrl]));
  if (postErr) throw new Error(`forum_posts-søk feilet: ${postErr.message}`);

  for (const post of posts ?? []) {
    const next = (post.images ?? []).map((u) => (u === oldUrl ? newUrl : u));
    const { error } = await db.from('forum_posts').update({ images: next }).eq('id', post.id);
    if (error) throw new Error(`forum_posts.images (${post.id}) feilet: ${error.message}`);
    changed += 1;
  }

  return changed;
}

async function main() {
  console.log(DRY_RUN ? '── TØRRKJØRING — ingenting endres ──\n' : '── EKTE KJØRING ──\n');

  let scanned = 0;
  let rekeyed = 0;
  let skipped = 0;
  const orphans = [];

  for (const bucket of BUCKETS) {
    const folders = await listUserFolders(bucket);
    console.log(`${bucket}: ${folders.length} brukermapper`);

    for (const folder of folders) {
      for (const name of await listFiles(bucket, folder)) {
        scanned += 1;
        if (!OLD_NAME.test(name)) {
          skipped += 1;
          continue;
        }

        const oldPath = `${folder}/${name}`;
        const newPath = `${folder}/${newNameFor(name)}`;
        const oldUrl = publicUrlFor(bucket, oldPath);
        const newUrl = publicUrlFor(bucket, newPath);

        if (DRY_RUN) {
          console.log(`  ville flyttet  ${oldPath}  ->  ${newPath}`);
          rekeyed += 1;
          continue;
        }

        // 1) Kopier. Nå finnes filen begge steder.
        const { error: copyErr } = await db.storage.from(bucket).copy(oldPath, newPath);
        if (copyErr) throw new Error(`copy ${oldPath} feilet: ${copyErr.message}`);

        // 2) Pek databasen på den nye. Feiler dette, ligger den gamle igjen og
        //    alt fungerer fortsatt.
        const changed = await repointDatabase(oldUrl, newUrl);

        if (changed === 0) {
          // Ingen rad peker hit. Filen er foreldreløs — kanskje et avbrutt
          // opplastingsforsøk. Vi sletter den IKKE; det er ikke denne jobbens
          // oppgave å avgjøre om noe er søppel.
          orphans.push(`${bucket}/${oldPath}`);
          await db.storage.from(bucket).remove([newPath]);
          continue;
        }

        // 3) Først nå er den gamle stien trygg å fjerne.
        const { error: rmErr } = await db.storage.from(bucket).remove([oldPath]);
        if (rmErr) throw new Error(`remove ${oldPath} feilet: ${rmErr.message}`);

        rekeyed += 1;
        console.log(`  ${oldPath}  ->  ${newPath}  (${changed} rad(er))`);
      }
    }
  }

  console.log('');
  console.log(`skannet:            ${scanned}`);
  console.log(`${DRY_RUN ? 'ville fått ny sti:  ' : 'fikk ny sti:        '}${rekeyed}`);
  console.log(`allerede trygge:    ${skipped}`);
  if (orphans.length) {
    console.log('');
    console.log(`${orphans.length} fil(er) uten noen rad som peker på dem — rørt ikke:`);
    for (const o of orphans.slice(0, 20)) console.log(`  ${o}`);
    if (orphans.length > 20) console.log(`  ... +${orphans.length - 20} til`);
  }
}

main().catch((err) => {
  console.error('\nAVBRUTT:', err.message);
  console.error('Ingen rad kan peke på en fil som ikke finnes — se rekkefølgen øverst i fila.');
  console.error('Det er trygt å kjøre skriptet på nytt.');
  process.exit(1);
});
