import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { bearerSecretMatches } from '@/lib/security/secret-compare';
import { hentAapneRapporter } from '@/lib/rapport/aapne-rapporter';
import {
  RAPPORTMOTTAKER,
  byggKveldsvarselEpost,
  byggKveldsvarselIkkeMaalt,
  byggModereringsblokk
} from '@/lib/rapport/modereringsvarsel';
import { sendEpost } from '@/lib/email/send';

/**
 * Kveldsvarselet: venter det meldt innhold på en moderator?
 *
 * Dagsrapporten kl. 06:00 UTC var det eneste som sa fra om en ny melding i
 * forumet, så en melding som kom inn rett etter den, sto første gang i en
 * e-post nesten et døgn senere — like lenge som fristen på 24 timer den
 * skulle verne (Apple, retningslinje 1.2). Denne jobben går tolv timer etter
 * rapporten (vercel.json: 18:00 UTC) og halverer den ventetiden.
 *
 * STILLE NÅR INGENTING VENTER. Er ingen rapporter åpne, sendes det ingenting.
 * Det gjør stillhet til et svar — og derfor får en lesing som FEILER ikke se
 * ut som stillhet: da går det en kort e-post som sier «ikke målt».
 *
 * Bare lesing: én spørring, den samme som dagsrapporten og /admin bruker
 * (hentAapneRapporter — antall og alder, aldri hva som er meldt eller av
 * hvem). Ordene i e-posten er dagsrapportens egne (modereringsvarsel.ts).
 *
 * Sikret med CRON_SECRET, samme mønster som de andre /api/cron-rutene.
 */

export const runtime = 'nodejs';

/** Én spørring og én e-post. Taket er nettet under dem — ingen av de to har egen frist. */
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);

  if (!bearerSecretMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Ikke autorisert' }, { status: 401 });
  }

  const naa = new Date();
  // Kjører cronen to ganger samme time (det hender), går e-posten én gang.
  // Timen, ikke datoen: en kjøring for hånd tidligere på dagen skal ikke
  // kunne stilne kveldens varsel.
  const idempotensNokkel = `aapne-rapporter/${naa.toISOString().slice(0, 13)}`;

  let svar: Awaited<ReturnType<typeof hentAapneRapporter>>;
  try {
    svar = await hentAapneRapporter(createAdminClient());
  } catch (err) {
    // createAdminClient kaster uten tjenestenøkkel.
    svar = { ok: false, feil: err instanceof Error ? err.message : 'ukjent feil', mangler: false };
  }

  if (!svar.ok) {
    log.error('aapne_rapporter.lesing_feilet', { message: svar.feil, mangler: svar.mangler });
    const res = await sendEpost({
      til: RAPPORTMOTTAKER,
      ...byggKveldsvarselIkkeMaalt(naa),
      idempotensNokkel: `${idempotensNokkel}/ikke-maalt`
    });
    return NextResponse.json({ error: 'Kunne ikke lese åpne rapporter', sendt: res.ok }, { status: 500 });
  }

  const moderering = byggModereringsblokk({ aapneRapporter: svar.aapne, naa });
  const epost = byggKveldsvarselEpost(moderering, naa);
  if (!epost) {
    log.info('aapne_rapporter.ingen_aapne');
    return NextResponse.json({ ok: true, sendt: false, moderering });
  }

  const res = await sendEpost({ til: RAPPORTMOTTAKER, ...epost, idempotensNokkel });
  const tall = { antall: moderering.antall, eldsteTimer: moderering.eldsteTimer, overFrist: moderering.overFrist, haster: moderering.haster };
  if (!res.ok) {
    // Noe venter, og varselet kom ikke ut. Jobben har ikke gjort det den er
    // til for — da skal kjøringen stå som feilet, ikke som en stille 200.
    log.error('aapne_rapporter.ikke_sendt', { ...tall, detalj: res.detalj });
    return NextResponse.json({ error: 'Varselet ble ikke sendt', sendt: false, detalj: res.detalj, moderering }, { status: 500 });
  }

  // Over døgnfristen: også i loggen, som i dagsrapporten.
  if (moderering.overFrist) log.warn('aapne_rapporter.over_frist', tall);
  log.info('aapne_rapporter.sendt', tall);

  return NextResponse.json({ ok: true, sendt: true, detalj: res.detalj, moderering });
}
