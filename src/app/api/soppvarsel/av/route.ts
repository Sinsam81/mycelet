import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { AKTIVERING_MIN_MS } from '@/lib/rapport/dagsrapport';
import { TOKEN_MONSTER, hvorforIkkeNavigering, lenkeside, lenkesideSprak, lesSprak } from '@/lib/alerts/lenkeside';
import type { Locale } from '@/i18n/config';

/**
 * Avmelding fra soppvarsel — uten innlogging.
 *
 * ── TRE INNGANGER ───────────────────────────────────────────────────────────
 *
 * POST uten skjemafelt er RFC 8058 «one-click»: e-posten setter
 * List-Unsubscribe-Post, og da viser Gmail og Outlook en innebygd
 * avmeldingsknapp øverst i meldingen. Den knappen sender en POST hit, uten at
 * brukeren åpner noe. Det er den beste forsikringen mot at folk trykker
 * «søppelpost» i stedet — en spam-markering rammer leveringen av ALLE
 * e-postene våre, også de som ikke er varsler. Den svarer 200 uten kropp og
 * omdirigerer aldri. Alt vi ikke kjenner igjen som vårt eget skjema behandles
 * slik, så Gmail og Outlook aldri kan brekke.
 *
 * GET er lenka i brødteksten. Den melder av med én gang BARE når hentingen er
 * et menneske som navigerer — se under. Ellers tegner ruta en liten side med
 * én knapp.
 *
 * POST med skjema=1 er den knappen: melder av og sender videre (303) til
 * kvitteringen på /soppvarsel/av.
 *
 * ── SKANNERE SKAL IKKE MELDE FOLK AV ────────────────────────────────────────
 *
 * GET meldte før av på enhver henting. E-postskannere (Safe Links,
 * bedriftsgatewayer, lenkesjekkere som spør HEAD) følger lenkene i en e-post
 * idet den leveres — og da ble abonnenter bak slike systemer stille meldt av
 * av sitt første varsel. De trodde de fulgte området, og hørte aldri mer fra
 * oss. Nå skriver GET bare når BEGGE holder (samme regler som
 * /api/prove/svar og /api/soppvarsel/klikk):
 *
 *   · nettleseren sier selv at det er en navigering (Sec-Fetch-headerne, se
 *     src/lib/alerts/lenkeside.ts)
 *   · hentingen skjer minst AKTIVERING_MIN_MS etter utsendingen, når lenka
 *     bærer utsendingstiden (&s=, skrevet av cronen). Skannere henter innen
 *     sekunder, også de som kjører en ekte nettleser. Eldre e-poster uten &s=
 *     faller tilbake på navigeringssjekken alene.
 *
 * Holder ikke begge, vises siden med knappen — uten at tokenet slås opp, så
 * svaret er likt for ekte og oppdiktede tokens. Den krever aldri innlogging:
 * det verste et menneske møter er ett trykk til. HEAD skriver aldri.
 *
 * ── HVORFOR TOKEN OG IKKE INNLOGGING ────────────────────────────────────────
 *
 * Åpner du e-posten på en telefon der du ikke er logget inn, og eneste vei ut
 * er «logg inn først», så finnes det i praksis ingen vei ut. Tokenet er en
 * tilfeldig uuid som bare identifiserer én rad, leses kun med tjenestenøkkelen,
 * og kan ikke brukes til noe annet enn å slå av varselet.
 *
 * Vi SLETTER ikke raden — vi setter active = false. Da beholder brukeren
 * regionvalget sitt om hen slår varselet på igjen, og vi unngår at en feilklikket
 * avmelding koster mer enn den skal.
 */

export const runtime = 'nodejs';

/** Server-generert prosa dekkes ikke av next-intl — derfor en egen tabell per språk. */
const COPY: Record<Locale, { tittel: string; tekst: string; knapp: string }> = {
  nb: {
    tittel: 'Ett trykk til',
    tekst:
      'Trykk på knappen for å slå av soppvarselet. Lenker i e-post åpnes iblant av e-postprogrammet selv, så vi melder deg ikke av før du trykker.',
    knapp: 'Slå av soppvarselet'
  },
  sv: {
    tittel: 'Ett tryck till',
    tekst:
      'Tryck på knappen för att stänga av svampvarningen. Länkar i e-post öppnas ibland av e-postprogrammet självt, så vi avregistrerar dig inte förrän du trycker.',
    knapp: 'Stäng av svampvarningen'
  }
};

type Avmeldt = { ok: true; locale: Locale | null } | { ok: false; status: 500 };

/** Slår av raden tokenet peker på. Tokenet er alt validert av kalleren. */
async function meldAv(token: string, log: ReturnType<typeof createRequestLogger>): Promise<Avmeldt> {
  const db = createAdminClient();
  // Roter bekreftelsestokenet samtidig: den gamle lenka i innboksen skal
  // ikke kunne gjenoppta abonnementet (bekreft-ruta avviser avmeldte rader
  // uansett — dette er belte og bukseseler).
  const { data, error } = await db
    .from('alert_subscriptions')
    .update({ active: false, confirm_token: randomUUID() })
    .eq('unsubscribe_token', token)
    .select('id,locale');

  if (error) {
    log.error('soppvarsel.avmelding_feilet', undefined, { message: error.message });
    return { ok: false, status: 500 };
  }

  // Ukjent token gir samme utfall som et gyldig. Et varierende svar ville gjort
  // ruta til et orakel for å gjette gyldige tokens. Radens språk brukes bare
  // til å vise kvitteringen riktig, og først ETTER at avmeldingen er utført —
  // siden med knappen (GET uten navigering) slår aldri opp tokenet.
  log.info('soppvarsel.avmeldt', { traff: (data ?? []).length });
  return { ok: true, locale: lesSprak(data?.[0]?.locale) };
}

/**
 * Romslig grense per IP: one-click-POST-ene kommer fra Gmail/Outlook sin
 * infrastruktur, ofte bak delte IP-er, og en for stram grense ville avvist
 * ekte avmeldinger. 60/min stopper hamring uten å røre normal trafikk.
 */
function forMangeKall(request: NextRequest) {
  const rl = checkRateLimit(`soppvarsel-av:${getClientKey(request, null)}`, 60, 60);
  return rl.allowed ? null : rateLimitResponse(rl);
}

/** Kvitteringssiden — den gjør ingenting selv, den bekrefter bare utfallet. */
function kvittering(request: NextRequest, ok: boolean, sprak: Locale | null, status: 303 | 307) {
  const mål = `/soppvarsel/av?ok=${ok ? '1' : '0'}${sprak ? `&sprak=${sprak}` : ''}`;
  return NextResponse.redirect(new URL(mål, request.nextUrl.origin), status);
}

/** Utsendingstiden lenka bærer (&s=, sekunder siden epoke), eller null for eldre e-poster. */
function sendtMs(s: string | null): number | null {
  const sek = Number(s);
  return s !== null && Number.isFinite(sek) && sek > 0 ? sek * 1000 : null;
}

/** Lenkesjekkere og skannere spør ofte HEAD først. Svar pent, skriv ingenting. */
export async function HEAD(request: NextRequest) {
  const stopp = forMangeKall(request);
  if (stopp) return stopp;
  return new NextResponse(null, { status: 200, headers: { 'cache-control': 'no-store' } });
}

/** Lenka i brødteksten. Melder av bare for et menneske som navigerer — se filhodet. */
export async function GET(request: NextRequest) {
  const stopp = forMangeKall(request);
  if (stopp) return stopp;
  const log = createRequestLogger(request);
  const params = request.nextUrl.searchParams;
  const token = params.get('t') ?? '';
  const bedtSprak = lesSprak(params.get('sprak'));

  // Ugyldig uuid skal ikke nå databasen som en tekstsammenligning — og en
  // avkortet lenke skal få kvitteringen som sier nettopp det.
  if (!TOKEN_MONSTER.test(token)) return kvittering(request, false, bedtSprak, 307);

  const sendt = sendtMs(params.get('s'));
  const grunn =
    hvorforIkkeNavigering(request) ?? (sendt !== null && Date.now() - sendt < AKTIVERING_MIN_MS ? 'skannervindu' : null);
  if (grunn) {
    log.info('soppvarsel.avmelding_bekreftelse_vist', { grunn });
    const locale = lenkesideSprak(request, params.get('sprak'));
    const t = COPY[locale];
    return lenkeside({
      locale,
      tittel: t.tittel,
      tekst: t.tekst,
      knapp: t.knapp,
      skjemaMal: `/api/soppvarsel/av?t=${token}`,
      felt: { skjema: '1', sprak: locale },
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
    });
  }

  const res = await meldAv(token, log);
  // Kvitteringen vises på abonnementets språk; uten treff på det lenka bærer.
  return kvittering(request, res.ok, res.ok ? (res.locale ?? bedtSprak) : bedtSprak, 307);
}

/**
 * To avsendere: RFC 8058 one-click fra e-postleverandøren, og knappen på
 * siden over (skjema=1). Skannere sender ikke skjemaer, så her skrives det
 * alltid.
 */
export async function POST(request: NextRequest) {
  const stopp = forMangeKall(request);
  if (stopp) return stopp;
  const log = createRequestLogger(request);
  const token = request.nextUrl.searchParams.get('t') ?? '';

  // One-click-kroppen er «List-Unsubscribe=One-Click». En kropp vi ikke kan
  // lese (tom, feil type) er derfor one-click den også — aldri en feil.
  let skjema: FormData | null = null;
  try {
    skjema = await request.formData();
  } catch {
    skjema = null;
  }
  const fraSiden = skjema?.get('skjema') === '1';
  const bedtSprak = lesSprak(skjema?.get('sprak'));
  const gyldig = TOKEN_MONSTER.test(token);

  if (!fraSiden) {
    // RFC 8058: svar 200 og omdiriger ikke.
    if (!gyldig) return new NextResponse(null, { status: 400 });
    const res = await meldAv(token, log);
    return new NextResponse(null, { status: res.ok ? 200 : res.status });
  }

  if (!gyldig) return kvittering(request, false, bedtSprak, 303);
  const res = await meldAv(token, log);
  return kvittering(request, res.ok, res.ok ? (res.locale ?? bedtSprak) : bedtSprak, 303);
}
