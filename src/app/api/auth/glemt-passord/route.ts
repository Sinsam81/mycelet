import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey } from '@/lib/rate-limit/route';
import { manglendeEpostKonfig, sendEpost } from '@/lib/email/send';
import { byggGlemtPassordEpost, lagResetLenke } from '@/lib/auth/glemt-passord-epost';
import { vent } from '@/lib/utils/vent';
import { getUserLocale } from '@/i18n/locale';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/config';

/**
 * «Glemt passord» som virker uansett hvilken nettleser lenka åpnes i.
 *
 * Supabases egen gjenopprettingsmail (resetPasswordForEmail fra nettleser-
 * klienten) er en PKCE-kode som bare kan løses inn der forespørselen ble
 * startet. Fra appen åpner e-postlenka alltid i Safari, så app-brukere endte
 * på «lenken er ugyldig» hver gang. Her lager vi lenka selv med admin-
 * klientens generateLink og sender `hashed_token` til /auth/reset, som løser
 * den inn med verifyOtp — samme mønster som /auth/confirm.
 *
 * Tre regler:
 *
 *  · SVARET ER ALLTID 200 MED SAMME KROPP — ukjent adresse, ugyldig kropp og
 *    rate-grense ser like ut utenfra, så ruten kan ikke brukes til å finne ut
 *    hvem som har konto.
 *
 *  · EGNE RATE-GRENSER ER PÅKREVD. generateLink går utenom Supabases
 *    innebygde 60 s-sperre per adresse, så uten grensene under ville ruten
 *    vært et verktøy for å bombe en innboks. Grensen er per instans (som all
 *    rate-limiting her), derfor stram.
 *
 *  · RESERVELØSNING, I TO UTGAVER. generateLink er ikke gratis: den stempler
 *    `recovery_sent_at` på brukeren, og Supabases egen /recover (det
 *    resetPasswordForEmail kaller) svarer 429 de neste 60 sekundene. Derfor
 *    avhenger svaret av om lenka rakk å bli laget:
 *
 *      – `fallback: true` — ingen lenke ble laget: service role-nøkkel eller
 *        Resend-oppsett mangler (lokalt, preview), eller generateLink feilet.
 *        Skjemaet sender da Supabases egen e-post med en gang, som før.
 *
 *      – `sendFailed: true` — lenka ble laget, men e-posten kom ikke ut, heller
 *        ikke på det ene nye forsøket. Supabases e-post KAN ikke sendes nå
 *        (den ville fått 429), så skjemaet sier «prøv igjen om et minutt» og
 *        går neste gang rett til Supabase uten å kalle denne ruten — et nytt
 *        kall hit ville stemplet på nytt og sperret reserven én gang til.
 *        Svarte ruten `fallback` også her, ville «glemt passord» vært nede
 *        for alle så lenge Resend feilet.
 *
 *    `sendFailed` settes bare når en e-post faktisk skulle gått — under et
 *    Resend-utfall røper det dermed at kontoen finnes; det er valgt framfor at
 *    ingen får nytt passord i utfallet.
 *
 * Tokenet og hele adressen logges aldri.
 */

export const runtime = 'nodejs';
// Verste tilfelle: generateLink, så sendEpost med sin egen frist på 15 s, ett
// nytt forsøk etter 1 s og en frist til — rundt 32 s. Uten et eget tak arver
// ruta plattformens standard, som kan avbryte den midt i andre forsøk; da har
// lenken alt sperret Supabases egen e-post i 60 s, og brukeren får verken vår
// eller deres.
export const maxDuration = 40;

const VINDU_SEKUNDER = 15 * 60;
const MAKS_PER_KLIENT = 5;
const MAKS_PER_ADRESSE = 3;

/**
 * Pause før det ene nye sendeforsøket. Resends takgrense telles per sekund
 * (soppvarselets nattjobb kan bruke den opp mens noen står ved skjemaet), så
 * ett sekund er nok til å treffe et nytt vindu — og kort nok til at brukeren
 * ikke merker det.
 */
const NYTT_FORSOK_ETTER_MS = 1000;

const EPOST_MONSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function erIkkeFunnet(error: { status?: number; code?: string; message?: string }): boolean {
  if (error.status === 404 || error.code === 'user_not_found') return true;
  return (error.message ?? '').toLowerCase().includes('not found');
}

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  const ok = () => NextResponse.json({ ok: true });
  const reserve = () => NextResponse.json({ ok: true, fallback: true });
  const ikkeSendt = () => NextResponse.json({ ok: true, sendFailed: true });

  const raa = await request.json().catch(() => null);
  const epostRaa = raa && typeof raa === 'object' ? (raa as Record<string, unknown>).email : null;
  const epost = typeof epostRaa === 'string' ? epostRaa.trim().toLowerCase() : '';

  // Klientgrensen telles før alt annet, også for ugyldige kropper.
  const klient = checkRateLimit(`glemt-passord:${getClientKey(request, null)}`, MAKS_PER_KLIENT, VINDU_SEKUNDER);
  if (!klient.allowed) {
    log.warn('glemt_passord.rate_klient', {});
    return ok();
  }

  if (!epost || epost.length > 254 || !EPOST_MONSTER.test(epost)) return ok();

  const adresse = checkRateLimit(`glemt-passord:epost:${epost}`, MAKS_PER_ADRESSE, VINDU_SEKUNDER);
  if (!adresse.allowed) {
    log.warn('glemt_passord.rate_adresse', {});
    return ok();
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL || manglendeEpostKonfig().length > 0) {
    log.warn('glemt_passord.ikke_konfigurert', {});
    return reserve();
  }

  // Sann fra generateLink har lykkes. Da er `recovery_sent_at` stemplet og
  // Supabases egen e-post sperret i 60 s — en feil etter dette punktet må
  // svare `sendFailed`, aldri `fallback`.
  let lenkeLaget = false;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: epost });

    if (error) {
      // Ukjent adresse: samme svar som en sendt e-post, og ingen reserve —
      // Supabases egen flyt ville heller ikke sendt noe.
      if (erIkkeFunnet(error)) return ok();
      log.warn('glemt_passord.lenke_feilet', { status: error.status, code: error.code });
      return reserve();
    }
    lenkeLaget = true;

    const token = data?.properties?.hashed_token;
    if (!token) {
      log.warn('glemt_passord.mangler_token', {});
      return ikkeSendt();
    }

    // Språket til den som står ved skjemaet; kontoens registreringsspråk
    // bare hvis oppslaget feiler.
    let locale: Locale | null = null;
    try {
      locale = await getUserLocale();
    } catch {
      locale = null;
    }
    if (!locale) {
      const sprak = data?.user?.user_metadata?.sprak;
      locale = typeof sprak === 'string' && isLocale(sprak) ? sprak : DEFAULT_LOCALE;
    }

    const epostInnhold = byggGlemtPassordEpost(lagResetLenke(token), locale);
    const melding = {
      til: epost,
      emne: epostInnhold.emne,
      html: epostInnhold.html,
      tekst: epostInnhold.tekst,
      // Én nøkkel per forespørsel, den samme på begge forsøk: kom det første
      // fram uten at vi fikk svaret, gir Resend samme svar igjen i stedet for
      // å sende e-posten to ganger. Tilfeldig — verken adresse eller token.
      idempotensNokkel: `glemt-passord/${randomUUID()}`
    };

    let sendt = await sendEpost(melding);
    if (!sendt.ok) {
      log.warn('glemt_passord.sending_feilet', { detalj: sendt.detalj, forsok: 1 });
      await vent(NYTT_FORSOK_ETTER_MS);
      sendt = await sendEpost(melding);
    }
    if (!sendt.ok) {
      log.warn('glemt_passord.sending_feilet', { detalj: sendt.detalj, forsok: 2 });
      return ikkeSendt();
    }

    log.info('glemt_passord.sendt', { sprak: locale });
    return ok();
  } catch (e) {
    log.warn('glemt_passord.feilet', { message: e instanceof Error ? e.message : 'ukjent', lenkeLaget });
    return lenkeLaget ? ikkeSendt() : reserve();
  }
}
