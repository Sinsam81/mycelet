import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { bearerSecretMatches } from '@/lib/security/secret-compare';
import { FINDING_IMAGE_BUCKET, findingImagePaths } from '@/lib/storage/finding-images';

/**
 * Rydder funn brukeren har slettet, når angrefristen er ute.
 *
 * Sletting fra appen er MYK (migrasjon 056): raden får `deleted_at`, forsvinner
 * overalt der funn vises, og kan angres. Denne jobben er den andre halvdelen —
 * uten den ville «slettede» funn ligget for alltid, og da er de ikke slettet.
 * GDPR art. 5(1)(e) er ikke oppfylt av at noe er usynlig.
 *
 * Rekkefølgen er bevisst: BILDET først, RADEN etterpå.
 *   • Feiler bildeslettingen, blir raden liggende, og neste kjøring prøver på
 *     nytt. Ingenting er tapt.
 *   • Motsatt rekkefølge ville gitt foreldreløse filer i Storage som ingen rad
 *     lenger peker på — og da finnes det ingen måte å finne dem igjen på.
 *
 * Sikret med CRON_SECRET, samme mønster som de andre /api/cron-rutene.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Angrefristen. MÅ holdes i takt med tre andre steder:
 *   • docs/retention-policy.md
 *   • personvernerklæringen (Personvern.retentionActiveDesc i nb + sv)
 *   • kommentaren på findings.deleted_at (migrasjon 056)
 * Endrer du tallet her, endre det der også — ellers lover vi noe annet enn vi
 * gjør.
 */
export const PURGE_AFTER_DAYS = 30;

/** Rader per kjøring. Jobben går daglig, så etterslep tas igjen av seg selv. */
const BATCH = 500;

interface PurgeRow {
  id: string;
  user_id: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
}

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);

  if (!bearerSecretMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Ikke autorisert' }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    log.error('purge_deleted_findings.no_service_role_key');
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY mangler' }, { status: 500 });
  }

  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from('findings')
    .select('id, user_id, image_url, thumbnail_url')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
    .limit(BATCH);

  if (error) {
    log.error('purge_deleted_findings.select_failed', { code: error.code, message: error.message });
    return NextResponse.json({ error: 'Kunne ikke lese slettede funn' }, { status: 500 });
  }

  const rows = (data ?? []) as PurgeRow[];
  if (rows.length === 0) {
    log.info('purge_deleted_findings.nothing_to_do', { cutoff });
    return NextResponse.json({ ok: true, purged: 0, imagesRemoved: 0, cutoff });
  }

  const ids = rows.map((row) => row.id);

  // ── Bildene ───────────────────────────────────────────────────────────────
  //
  // findingImagePaths avviser alt som ikke ligger i funn-eierens egen mappe i
  // finding-images — se filhodet der; URL-en i raden kom fra nettleseren og er
  // ikke til å stole på.
  //
  // I tillegg: en fil kan være delt av flere rader. Samme URL kan stå på to
  // funn hvis brukeren registrerte det samme funnet to ganger og slettet det
  // ene — nettopp det dobbelt-registreringstilfellet sletting finnes for.
  // Sletter vi filen da, mister det gjenværende funnet bildet sitt.
  const paths = new Set<string>();
  for (const row of rows) for (const path of findingImagePaths(row)) paths.add(path);

  // Slå opp én gang per bunt i stedet for én gang per fil: `in()` i
  // supabase-js siterer verdiene selv, så vi slipper å bygge filterstrenger for
  // hånd. Bunten deles opp fordi 500 URL-er i én spørrestreng blir for lang.
  const urlByPath = new Map(
    [...paths].map((path) => [
      path,
      admin.storage.from(FINDING_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
    ])
  );
  const purgeIds = new Set(ids);
  const stillInUse = new Set<string>();
  let referenceCheckFailed = false;

  const urls = [...urlByPath.values()];
  const URL_CHUNK = 100;
  for (let i = 0; i < urls.length; i += URL_CHUNK) {
    const chunk = urls.slice(i, i + URL_CHUNK);
    const [byImage, byThumb] = await Promise.all([
      admin.from('findings').select('id, image_url, thumbnail_url').in('image_url', chunk),
      admin.from('findings').select('id, image_url, thumbnail_url').in('thumbnail_url', chunk)
    ]);

    if (byImage.error || byThumb.error) {
      // Vet vi ikke om filene er i bruk, lar vi dem ligge. Et bilde for mye er
      // en opprydding til overs; et bilde for lite er et funn uten bilde.
      log.warn('purge_deleted_findings.reference_check_failed', {
        message: (byImage.error ?? byThumb.error)?.message
      });
      referenceCheckFailed = true;
      continue;
    }

    const referencing = [...(byImage.data ?? []), ...(byThumb.data ?? [])] as Array<{
      id: string;
      image_url: string | null;
      thumbnail_url: string | null;
    }>;
    for (const row of referencing) {
      // Radene vi selv er i ferd med å slette teller ikke som «i bruk».
      if (purgeIds.has(row.id)) continue;
      if (row.image_url) stillInUse.add(row.image_url);
      if (row.thumbnail_url) stillInUse.add(row.thumbnail_url);
    }
  }

  const safeToRemove = referenceCheckFailed
    ? []
    : [...urlByPath.entries()].filter(([, url]) => !stillInUse.has(url)).map(([path]) => path);

  let imagesRemoved = 0;
  if (safeToRemove.length > 0) {
    const { error: removeError } = await admin.storage
      .from(FINDING_IMAGE_BUCKET)
      .remove(safeToRemove);
    if (removeError) {
      // Radene blir liggende. Neste kjøring finner dem igjen.
      log.error('purge_deleted_findings.storage_remove_failed', removeError);
      return NextResponse.json({ error: 'Kunne ikke fjerne bildene' }, { status: 500 });
    }
    imagesRemoved = safeToRemove.length;
  }

  // ── Radene ────────────────────────────────────────────────────────────────
  //
  // Herfra er slettingen ekte. forum_posts.finding_id er ON DELETE SET NULL
  // (001:202), så et innlegg som viste til funnet overlever og mister bare
  // art-merket. reports.finding_id er ON DELETE CASCADE (001:301).
  const { error: deleteError } = await admin.from('findings').delete().in('id', ids);
  if (deleteError) {
    log.error('purge_deleted_findings.delete_failed', {
      code: deleteError.code,
      message: deleteError.message
    });
    return NextResponse.json({ error: 'Kunne ikke slette radene' }, { status: 500 });
  }

  log.warn('purge_deleted_findings.done', { purged: ids.length, imagesRemoved, cutoff });
  return NextResponse.json({ ok: true, purged: ids.length, imagesRemoved, cutoff });
}
