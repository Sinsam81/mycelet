/**
 * Taket for bekreftelses-e-poster per adresse i den kontoløse påmeldingen
 * (/api/soppvarsel/pamelding). Reglene bor her, rene og testet; ruta gjør
 * oppslagene. Hele begrunnelsen står under «TAK PER ADRESSE» i ruta.
 *
 * Alt regnes ut fra radens egne tidsstempler — `created_at` og `updated_at`
 * (trigger fra migrasjon 051). For en rad som venter på bekreftelse er
 * `updated_at` i praksis tidspunktet for siste utsending: påmeldingen er det
 * eneste som skriver til en slik rad. (Unntaket er klikk-ruta, for en rad som
 * har fått varsler før og meldt seg på igjen — et klikk på en gammel e-post
 * forskyver da ventetiden, aldri mer.) Ingen ny kolonne, ingen migrasjon.
 */

/** Høyst så mange bekreftelses-e-poster til én adresse per time. */
export const MAKS_BEKREFTELSER_PER_TIME = 3;

/** En rad som venter på bekreftelse får tidligst e-posten på nytt etter dette … */
export const FORSTE_PURRING_ETTER_MS = 10 * 60_000;

/**
 * … og etter den første gjentakelsen ikke oftere enn dette.
 *
 * Ti minutter alene ga seks e-poster i timen per rad til den som bare fortsatte
 * å sende inn — og telleren i minnet nullstilles ved hver kaldstart. Den første
 * gjentakelsen er den som hjelper et menneske («jeg fant ikke e-posten»); den
 * fjerde på en halvtime gjør det ikke.
 */
export const NESTE_PURRING_ETTER_MS = 60 * 60_000;

/** Vinduet tellingen på tvers av områder gjelder. */
export const BEKREFTELSESVINDU_MS = 60 * 60_000;

export interface VentendeRad {
  active: boolean;
  confirmed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function tid(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string') return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Skal vi la være å sende bekreftelsen på nytt fordi den nettopp gikk?
 *
 * Gjelder BARE en rad som er aktiv og ubekreftet. En avmeldt rad har fersk
 * `updated_at` fra selve avmeldingen og skal kunne melde seg på igjen med én
 * gang; en bekreftet rad håndteres av ruta før dette («stille suksess»).
 *
 * Kan ikke tidsstempelet leses, svarer vi nei: da vet vi ikke når den forrige
 * gikk, og et menneske som venter på e-posten sin skal ikke tape på det.
 */
export function nyligBekreftelseSendt(rad: VentendeRad, naaMs: number): boolean {
  if (!rad.active || rad.confirmed_at) return false;
  const sist = tid(rad.updated_at);
  if (sist === null) return false;
  // Aldri rørt siden den ble opprettet → neste utsending er den første
  // gjentakelsen. Ellers har den alt vært sendt på nytt (eller reaktivert).
  const purretFor = tid(rad.created_at) !== sist;
  return naaMs - sist < (purretFor ? NESTE_PURRING_ETTER_MS : FORSTE_PURRING_ETTER_MS);
}

/** Starten på vinduet tellingen på tvers av områder leser, som ISO for databasen. */
export function bekreftelsesvinduFra(naaMs: number): string {
  return new Date(naaMs - BEKREFTELSESVINDU_MS).toISOString();
}
