/**
 * Prøvemerker i `billing_subscriptions.metadata` — når prøveperioden startet,
 * og når kunden faktisk ble belastet første gang.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVORFOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dagsrapporten telte status «trialing» som betalende (september 2026). En
 * uke med sju dager gratis så da ut som sju kunder, og «prøve → første
 * belastning», det ene tallet prøvetilbudet skal dømmes på, fantes ikke: når
 * Stripe flytter et abonnement fra trialing til active, og når RevenueCat
 * sender RENEWAL etter en TRIAL, overskrev begge webhookene metadata uten å
 * ta vare på at det noen gang var en prøve.
 *
 * Begge webhookene bygger metadata fra bunnen ved hver skriving. Derfor er
 * dette én ren funksjon som (1) bærer merkene videre, (2) setter prøvestart
 * første gang raden blir «trialing», og (3) setter første belastning når en
 * rad som var (eller er merket som) prøve blir «active» ved et KJØP.
 *
 * `kjop` skiller ekte penger fra tilstandsendringer: RevenueCats CANCELLATION
 * og BILLING_ISSUE mapper også til status active, og en oppsagt prøve skal
 * ikke stå som konvertert.
 *
 * Nøklene er snake_case som resten av metadata. ISO-tidspunkter.
 */

export const PROVE_START_KEY = 'prove_start';
export const FORSTE_BELASTNING_KEY = 'forste_belastning';

export interface ProveMerker {
  prove_start?: string;
  forste_belastning?: string;
}

/** Radens felter slik hjelperen trenger dem — samme navn som kolonnene. */
export interface ProveRad {
  status?: string | null;
  current_period_start?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ProveHendelse {
  /** Butikkens status for abonnementet, ikke det som skrives etter et manuelt gulv. */
  status: string;
  /** Periodestart i hendelsen — for en prøve prøvestart, for et kjøp belastningen. */
  periodeStart: string | null;
  /** Fallback når hendelsen ikke oppgir noen periode. */
  naa: string;
  /**
   * true når hendelsen betyr at penger har flyttet seg (Stripe: status active
   * fra abonnementet selv; RevenueCat: grant med period_type ≠ TRIAL).
   * false for oppsigelse, regningsproblem og andre tilstandsendringer.
   */
  kjop: boolean;
}

function lesIso(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  return Number.isFinite(new Date(raw).getTime()) ? raw : null;
}

/** Merkene som skal ligge i metadata etter denne hendelsen. Tomt objekt = ingen prøve kjent. */
export function oppdaterProveMerker(eksisterende: ProveRad | null | undefined, hendelse: ProveHendelse): ProveMerker {
  const meta = eksisterende?.metadata ?? null;
  const merker: ProveMerker = {};
  const gammelStart = lesIso(meta?.[PROVE_START_KEY]);
  const gammelBelastning = lesIso(meta?.[FORSTE_BELASTNING_KEY]);
  if (gammelStart) merker.prove_start = gammelStart;
  if (gammelBelastning) merker.forste_belastning = gammelBelastning;

  if (hendelse.status === 'trialing') {
    if (!merker.prove_start) merker.prove_start = hendelse.periodeStart ?? hendelse.naa;
    return merker;
  }

  if (hendelse.status === 'active' && hendelse.kjop && !merker.forste_belastning) {
    // Var dette en prøve? Enten er den merket, eller raden sto som trialing
    // fra før merkingen fantes — da er radens periodestart prøvestarten
    // (Stripe: perioden under en prøve ER prøven).
    const varProve = Boolean(merker.prove_start) || eksisterende?.status === 'trialing';
    if (varProve) {
      if (!merker.prove_start) merker.prove_start = lesIso(eksisterende?.current_period_start) ?? hendelse.naa;
      merker.forste_belastning = hendelse.periodeStart ?? hendelse.naa;
    }
  }

  return merker;
}

/** Lesehjelp for rapporten: ISO-tidspunkt eller null, aldri en streng som ikke er en dato. */
export function lesProveMerke(metadata: Record<string, unknown> | null | undefined, nokkel: typeof PROVE_START_KEY | typeof FORSTE_BELASTNING_KEY): string | null {
  return lesIso(metadata?.[nokkel]);
}
