import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { bearerSecretMatches } from '@/lib/security/secret-compare';
import { IDENTIFICATION_RETENTION_DAYS, IDENTIFY_HISTORY_BUCKET } from '@/lib/identifications/config';

export const maxDuration = 300;

/**
 * Retensjon på identifiseringshistorikken (GDPR art. 5(1)(e)).
 *
 * Historikken er et MELLOMLAGER, ikke et arkiv: det brukeren vil beholde,
 * lagrer de som funn, og funn beholdes så lenge kontoen finnes. Alt eldre enn
 * IDENTIFICATION_RETENTION_DAYS ryddes her — rad OG bilde.
 *
 * REKKEFØLGEN ER DEN SAMME SOM I DELETE-RUTA, og av samme grunn: bildene først,
 * radene etterpå. Sletter vi radene først og filslettingen feiler, blir bildene
 * liggende i Storage uten at noe peker på dem — usynlig for brukeren, usynlig
 * for denne jobben ved neste kjøring (den skanner rader), og fortsatt lagret
 * hos oss etter at oppbevaringstiden er ute. Motsatt vei er verste utfall at
 * radene står til neste natt.
 *
 * Kjører også et lite ryddesteg på ai_identifications, kvotetelleren:
 * migrasjon 020 sier selv at bare de siste 24 timene noen gang leses. Vi lar
 * det stå noen dager for feilsøking, og sletter resten. Gratis reduksjon av
 * GDPR-flaten mens vi likevel er inne.
 */

/** Kvotetelleren leses kun 24 timer tilbake. Marginen er for feilsøking. */
const QUOTA_COUNTER_RETENTION_DAYS = 7;

/** Én runde med sletting. Taket hindrer at en enkelt kjøring går i evig løkke. */
const BATCH = 500;
const MAX_ROUNDS = 40;

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);

  if (!bearerSecretMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Ikke autorisert' }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    log.error('purge_identifications.no_service_role_key');
    return NextResponse.json({ error: 'Mangler tjenestenøkkel' }, { status: 500 });
  }

  const cutoff = new Date(Date.now() - IDENTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let slettedeRader = 0;
  let slettedeBilder = 0;
  const feil: string[] = [];

  for (let runde = 0; runde < MAX_ROUNDS; runde += 1) {
    const { data, error } = await admin
      .from('identifications')
      .select('id, image_path')
      .lt('created_at', cutoff)
      .limit(BATCH);
    if (error) {
      feil.push(`lesing: ${error.message}`);
      break;
    }
    const rader = (data ?? []) as Array<{ id: string; image_path: string | null }>;
    if (rader.length === 0) break;

    const stier = rader.map((r) => r.image_path).filter((p): p is string => !!p);
    if (stier.length > 0) {
      const { error: storageError } = await admin.storage.from(IDENTIFY_HISTORY_BUCKET).remove(stier);
      if (storageError) {
        // Avbryt runden. Å slette radene nå ville gjort bildene uoppdagbare
        // for neste kjøring — se filhodet.
        feil.push(`bilder: ${storageError.message}`);
        break;
      }
      slettedeBilder += stier.length;
    }

    const { error: deleteError } = await admin
      .from('identifications')
      .delete()
      .in(
        'id',
        rader.map((r) => r.id)
      );
    if (deleteError) {
      feil.push(`rader: ${deleteError.message}`);
      break;
    }
    slettedeRader += rader.length;

    if (rader.length < BATCH) break;
  }

  // Kvotetelleren. Egen sletting, ikke koblet til historikken: de to tabellene
  // er med vilje frakoblet (migrasjon 055).
  const quotaCutoff = new Date(
    Date.now() - QUOTA_COUNTER_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const { error: quotaError, count: quotaDeleted } = await admin
    .from('ai_identifications')
    .delete({ count: 'exact' })
    .lt('created_at', quotaCutoff);
  if (quotaError) feil.push(`kvoteteller: ${quotaError.message}`);

  const resultat = {
    cutoff,
    slettedeRader,
    slettedeBilder,
    slettedeKvoterader: quotaDeleted ?? 0,
    feil
  };

  if (feil.length > 0) {
    log.error('purge_identifications.partial', undefined, resultat);
    // 500 slik at Vercel markerer kjøringen som feilet og den blir synlig.
    return NextResponse.json(resultat, { status: 500 });
  }

  log.info('purge_identifications.done', resultat);
  return NextResponse.json(resultat);
}
