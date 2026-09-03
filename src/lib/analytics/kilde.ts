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
 * Cookien settes kun på forsiden (`/`) — samme sted som besøket logges.
 * Direkte besøk og interne klikk setter ingen cookie: de er «ukjent», og
 * rapporten sier det.
 */

import type { TrafficSource } from './traffic-source';

export const KILDE_COOKIE = 'mycelet_kilde';

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
