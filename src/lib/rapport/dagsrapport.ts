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
  user_id: string;
  tier: string;
  status: string;
  current_period_end: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface BrukerRad {
  id: string;
  created_at: string;
  last_sign_in_at: string | null;
  /**
   * Hvor de kom fra, fra user_metadata.kilde — se src/lib/analytics/kilde.ts.
   * null for direkte besøk, og for alle som registrerte seg før målingen
   * startet (september 2026).
   */
  kilde: string | null;
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
  /**
   * Hvor de registrerte kom fra, og hvor mange av dem som betaler. Det er
   * dette annonsetesten (docs/google-ads-test.md) skal leses av. Sortert etter
   * antall, med «ukjent» alltid sist — den raden er direkte besøk pluss alle
   * fra før målingen startet, og skal ikke skygge for de navngitte.
   */
  kilder: Array<{ kilde: string; totalt: number; siste7d: number; betalende: number }>;
}

export const UKJENT_KILDE = 'ukjent';

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

  // ── Kilder ────────────────────────────────────────────────────────────────
  const kildeForBruker = new Map(inn.brukere.map((b) => [b.id, b.kilde ?? UKJENT_KILDE]));
  const perKildeTall = new Map<string, { totalt: number; siste7d: number; betalende: number }>();
  const tall = (k: string) => {
    let t = perKildeTall.get(k);
    if (!t) perKildeTall.set(k, (t = { totalt: 0, siste7d: 0, betalende: 0 }));
    return t;
  };
  for (const b of inn.brukere) {
    const t = tall(b.kilde ?? UKJENT_KILDE);
    t.totalt += 1;
    if (nyere(b.created_at, dag7)) t.siste7d += 1;
  }
  // Bare ekte kjøp — et gavepass sier ingenting om kanalen.
  for (const a of aktive) {
    if (kilde(a) === 'manuell') continue;
    tall(kildeForBruker.get(a.user_id) ?? UKJENT_KILDE).betalende += 1;
  }
  const kilder = [...perKildeTall.entries()]
    .map(([k, t]) => ({ kilde: k, ...t }))
    .sort((x, y) => {
      if (x.kilde === UKJENT_KILDE) return 1;
      if (y.kilde === UKJENT_KILDE) return -1;
      return y.totalt - x.totalt || x.kilde.localeCompare(y.kilde);
    });

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
    flanker,
    kilder
  };
}
