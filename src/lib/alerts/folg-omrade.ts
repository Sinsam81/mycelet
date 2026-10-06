/**
 * «Følg området ditt» — regelen bak stripa inne i forsidekortet.
 *
 * ── HVORFOR DEN FINNES ──────────────────────────────────────────────────────
 *
 * Målt 17. september 2026: 89 kontoer siden 1. september, 5 av dem slo på
 * soppvarselet — og alle fem gjorde det i minuttene etter registreringen.
 * Ingen på en senere dag. Å slå det på i dag koster 4–5 trykk og to skjermer
 * rulling nede på profilen, eller det kontoløse skjemaet på en områdeside.
 * Varselet er den ENESTE grunnen appen selv har til å hente noen tilbake, og
 * 30 av 45 septemberbrukere kom bare én gang.
 *
 * ── HVA REGELEN IKKE GJØR ───────────────────────────────────────────────────
 *
 * Abonnementet opprettes bare når brukeren trykker (docs/strategi-2026-2027.md
 * § 1). Ingen forhåndshuket boks, ingen påmelding ved registrering, ingenting
 * som følger med «Start gratis uke». Denne fila avgjør bare NÅR vi har lov til
 * å spørre — aldri om vi kan melde noen på.
 *
 * Og: vi foreslår aldri Oslo eller Stockholm som «ditt område» for en vi ikke
 * har posisjonen til. Standardområdet er et fallback for prognosen, ikke en
 * påstand om hvor noen plukker. Da spør vi i stedet (`velgVariant`).
 */

/** Lagringsnøkkelen for «Ikke nå». Verdien er et ISO-tidspunkt. */
export const FOLG_OMRADE_NOKKEL = 'mycelet:folg-omrade-v1';

/** Hvor lenge et «Ikke nå» varer. Et nei skal vare lenge nok til å bety noe. */
export const FOLG_OMRADE_PAUSE_DAGER = 14;
export const FOLG_OMRADE_PAUSE_MS = FOLG_OMRADE_PAUSE_DAGER * 86_400_000;

/**
 * Kilden som skrives på varselraden (alert_subscriptions.kilde, migrasjon
 * 063), så rapporten kan se hvor mange abonnementer denne flaten faktisk gir.
 * Ingen ny bruksdag-flate: raden vi trenger finnes allerede.
 */
export const FOLG_OMRADE_KILDE = 'hjem-ett-trykk';

/** ISO-tidspunktet et «Ikke nå» skal lagres som. */
export function avvisningsVerdi(naa: number): string {
  return new Date(naa).toISOString();
}

/** Leser lagringsverdien. Ulesbart, tomt eller fraværende = aldri avvist. */
export function tolkAvvisning(raw: string | null | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const tekst = raw.trim();
  if (!tekst) return null;
  const ms = Date.parse(tekst);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Er «Ikke nå» fortsatt i kraft?
 *
 * Et framtidsstempel (enheten hadde feil klokke da nei-et ble lagret) regnes
 * som «nettopp avvist». Å vise stripa igjen med én gang er det motsatte av
 * det brukeren ba om, og klokka retter seg selv.
 */
export function erAvvist(avvistMs: number | null, naa: number): boolean {
  if (avvistMs === null) return false;
  const gaatt = naa - avvistMs;
  if (gaatt < 0) return true;
  return gaatt < FOLG_OMRADE_PAUSE_MS;
}

export interface FolgOmradeVilkar {
  /** Stripa finnes bare for innloggede — den skriver på kontoen. */
  innlogget: boolean;
  /** Kortet har prognosedata. Et tomt kort skal ikke bære et tilbud. */
  harData: boolean;
  /** Brukeren følger alt et område (kontorad, eller en adoptert kontoløs rad). */
  folgerAlt: boolean;
  /** Prøvetilbudsarket ligger over skjermen akkurat nå. Ett spørsmål om gangen. */
  arkApent: boolean;
  /** Rå lagringsverdi fra FOLG_OMRADE_NOKKEL. */
  avvist: string | null | undefined;
  naa: number;
}

export function skalViseFolgOmrade(v: FolgOmradeVilkar): boolean {
  if (!v.innlogget || !v.harData || v.folgerAlt || v.arkApent) return false;
  return !erAvvist(tolkAvvisning(v.avvist), v.naa);
}

/**
 * To varianter, avgjort av hvordan kortet fant området sitt:
 *
 * - `kjent`: kortet regner på brukerens EGEN (eller huskede) posisjon, og den
 *   ligger i eller inntil et av områdene våre. Da kan vi navngi det.
 * - `sporre`: kortet står på standardområdet for språket, eller posisjonen er
 *   ikke i nærheten av noe område vi dekker. Da spør vi hvor hen plukker, og
 *   navngir ingenting.
 */
export type FolgOmradeVariant = { type: 'kjent'; omrade: string } | { type: 'sporre' };

export function velgVariant(args: { kilde: 'egen' | 'standard'; omrade: string | null }): FolgOmradeVariant {
  if (args.kilde === 'egen' && args.omrade) return { type: 'kjent', omrade: args.omrade };
  return { type: 'sporre' };
}
