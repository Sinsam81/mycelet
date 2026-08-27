import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { bearerSecretMatches } from '@/lib/security/secret-compare';
import { skalVarsle, VARSEL_KARANTENE_DAGER, VARSEL_MIN_SCORE } from '@/lib/alerts/decision';
import { byggVarselEpost } from '@/lib/alerts/email';
import { sendEpost } from '@/lib/email/send';
import type { Locale } from '@/i18n/config';
import { regionScore } from '@/lib/prediction/region-score';

/**
 * Soppvarselet — kjører hver morgen etter at nattens fliser er generert.
 *
 * Rekkefølgen i vercel.json er ikke tilfeldig: flisene lages 01:15 (NO) og
 * 01:45 (SE), og denne kjører 05:00. Kjørte den før, ville den lest gårsdagens
 * raster som «i dag» og aldri sett en eneste overgang.
 *
 * Jobben gjør tre ting, i denne rekkefølgen:
 *   1. regner ut dagens score per region og LAGRER den (region_daily_scores)
 *   2. leser gårsdagen og ukas bunn fra den samme tabellen
 *   3. lar src/lib/alerts/decision.ts avgjøre hvem som skal ha e-post
 *
 * Steg 1 skjer uansett om noen abonnerer. Historikken er verdt å ha for seg
 * selv — den er grunnlaget for varselet, og den gjør /soppforhold billigere.
 *
 * ⚠️ Skriv aldri om beslutningen her. Den bor i decision.ts, med tester, og
 * grunnen er at «når skal vi sende» er hele funksjonen — se filhodet der.
 */

export const maxDuration = 300;

/**
 * Vinduet for ukas bunn: så mange DATOER, i dag medregnet. Samme definisjon
 * som decision.ts («de siste sju dagene (i dag medregnet)») og sesongtesten
 * (`scorer.slice(d - 6, d + 1)`). Trekk derfor fra HISTORIKK_DAGER − 1 når
 * startdatoen regnes ut — å trekke fra 7 gir et vindu på åtte datoer.
 */
const HISTORIKK_DAGER = 7;

interface TileRow {
  score: number;
  center_lat: number;
  center_lng: number;
  metadata: Record<string, unknown> | null;
}

interface Abonnement {
  id: string;
  user_id: string;
  region: string;
  locale: string;
  last_notified_at: string | null;
  unsubscribe_token: string;
}

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);

  if (!bearerSecretMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Ikke autorisert' }, { status: 401 });
  }

  const db = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mycelet.com';

  // ── 1. Dagens raster ──────────────────────────────────────────────────────
  const { data: datoRad, error: datoErr } = await db
    .from('prediction_tiles')
    .select('tile_date')
    .order('tile_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (datoErr) {
    log.error('soppvarsel.dato_feilet', { message: datoErr.message });
    return NextResponse.json({ error: 'Kunne ikke hente rasterdato' }, { status: 500 });
  }
  const tileDate = datoRad?.tile_date as string | undefined;
  if (!tileDate) return NextResponse.json({ ok: true, grunn: 'ingen fliser ennå' });

  // Fersk-sjekk. Fryser flisgenereringen, står max(tile_date) stille mens
  // klokka går — og uten denne ville det samme «det snudde nå»-varselet blitt
  // sendt på nytt hver gang karantenen løp ut, bygget på uke-gammelt vær. Én
  // dags slakk for kjøringer rett etter midnatt og tidssoneskjevhet.
  const iDagIso = new Date().toISOString().slice(0, 10);
  const rasterAlderDager =
    (Date.parse(`${iDagIso}T00:00:00Z`) - Date.parse(`${tileDate}T00:00:00Z`)) / 86_400_000;
  if (rasterAlderDager > 1) {
    log.warn('soppvarsel.fliser_utdatert', { tileDate, rasterAlderDager });
    return NextResponse.json({ ok: true, grunn: 'fliser-utdatert', tileDate });
  }

  // PostgREST kapper på 1000 rader uansett limit — må pagineres. Samme felle som
  // i regionsruta, der en delvis lest side så ut som at halve landet manglet.
  const rader: TileRow[] = [];
  for (let side = 0; side < 20; side += 1) {
    const fra = side * 1000;
    const { data, error } = await db
      .from('prediction_tiles')
      .select('score,center_lat,center_lng,metadata')
      .eq('tile_date', tileDate)
      .order('id', { ascending: true })
      .range(fra, fra + 999);
    if (error) {
      log.error('soppvarsel.fliser_feilet', { message: error.message });
      return NextResponse.json({ error: 'Kunne ikke hente fliser' }, { status: 500 });
    }
    rader.push(...((data ?? []) as TileRow[]));
    if ((data ?? []).length < 1000) break;
  }

  // Beste art per rute først — ellers teller samme sted én gang per art, og en
  // region med mange arter i basen ser bedre ut enn en med få.
  const bestePerCelle = new Map<string, TileRow>();
  for (const r of rader) {
    const k = `${r.center_lat.toFixed(4)},${r.center_lng.toFixed(4)}`;
    const naa = bestePerCelle.get(k);
    if (!naa || r.score > naa.score) bestePerCelle.set(k, r);
  }

  const perRegion = new Map<string, number[]>();
  for (const r of bestePerCelle.values()) {
    const navn = typeof r.metadata?.region === 'string' ? (r.metadata.region as string) : null;
    if (!navn) continue;
    const liste = perRegion.get(navn) ?? [];
    liste.push(r.score);
    perRegion.set(navn, liste);
  }

  const scoreIDag = new Map<string, number>();
  for (const [navn, scorer] of perRegion) {
    scoreIDag.set(navn, Math.round(regionScore([...scorer].sort((a, b) => a - b))));
  }

  // ── 2. Lagre dagens tall ──────────────────────────────────────────────────
  if (scoreIDag.size > 0) {
    const { error } = await db.from('region_daily_scores').upsert(
      [...scoreIDag].map(([region, score]) => ({ region, tile_date: tileDate, score })),
      { onConflict: 'region,tile_date' }
    );
    if (error) log.warn('soppvarsel.lagring_feilet', { message: error.message });
  }

  // ── 3. Historikk ──────────────────────────────────────────────────────────
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
    log.error('soppvarsel.historikk_feilet', { message: histErr.message });
    return NextResponse.json({ error: 'Kunne ikke hente historikk' }, { status: 500 });
  }

  const scoreIGar = new Map<string, number>();
  const lavesteUke = new Map<string, number>();
  const scorePerDato = new Map<string, Map<string, number>>();
  for (const rad of (historikk ?? []) as Array<{ region: string; tile_date: string; score: number }>) {
    if (rad.tile_date === igaarIso) scoreIGar.set(rad.region, rad.score);
    const naa = lavesteUke.get(rad.region);
    if (naa === undefined || rad.score < naa) lavesteUke.set(rad.region, rad.score);
    const datoer = scorePerDato.get(rad.region) ?? new Map<string, number>();
    datoer.set(rad.tile_date, rad.score);
    scorePerDato.set(rad.region, datoer);
  }

  // Siste omslag under→over terskelen per region. decision.ts bruker datoen til
  // å hente inn igjen varsler som feilet på selve omslagsdagen. Bare nabodager
  // teller — et hull i historikken er manglende data, ikke et omslag.
  const sisteOmslag = new Map<string, string>();
  for (const [region, datoer] of scorePerDato) {
    const sortert = [...datoer.keys()].sort();
    for (let i = 1; i < sortert.length; i += 1) {
      const erNabodager =
        Date.parse(`${sortert[i]}T00:00:00Z`) - Date.parse(`${sortert[i - 1]}T00:00:00Z`) === 86_400_000;
      if (!erNabodager) continue;
      const forrige = datoer.get(sortert[i - 1]);
      const denne = datoer.get(sortert[i]);
      if (forrige !== undefined && denne !== undefined && forrige < VARSEL_MIN_SCORE && denne >= VARSEL_MIN_SCORE) {
        sisteOmslag.set(region, sortert[i]);
      }
    }
  }

  // ── 4. Abonnementene ──────────────────────────────────────────────────────
  // Samme PostgREST-felle som flisene over: svaret kappes på 1000 rader uansett,
  // og uten paginering ville abonnent nummer 1001 stille og rolig aldri fått
  // varsel. Sortert på id så sidene er stabile mellom spørringene.
  const abonnenter: Abonnement[] = [];
  for (let side = 0; side < 20; side += 1) {
    const fra = side * 1000;
    const { data, error: abErr } = await db
      .from('alert_subscriptions')
      .select('id,user_id,region,locale,last_notified_at,unsubscribe_token')
      .eq('active', true)
      .order('id', { ascending: true })
      .range(fra, fra + 999);
    if (abErr) {
      log.error('soppvarsel.abonnement_feilet', { message: abErr.message });
      return NextResponse.json({ error: 'Kunne ikke hente abonnementer' }, { status: 500 });
    }
    abonnenter.push(...((data ?? []) as Abonnement[]));
    if ((data ?? []).length < 1000) break;
  }

  const naa = new Date();
  let sendt = 0;
  let feilet = 0;
  const avslag: Record<string, number> = {};

  for (const ab of abonnenter) {
    const iDag = scoreIDag.get(ab.region);
    if (iDag === undefined) {
      avslag['ingen-region'] = (avslag['ingen-region'] ?? 0) + 1;
      continue;
    }

    const beslutning = skalVarsle({
      scoreIDag: iDag,
      scoreIGar: scoreIGar.get(ab.region) ?? null,
      lavesteSisteUke: lavesteUke.get(ab.region) ?? iDag,
      sistVarsletIso: ab.last_notified_at,
      naa,
      sisteOmslagIso: sisteOmslag.get(ab.region) ?? null
    });

    if (!beslutning.send) {
      avslag[beslutning.grunn] = (avslag[beslutning.grunn] ?? 0) + 1;
      continue;
    }

    // E-postadressen ligger i auth.users, ikke i profiles — den er ikke
    // eksponert gjennom PostgREST, og det er med vilje.
    const { data: bruker, error: brukerErr } = await db.auth.admin.getUserById(ab.user_id);
    const epost = bruker?.user?.email;
    if (brukerErr || !epost) {
      log.warn('soppvarsel.mangler_epost', { abonnement: ab.id });
      feilet += 1;
      continue;
    }

    // ⚠️ API-ruta, ikke kvitteringssiden. /soppvarsel/av (uten /api) er bare en
    // passiv bekreftelse — en lenke dit ville vist «du er avmeldt» uten å melde
    // av noen. API-ruta gjør jobben og sender mennesket videre til siden selv.
    const avmeldingsUrl = `${appUrl}/api/soppvarsel/av?t=${ab.unsubscribe_token}`;
    const { emne, html, tekst } = byggVarselEpost({
      region: ab.region,
      fra: beslutning.fra,
      til: beslutning.til,
      locale: (ab.locale === 'sv' ? 'sv' : 'nb') as Locale,
      appUrl,
      avmeldingsUrl
    });

    const res = await sendEpost({ til: epost, emne, html, tekst, avmeldingsUrl });

    // Resend tillater 2 kall/s. getUserById-rundturen gir litt naturlig avstand,
    // men denne gjør takten eksplisitt i stedet for tilfeldig. Med maxDuration
    // 300 gir det rom for noen hundre utsendinger per kjøring — mer enn nok
    // lenge, og pagineringen over sørger for at alle i det minste VURDERES.
    await new Promise((r) => setTimeout(r, 600));

    if (!res.ok) {
      // Raden oppdateres IKKE ved feil. Da prøver vi igjen i morgen hvis
      // forholdene fortsatt er gode: decision.ts slipper abonnenten gjennom
      // «var-allerede-bra» så lenge hen ikke har fått varsel siden siste
      // omslag — se sisteOmslagIso der.
      feilet += 1;
      continue;
    }

    const { error: oppdErr } = await db
      .from('alert_subscriptions')
      .update({ last_notified_at: naa.toISOString(), last_notified_score: beslutning.til })
      .eq('id', ab.id);
    if (oppdErr) {
      // ⚠️ E-posten ER sendt. Uten oppdatert rad ryker karantenen, og brukeren
      // kan få samme varsel i morgen. Logges høyt nettopp derfor.
      log.error('soppvarsel.karantene_ikke_lagret', { abonnement: ab.id, message: oppdErr.message });
    }
    sendt += 1;
  }

  log.info('soppvarsel.ferdig', {
    tileDate,
    regioner: scoreIDag.size,
    abonnenter: abonnenter.length,
    sendt,
    feilet,
    avslag
  });

  return NextResponse.json({
    ok: true,
    tileDate,
    regioner: scoreIDag.size,
    abonnenter: abonnenter.length,
    sendt,
    feilet,
    avslag,
    karanteneDager: VARSEL_KARANTENE_DAGER
  });
}
