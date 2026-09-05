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

import { VARSEL_MIN_SCORE } from '@/lib/alerts/decision';
import { normaliserKilde } from '@/lib/analytics/kilde';
import { PREDICTION_TILE_REGIONS } from '@/lib/prediction/tile-regions';

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

/** Én rad per varselabonnement — konto- og e-postrader om hverandre. */
export interface VarselAbonnentRad {
  user_id: string | null;
  region: string;
  active: boolean;
  confirmed_at: string | null;
  created_at: string;
  last_notified_at: string | null;
  /** Første klikk fra et varsel til områdesiden (/api/soppvarsel/klikk). */
  forste_apnet_at: string | null;
  /** Samme format som BrukerRad.kilde. null = direkte/ukjent. */
  kilde: string | null;
}

export interface RapportInn {
  brukere: BrukerRad[];
  abonnement: AbonnementRad[];
  varselabonnement: number;
  /** Radene bak tallet over — for kilde, region og aktivering. Valgfri for eldre kall. */
  varselabonnenter?: VarselAbonnentRad[];
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
  /**
   * Soppvarselet som trakt (docs/strategi-2026-2027.md § 4): bekreftede
   * abonnenter, nye siste uke, og hvor mange som faktisk åpnet områdets
   * prognose etter et varsel — per kilde og per region. Et klikk under ti
   * minutter etter utsendingen regnes ikke som aktivering: e-postskannere
   * følger GET-lenker ved levering.
   */
  varsel: {
    bekreftede: number;
    nyeSiste7d: number;
    aktiverte: number;
    perKilde: Array<{ kilde: string; bekreftede: number; siste7d: number; aktiverte: number }>;
    perRegion: Array<{ region: string; bekreftede: number }>;
  };
}

export const UKJENT_KILDE = 'ukjent';

/**
 * Terskelen varselet bruker. Sto hardkodet som 85 og gikk ut av takt da
 * varselet ble bundet til regionskalaen (81, PR #242) — rapportens «snudde i
 * natt» ville da vist andre regioner enn de som faktisk fikk varsel.
 */
const VARSEL_TERSKEL = VARSEL_MIN_SCORE;

/** Klikk raskere enn dette etter utsending er trolig en e-postskanner, ikke et menneske. */
export const AKTIVERING_MIN_MS = 10 * 60_000;

/**
 * Aktivert = klikket varsellenka minst AKTIVERING_MIN_MS etter utsendingen.
 * Avgjørelsen tas i klikkøyeblikket (/api/soppvarsel/klikk), som bare setter
 * forste_apnet_at ved et slikt klikk; her leses bare resultatet. Første
 * utgave sammenlignet mot SISTE varsel i rapporten, og da ble et skannerklikk
 * på varsel 1 «aktivert» så snart varsel 2 gikk.
 */
function erAktivert(rad: VarselAbonnentRad): boolean {
  return rad.forste_apnet_at !== null;
}

/** Regionen skal være en av våre — kolonnen er fritekst uten CHECK, og eies av brukeren via RLS. */
const KJENTE_REGIONER = new Set(PREDICTION_TILE_REGIONS.map((r) => r.name));

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

  // ── Soppvarselet som trakt ────────────────────────────────────────────────
  // Radene kommer rått fra en tabell brukeren selv kan skrive i (RLS på egen
  // rad, ingen CHECK på kilde/region). Rens ved innlesing — verdiene ender i
  // en HTML-e-post. Kontorader har ingen egen kilde; de arver kontoens.
  const varselRader = (inn.varselabonnenter ?? []).map((r) => ({
    ...r,
    kilde: normaliserKilde(r.kilde) ?? (r.user_id ? (kildeForBruker.get(r.user_id) ?? null) : null),
    region: KJENTE_REGIONER.has(r.region) ? r.region : 'ukjent område'
  }));
  const erBekreftet = (r: VarselAbonnentRad) => r.active && (r.confirmed_at !== null || r.user_id !== null);
  const bekreftede = varselRader.filter(erBekreftet);
  const nyBekreftet = (r: VarselAbonnentRad) => nyere(r.confirmed_at ?? r.created_at, dag7);
  const varselPerKilde = new Map<string, { bekreftede: number; siste7d: number; aktiverte: number }>();
  for (const r of bekreftede) {
    const k = r.kilde ?? UKJENT_KILDE;
    let t = varselPerKilde.get(k);
    if (!t) varselPerKilde.set(k, (t = { bekreftede: 0, siste7d: 0, aktiverte: 0 }));
    t.bekreftede += 1;
    if (nyBekreftet(r)) t.siste7d += 1;
    if (erAktivert(r)) t.aktiverte += 1;
  }
  const varselPerRegion = new Map<string, number>();
  for (const r of bekreftede) varselPerRegion.set(r.region, (varselPerRegion.get(r.region) ?? 0) + 1);
  const varsel = {
    bekreftede: bekreftede.length,
    nyeSiste7d: bekreftede.filter(nyBekreftet).length,
    aktiverte: bekreftede.filter(erAktivert).length,
    perKilde: [...varselPerKilde.entries()]
      .map(([k, t]) => ({ kilde: k, ...t }))
      .sort((x, y) => {
        if (x.kilde === UKJENT_KILDE) return 1;
        if (y.kilde === UKJENT_KILDE) return -1;
        return y.bekreftede - x.bekreftede || x.kilde.localeCompare(y.kilde);
      }),
    perRegion: [...varselPerRegion.entries()]
      .map(([region, n]) => ({ region, bekreftede: n }))
      .sort((a, b) => b.bekreftede - a.bekreftede || a.region.localeCompare(b.region))
      .slice(0, 5)
  };

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
    kilder,
    varsel
  };
}
