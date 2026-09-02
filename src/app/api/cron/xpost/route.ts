import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { bearerSecretMatches } from '@/lib/security/secret-compare';
import { beregnFasit, FASIT_MODEN_DAGER } from '@/lib/alerts/fasit';
import { byggOmslagsPost, byggUkesPost, finnOmslag, type UkensFasit } from '@/lib/x/innlegg';
import { manglendeXKonfig, postTilX } from '@/lib/x/klient';

/**
 * X-posteren — den offentlige utgaven av soppvarselet, på @mycelet.
 *
 * Kjører 05:30, en halvtime etter soppvarselet (05:00), og leser de samme
 * regionscorene DEN nettopp lagret i region_daily_scores. Én kilde til
 * sannhet: e-posten, /soppforhold og X-posten viser samme tall samme morgen.
 *
 * To posttyper, aldri mer enn én av hver per dag:
 *   · omslag       — dagene forholdene krysser under→over terskelen et sted.
 *                    Samme flankeregler som decision.ts, minus per-abonnent-
 *                    karantenen (en flanke kan ikke fyre to dager på rad).
 *   · ukesoppsummering — søndager: ukas beste områder + fasit for et modent
 *                    varsel når vi har en. Fasiten er hele differensieringen:
 *                    ingen andre publiserer etterprøvbare soppvarsler.
 *
 * Regioner det postes omslag for, skrives også til varsel_hendelser — enhver
 * OFFENTLIG påstand skal stå i fasitloggen på /apenhet, ikke bare de som
 * tilfeldigvis hadde e-postabonnenter.
 *
 * Dedupe/revisjon i x_innlegg (migrasjon 061): raden settes inn før X-kallet,
 * og en dag som allerede har raden hopper over. Se migrasjonsfila for hvorfor
 * det ikke prøves på nytt samme dag.
 */

export const maxDuration = 120;

const HISTORIKK_DAGER = 7;

type Score = { region: string; tile_date: string; score: number };

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);

  if (!bearerSecretMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Ikke autorisert' }, { status: 401 });
  }

  // Samme nitten-dagers-lærdom som e-postvarselet: en poster uten nøkler ser
  // helt frisk ut i loggene sine. Alarmen går til Sentry, og jobben avslutter
  // her — uten nøkler finnes ingenting mer å gjøre.
  const mangler = manglendeXKonfig();
  if (mangler.length > 0) {
    log.error('xpost.ikke_konfigurert', { mangler });
    Sentry.captureMessage(`X-posteren mangler ${mangler.join(', ')}`, 'error');
    await Sentry.flush(2000);
    return NextResponse.json({ ok: false, grunn: 'mangler-nokler', mangler });
  }

  const db = createAdminClient();
  const naa = new Date();
  const iDagIso = naa.toISOString().slice(0, 10);

  // ── 1. Regionscorene soppvarselet lagret i morges ─────────────────────────
  const { data: sisteRad, error: sisteErr } = await db
    .from('region_daily_scores')
    .select('tile_date')
    .order('tile_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sisteErr) {
    log.error('xpost.dato_feilet', { message: sisteErr.message });
    return NextResponse.json({ error: 'Kunne ikke hente scoredato' }, { status: 500 });
  }
  const tileDate = sisteRad?.tile_date as string | undefined;
  if (!tileDate) return NextResponse.json({ ok: true, grunn: 'ingen-scorer' });

  // Fersk-sjekk med én dags slakk — som soppvarselet: står tallene stille,
  // skal vi tie, ikke poste uke-gammelt vær som «i natt».
  const alderDager = (Date.parse(`${iDagIso}T00:00:00Z`) - Date.parse(`${tileDate}T00:00:00Z`)) / 86_400_000;
  if (alderDager > 1) {
    log.warn('xpost.scorer_utdatert', { tileDate, alderDager });
    return NextResponse.json({ ok: true, grunn: 'scorer-utdatert', tileDate });
  }

  const fraDato = new Date(`${tileDate}T00:00:00Z`);
  fraDato.setUTCDate(fraDato.getUTCDate() - (HISTORIKK_DAGER - 1));
  const igaar = new Date(`${tileDate}T00:00:00Z`);
  igaar.setUTCDate(igaar.getUTCDate() - 1);
  const igaarIso = igaar.toISOString().slice(0, 10);

  const { data: historikk, error: histErr } = await db
    .from('region_daily_scores')
    .select('region,tile_date,score')
    .gte('tile_date', fraDato.toISOString().slice(0, 10))
    .lte('tile_date', tileDate);
  if (histErr) {
    log.error('xpost.historikk_feilet', { message: histErr.message });
    return NextResponse.json({ error: 'Kunne ikke hente historikk' }, { status: 500 });
  }

  const iDag = new Map<string, number>();
  const iGar = new Map<string, number>();
  const lavesteUke = new Map<string, number>();
  for (const rad of (historikk ?? []) as Score[]) {
    if (rad.tile_date === tileDate) iDag.set(rad.region, rad.score);
    if (rad.tile_date === igaarIso) iGar.set(rad.region, rad.score);
    const bunn = lavesteUke.get(rad.region);
    if (bunn === undefined || rad.score < bunn) lavesteUke.set(rad.region, rad.score);
  }

  // ── 2. Sett sammen dagens poster ──────────────────────────────────────────
  const planlagte: Array<{ type: 'omslag' | 'ukesoppsummering'; tekst: string }> = [];

  const omslag = finnOmslag({ iDag, iGar, lavesteUke });
  const omslagsTekst = byggOmslagsPost(omslag);
  if (omslagsTekst) planlagte.push({ type: 'omslag', tekst: omslagsTekst });

  if (naa.getUTCDay() === 0 && iDag.size > 0) {
    const topp = [...iDag]
      .map(([region, score]) => ({ region, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    // Fasit for det nyeste MODNE varselet — best effort, som all annen pynt.
    let fasit: UkensFasit | null = null;
    try {
      const grense = new Date(naa.getTime() - FASIT_MODEN_DAGER * 86_400_000).toISOString().slice(0, 10);
      const { data } = await db
        .from('varsel_hendelser')
        .select('region,dato')
        .lte('dato', grense)
        .order('dato', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.region && data?.dato) {
        const beregnet = await beregnFasit(db, data.region as string, data.dato as string, naa);
        if (beregnet?.moden) {
          fasit = { region: beregnet.region, dato: beregnet.dato, ukenEtter: beregnet.ukenEtter, ukenFor: beregnet.ukenFor };
        }
      }
    } catch {
      // fasiten er pynt i søndagsposten — aldri i veien for den
    }

    const ukesTekst = byggUkesPost(topp, fasit);
    if (ukesTekst) planlagte.push({ type: 'ukesoppsummering', tekst: ukesTekst });
  }

  if (planlagte.length === 0) {
    log.info('xpost.ingenting_aa_poste', { tileDate, regioner: iDag.size });
    return NextResponse.json({ ok: true, grunn: 'ingenting-aa-poste', tileDate });
  }

  // ── 3. Publiser — med dedupe-rad FØR hvert X-kall ─────────────────────────
  let publisert = 0;
  let hoppetOver = 0;
  let feilet = 0;

  for (const post of planlagte) {
    const { data: krav, error: kravErr } = await db
      .from('x_innlegg')
      .upsert(
        { dato: iDagIso, type: post.type, tekst: post.tekst },
        { onConflict: 'dato,type', ignoreDuplicates: true }
      )
      .select('id');
    if (kravErr) {
      log.error('xpost.dedupe_feilet', { type: post.type, message: kravErr.message });
      feilet += 1;
      continue;
    }
    if (!krav || krav.length === 0) {
      hoppetOver += 1;
      continue; // allerede postet i dag
    }

    const res = await postTilX(post.tekst);
    if (!res.ok) {
      log.error('xpost.publisering_feilet', { type: post.type, feil: res.feil });
      Sentry.captureMessage(`X-posten (${post.type}) feilet: ${res.feil}`, 'error');
      feilet += 1;
      continue;
    }

    const { error: oppdErr } = await db.from('x_innlegg').update({ tweet_id: res.tweetId }).eq('id', krav[0].id);
    if (oppdErr) log.warn('xpost.tweetid_ikke_lagret', { id: krav[0].id, message: oppdErr.message });
    publisert += 1;

    // Offentlig omslagspåstand → fasitloggen på /apenhet, uavhengig av om
    // regionen hadde e-postabonnenter. Samme rad soppvarselet skriver, samme
    // (region, dato)-upsert — de to kan aldri lage duplikater av hverandre.
    if (post.type === 'omslag') {
      const rader = omslag.map((o) => ({ region: o.region, dato: iDagIso, fra_score: o.fra, til_score: o.til }));
      const { error: hendErr } = await db.from('varsel_hendelser').upsert(rader, { onConflict: 'region,dato' });
      if (hendErr) log.warn('xpost.hendelseslogg_feilet', { message: hendErr.message });
    }
  }

  if (feilet > 0) await Sentry.flush(2000);

  log.info('xpost.ferdig', { tileDate, planlagt: planlagte.length, publisert, hoppetOver, feilet });
  return NextResponse.json({ ok: true, tileDate, planlagt: planlagte.length, publisert, hoppetOver, feilet });
}
