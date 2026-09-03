/**
 * Dagsrapporten: hva skjedde med Mycelet i går?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVORFOR DENNE FINNES SOM EN REN FUNKSJON
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * En rapport som lyver er verre enn ingen rapport: den fjerner grunnen til å
 * gå og se etter selv. Tallene her styrer om eieren bruker en kveld på
 * soppforeningene eller lener seg tilbake, så de må tåle å bli sjekket.
 *
 * Derfor er utregningen skilt fra e-posten og fra databasen, og testet.
 *
 * ── FELLA SOM GJORDE DETTE NØDVENDIG ────────────────────────────────────────
 *
 * `billing_subscriptions.status` sier `active` også når `current_period_end`
 * ligger i fortiden. Målt i produksjon 2026-08-13: seks rader med status
 * `active`, hvorav én utløp 2. juli. En telling på status alene ville meldt
 * seks betalende kunder til en som har én.
 *
 * Et abonnement teller derfor bare når BEGGE deler stemmer: status er aktiv OG
 * perioden løper ennå.
 *
 * ── OG SKILLET SOM BETYR ENDA MER ───────────────────────────────────────────
 *
 * Ikke alle aktive abonnement er inntekt. Grunnleggerpasset, demokontoen Apple
 * bruker, og sandbox-kjøpene fra testingen ser identiske ut i tabellen. Skilles
 * de ikke, ser det ut som seks kunder betaler for noe én betaler for.
 *
 * `metadata.provider` er det eneste som skiller dem: `stripe` eller
 * `revenuecat` betyr at penger har flyttet seg. Mangler feltet, er raden satt
 * inn for hånd — et gavepass, ikke et salg.
 */

export type Betalingskilde = 'stripe' | 'revenuecat' | 'manuell';

export interface AbonnementRad {
  tier: string;
  status: string;
  current_period_end: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface BrukerRad {
  created_at: string;
  last_sign_in_at: string | null;
}

export interface RapportInn {
  brukere: BrukerRad[];
  abonnement: AbonnementRad[];
  varselabonnement: number;
  /** Regionscorer for i dag og i går, til «hva skjedde i skogen». */
  regionerIDag: Array<{ region: string; score: number }>;
  regionerIGar: Array<{ region: string; score: number }>;
  naa: Date;
}

export interface Dagsrapport {
  nyeBrukere: { siste24t: number; siste7d: number; totalt: number };
  /** Registrerte som aldri kom tilbake. Den mest ærlige enkeltmålingen vi har. */
  aldriInnloggetIgjen: number;
  betalende: { totalt: number; perKilde: Record<Betalingskilde, number>; nyeSiste7d: number };
  /** Rader som SIER aktiv, men der perioden er ute. Overses de, blåses tallet opp. */
  utloptMenMarkertAktiv: number;
  varselabonnement: number;
  toppRegioner: Array<{ region: string; score: number }>;
  /** Regioner som krysset varselterskelen i natt. */
  flanker: Array<{ region: string; fra: number; til: number }>;
}

/** Terskelen varselet bruker. Importeres ikke, for å holde modulen fri for UI-kode. */
const VARSEL_TERSKEL = 85;

function kilde(rad: AbonnementRad): Betalingskilde {
  const p = rad.metadata?.provider;
  if (p === 'stripe') return 'stripe';
  if (p === 'revenuecat') return 'revenuecat';
  return 'manuell';
}

function erReeltAktiv(rad: AbonnementRad, naa: Date): boolean {
  if (rad.status !== 'active' && rad.status !== 'trialing') return false;
  // Ingen sluttdato = løper til noe annet sier stopp. Sjeldent, men gyldig.
  if (!rad.current_period_end) return true;
  return new Date(rad.current_period_end).getTime() > naa.getTime();
}

export function byggDagsrapport(inn: RapportInn): Dagsrapport {
  const naa = inn.naa.getTime();
  const time24 = 24 * 3600_000;
  const dag7 = 7 * time24;

  const nyere = (iso: string, vindu: number) => naa - new Date(iso).getTime() <= vindu;

  const aktive = inn.abonnement.filter((a) => erReeltAktiv(a, inn.naa));
  const perKilde: Record<Betalingskilde, number> = { stripe: 0, revenuecat: 0, manuell: 0 };
  for (const a of aktive) perKilde[kilde(a)] += 1;

  const flanker: Array<{ region: string; fra: number; til: number }> = [];
  const igar = new Map(inn.regionerIGar.map((r) => [r.region, r.score]));
  for (const r of inn.regionerIDag) {
    const f = igar.get(r.region);
    if (f !== undefined && f < VARSEL_TERSKEL && r.score >= VARSEL_TERSKEL) {
      flanker.push({ region: r.region, fra: f, til: r.score });
    }
  }

  return {
    nyeBrukere: {
      siste24t: inn.brukere.filter((b) => nyere(b.created_at, time24)).length,
      siste7d: inn.brukere.filter((b) => nyere(b.created_at, dag7)).length,
      totalt: inn.brukere.length
    },
    aldriInnloggetIgjen: inn.brukere.filter((b) => !b.last_sign_in_at).length,
    betalende: {
      totalt: aktive.length,
      perKilde,
      // Bare ekte kjøp teller som nytt salg. Et gavepass er ikke en kunde.
      nyeSiste7d: aktive.filter((a) => kilde(a) !== 'manuell' && nyere(a.created_at, dag7)).length
    },
    utloptMenMarkertAktiv: inn.abonnement.filter(
      (a) => a.status === 'active' && !erReeltAktiv(a, inn.naa)
    ).length,
    varselabonnement: inn.varselabonnement,
    toppRegioner: [...inn.regionerIDag].sort((a, b) => b.score - a.score).slice(0, 3),
    flanker
  };
}
