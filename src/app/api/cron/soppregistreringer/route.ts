import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { bearerSecretMatches } from '@/lib/security/secret-compare';
import { NORGE, tilTabellrad, vinduerFor } from '@/lib/rapport/soppregistreringer';
import { FristUteFeil, lagGbifKlient, lesUtgave, sjekkIndeksering, tellSoppregistreringer, type Utgave } from '@/lib/rapport/soppregistreringer-henting';

/**
 * Soppregistreringer, samme dato som før (migrasjon 071) — til eierens
 * dagsrapport, aldri til kunder.
 *
 * Går hver natt 05:45 UTC, men gjør bare jobben når Artsobservasjoner har
 * en ny utgave i GBIF (omtrent ukentlig). 05:45 fordi GBIF henter utgaven
 * søndager ~03:00–03:35 og er ferdig med å indeksere ~05:00–05:20, og
 * dagsrapporten går 06:00.
 *
 *   1. ETT kall: datasettets pubDate = utgaven (og når registeret fikk den).
 *   2. Utenfor sesongen (vinduet slutter før 7. august eller etter 30.
 *      november)? Ferdig.
 *   3. Finnes det rader for utgaven? Ferdig — den er regnet.
 *   4. To kall: har søkeindeksen utgaven? pubDate kommer timer før tallene,
 *      og /process sier FINISHED lenge før indeksen er byttet — se
 *      sjekkIndeksering. Nei, eller usikkert? Ferdig for i natt.
 *   5. Ellers: 61 kall til (se soppregistreringer-henting.ts), 2 s mellom
 *      hvert, ~2,5 minutter. Alle 64 rader skrives i ÉN upsert til slutt.
 *
 * Rakk det ikke (FristUteFeil) eller svarte GBIF feil to ganger på rad,
 * skrives ingenting, og neste natt prøver hele utgaven på nytt — en uke har
 * seks netter til det. Halve tall i tabellen ville sett ferdige ut.
 */

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  if (!bearerSecretMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Ikke autorisert' }, { status: 401 });
  }

  const klient = lagGbifKlient();
  let utgave: Utgave;
  try {
    utgave = await lesUtgave(klient);
  } catch (e) {
    log.warn('soppregistreringer.utgave_feilet', { message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false, grunn: 'GBIF svarte ikke på utgavedatoen' }, { status: 502 });
  }
  const snapshot = utgave.dato;

  if (!vinduerFor(snapshot)) {
    log.info('soppregistreringer.utenfor_sesong', { snapshot });
    return NextResponse.json({ ok: true, snapshot, hoppetOver: 'utenfor sesongen' });
  }

  const db = createAdminClient();
  const { count, error: lesFeil } = await db
    .from('soppregistreringer')
    .select('snapshot', { count: 'exact', head: true })
    .eq('snapshot', snapshot);
  if (lesFeil) {
    // Uten tabellen (migrasjonen ikke kjørt) er 63 GBIF-kall bortkastet.
    log.error('soppregistreringer.les_feilet', { message: lesFeil.message });
    return NextResponse.json({ ok: false, grunn: 'Kunne ikke lese soppregistreringer' }, { status: 500 });
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json({ ok: true, snapshot, hoppetOver: 'allerede målt' });
  }

  try {
    const indeksering = await sjekkIndeksering(klient, utgave);
    if (!indeksering.ferdig) {
      log.info('soppregistreringer.ikke_indeksert', { snapshot, grunn: indeksering.grunn });
      return NextResponse.json({ ok: true, snapshot, hoppetOver: 'GBIF har ikke indeksert utgaven ennå', grunn: indeksering.grunn });
    }
    const res = await tellSoppregistreringer(klient, snapshot, { logg: (h, d) => log.info(h, d) });
    const { error: skrivFeil } = await db
      .from('soppregistreringer')
      .upsert(res.rader.map(tilTabellrad), { onConflict: 'snapshot,vindu,omrade,gruppe' });
    if (skrivFeil) {
      log.error('soppregistreringer.lagring_feilet', { message: skrivFeil.message });
      return NextResponse.json({ ok: false, grunn: 'Kunne ikke lagre' }, { status: 500 });
    }
    const norge = (vindu: 'sesong' | 'uke', gruppe: 'alle' | 'storsopp') =>
      res.rader.find((r) => r.vindu === vindu && r.gruppe === gruppe && r.omrade === NORGE)?.prosent ?? null;
    log.info('soppregistreringer.ferdig', {
      snapshot,
      rader: res.rader.length,
      kall: res.kall,
      bruktMs: res.bruktMs,
      norgeSesongAlle: norge('sesong', 'alle'),
      norgeSesongStorsopp: norge('sesong', 'storsopp')
    });
    return NextResponse.json({
      ok: true,
      snapshot,
      vinduer: res.vinduer,
      rader: res.rader.length,
      kall: res.kall,
      bruktMs: res.bruktMs,
      norge: { sesongAlle: norge('sesong', 'alle'), sesongStorsopp: norge('sesong', 'storsopp'), ukeAlle: norge('uke', 'alle'), ukeStorsopp: norge('uke', 'storsopp') }
    });
  } catch (e) {
    if (e instanceof FristUteFeil) {
      log.warn('soppregistreringer.frist_ute', { snapshot, kall: e.kall });
      return NextResponse.json({ ok: false, snapshot, grunn: 'fristen gikk ut — prøver hele utgaven igjen neste natt', kall: e.kall }, { status: 503 });
    }
    log.error('soppregistreringer.gbif_feilet', { snapshot, message: e instanceof Error ? e.message : String(e), kall: klient.kall() });
    return NextResponse.json({ ok: false, snapshot, grunn: 'GBIF-feil — prøver igjen neste natt' }, { status: 502 });
  }
}
