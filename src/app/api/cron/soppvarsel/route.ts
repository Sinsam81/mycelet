import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { bearerSecretMatches } from '@/lib/security/secret-compare';
import { skalVarsle, VARSEL_KARANTENE_DAGER } from '@/lib/alerts/decision';
import { byggVarselEpost } from '@/lib/alerts/email';
import { sendEpost } from '@/lib/email/send';
import type { Locale } from '@/i18n/config';

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

/** Så mange dager historikk decision.ts trenger for ukas bunn. */
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

/** 90-persentilen. Samme definisjon som /api/prediction/regions — hold dem i takt. */
function percentile90(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
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
    scoreIDag.set(navn, Math.round(percentile90([...scorer].sort((a, b) => a - b))));
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
  fraDato.setUTCDate(fraDato.getUTCDate() - HISTORIKK_DAGER);
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
  for (const rad of (historikk ?? []) as Array<{ region: string; tile_date: string; score: number }>) {
    if (rad.tile_date === igaarIso) scoreIGar.set(rad.region, rad.score);
    const naa = lavesteUke.get(rad.region);
    if (naa === undefined || rad.score < naa) lavesteUke.set(rad.region, rad.score);
  }

  // ── 4. Abonnementene ──────────────────────────────────────────────────────
  const { data: abonnenter, error: abErr } = await db
    .from('alert_subscriptions')
    .select('id,user_id,region,locale,last_notified_at,unsubscribe_token')
    .eq('active', true);
  if (abErr) {
    log.error('soppvarsel.abonnement_feilet', { message: abErr.message });
    return NextResponse.json({ error: 'Kunne ikke hente abonnementer' }, { status: 500 });
  }

  const naa = new Date();
  let sendt = 0;
  let feilet = 0;
  const avslag: Record<string, number> = {};

  for (const ab of (abonnenter ?? []) as Abonnement[]) {
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
      naa
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

    const avmeldingsUrl = `${appUrl}/soppvarsel/av?t=${ab.unsubscribe_token}`;
    const { emne, html, tekst } = byggVarselEpost({
      region: ab.region,
      fra: beslutning.fra,
      til: beslutning.til,
      locale: (ab.locale === 'sv' ? 'sv' : 'nb') as Locale,
      appUrl,
      avmeldingsUrl
    });

    const res = await sendEpost({ til: epost, emne, html, tekst, avmeldingsUrl });
    if (!res.ok) {
      // Raden oppdateres IKKE ved feil. Da prøver vi igjen i morgen hvis
      // forholdene fortsatt er gode — bedre enn å markere som sendt og tie.
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
    abonnenter: abonnenter?.length ?? 0,
    sendt,
    feilet,
    avslag
  });

  return NextResponse.json({
    ok: true,
    tileDate,
    regioner: scoreIDag.size,
    abonnenter: abonnenter?.length ?? 0,
    sendt,
    feilet,
    avslag,
    karanteneDager: VARSEL_KARANTENE_DAGER
  });
}
