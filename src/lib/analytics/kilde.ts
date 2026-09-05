/**
 * Hvor kom brukeren fra — fra første forsidebesøk til registrert konto.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVORFOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * traffic-source.ts logger hvor hvert forsidebesøk kom fra, men bare som en
 * linje i Vercel-loggen. Den linja sier ingenting om hva besøket ble til. Da
 * den første annonsetesten skulle planlegges (september 2026), var svaret på
 * «hvor mange av annonseklikkene registrerte seg?» altså umulig å gi — og
 * uten det er en annonsetest bare penger ut.
 *
 * Kjeden er:
 *
 *   forsidebesøk ──▶ cookie `mycelet_kilde` ──▶ user_metadata.kilde ──▶ dagsrapport
 *   (middleware)      (30 dager, kun tekst)      (signUp / callback)     (per kilde)
 *
 * Verdien er en kort tekst som «google/soppkart-test» eller «sosialt:facebook.com».
 * Ingen ID, ingen sporing på tvers av nettsteder, ingen tredjepart. Det er
 * det samme som allerede står i loggen — bare båret fram til registreringen.
 *
 * Første besøk vinner: cookien settes ikke på nytt hvis den finnes. En som
 * kom via en annonse og senere finner tilbake via Google-søk, telles på
 * annonsen. Det er det annonsetesten skal svare på.
 *
 * Cookien settes på FØRSTE eksterne besøk uansett inngangsside (fra
 * september 2026 — før bare på forsiden). Områdesidene, /soppvarsel og
 * artiklene er det presse, partnere og søk sender folk til; med cookien
 * bare på `/` telte alt det som «ukjent». Direkte besøk og interne klikk
 * setter fortsatt ingen cookie: de er «ukjent», og rapporten sier det.
 *
 * Kilden bæres videre til BÅDE kontoregistrering (user_metadata.kilde) og
 * kontoløs varselpåmelding (alert_subscriptions.kilde, migrasjon 063).
 */

import { classifyTrafficSource, type TrafficSource } from './traffic-source';

export const KILDE_COOKIE = 'mycelet_kilde';

/**
 * Kortlevd markør satt av våre egne e-postruter (bekreft, klikk) på 303-
 * svaret: «neste sidevisning er en videresending fra en e-post, Referer er
 * webmail-verten — ikke en kilde». Middleware leser og sletter den. En URL-
 * parameter ville blitt hengende i adressefeltet og fulgt med når leseren
 * deler lenka videre, og da hadde delingskanalen mistet kilden sin.
 */
export const HOPP_COOKIE = 'mycelet_hopp';
export const HOPP_COOKIE_MAX_AGE = 60;

/** 30 dager. Lenge nok til at et besøk i uka og en registrering i helga henger sammen. */
export const KILDE_COOKIE_MAX_AGE = 30 * 24 * 3600;

const MAKS_LENGDE = 80;

/** Bare ASCII i cookieverdien, så den overlever ukodet i alle nettlesere. */
const KIND_ASCII: Record<TrafficSource['kind'], string> = {
  søk: 'sok',
  sosialt: 'sosialt',
  henvisning: 'henvisning',
  direkte: 'direkte',
  intern: 'intern'
};

function vask(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9._:/-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAKS_LENGDE);
}

/**
 * Hva som skal stå i cookien for et forsidebesøk, eller null hvis besøket
 * ikke forteller noe (direkte, eller et klikk inne på siden).
 *
 * Med kampanjemerking i lenka (utm_source, og gjerne utm_campaign) blir det
 * «kilde/kampanje». Ellers «type:vert», som «sok:google.com».
 */
export function kildeFraBesok(besok: TrafficSource, utmCampaign?: string | null): string | null {
  if (besok.campaign) {
    const kilde = vask(besok.campaign);
    const kampanje = utmCampaign ? vask(utmCampaign) : '';
    if (!kilde) return null;
    return kampanje ? vask(`${kilde}/${kampanje}`) : kilde;
  }
  if (besok.kind === 'direkte' || besok.kind === 'intern') return null;
  return vask(`${KIND_ASCII[besok.kind]}:${besok.host ?? 'ukjent'}`) || null;
}

/**
 * Renser en verdi som kommer utenfra — cookie eller user_metadata — til det
 * samme formatet. Alt annet enn en kort tekst blir null.
 */
export function normaliserKilde(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw;
  try {
    s = decodeURIComponent(raw);
  } catch {
    // Beholder råverdien; vask fjerner det som ikke hører hjemme.
  }
  return vask(s) || null;
}

/**
 * Leser `mycelet_kilde` fra en cookie-streng — `document.cookie` i nettleseren,
 * eller `Cookie`-headeren på serveren. Begge har formatet «a=1; b=2».
 */
export function lesKildeCookie(cookieString: string | null | undefined): string | null {
  if (!cookieString) return null;
  for (const del of cookieString.split(';')) {
    const [navn, ...rest] = del.split('=');
    if (navn?.trim() === KILDE_COOKIE) return normaliserKilde(rest.join('='));
  }
  return null;
}

/**
 * Stier der et første besøk kan fortelle hvor noen kom fra. API-kall,
 * innloggingsflyt og filer er aldri «inngangen» — en OAuth-retur til
 * /auth/callback fra accounts.google.com ville ellers blitt «sok:…».
 */
export function erInngangssti(pathname: string): boolean {
  // /auth/login og /auth/register er legitime inngangssider (en partner kan
  // lenke rett til registrering); bare OAuth-returen er utelatt.
  if (pathname.startsWith('/api/') || pathname.startsWith('/auth/callback') || pathname.startsWith('/_next/')) return false;
  if (/\.[a-z0-9]{2,5}$/i.test(pathname)) return false;
  return true;
}

/**
 * Verter som sender folk TILBAKE til oss uten å være en kilde: e-postklienter
 * (bekreftelseslenka i Gmail), innloggingsleverandører og betalingsretur.
 * classifyTrafficSource ville kalt mail.google.com et søk.
 */
const IKKE_KILDE_VERTER = [
  'mail.google.',
  'mail.',
  'mail2.',
  'webmail.',
  'outlook.',
  'icloud.',
  'fastmail.',
  'proton.',
  'protonmail.',
  'epost.',
  'e-post.',
  'accounts.google.',
  'appleid.apple.',
  'checkout.stripe.',
  'billing.stripe.',
  'login.',
  'auth.'
];

function erIkkeKildeVert(referer: string | null | undefined): boolean {
  if (!referer) return false;
  try {
    const host = new URL(referer).hostname.toLowerCase();
    return IKKE_KILDE_VERTER.some((v) => host === v.replace(/\.$/, '') || host.startsWith(v) || host.includes(`.${v}`));
  } catch {
    return false;
  }
}

/**
 * Hva cookien skal inneholde for denne forespørselen, eller null. Kampanje-
 * merking i lenka (utm/gclid) vinner alltid — en partnerlenke åpnet i Gmail er
 * fortsatt partnerens. Uten merking teller bare ekte eksterne henvisninger.
 */
export function kildeForForesporsel(args: {
  pathname: string;
  referer: string | null | undefined;
  ownHost: string;
  utmSource: string | null;
  utmCampaign: string | null;
  harGclid: boolean;
  /**
   * true når forespørselen er en videresending fra våre egne e-postruter
   * (HOPP_COOKIE satt): da er Referer webmail-verten, ikke en kilde.
   */
  fraEgenEpostrute?: boolean;
}): string | null {
  if (!erInngangssti(args.pathname)) return null;
  if (args.fraEgenEpostrute && !args.utmSource && !args.harGclid) return null;
  const utmSource = args.utmSource ?? (args.harGclid ? 'google' : null);
  const utmCampaign = args.utmCampaign ?? (args.harGclid ? 'annonse' : null);
  if (!utmSource && erIkkeKildeVert(args.referer)) return null;
  const besok = classifyTrafficSource(args.referer, args.ownHost, utmSource);
  return kildeFraBesok(besok, utmCampaign);
}
