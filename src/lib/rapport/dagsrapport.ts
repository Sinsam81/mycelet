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
 *
 * ── OG PRØVEN ER IKKE ET SALG ───────────────────────────────────────────────
 *
 * Fram til september 2026 telte status `trialing` som betalende. Sju dager
 * gratis så ut som en kunde, og «prøve → første belastning» — det ene tallet
 * prøvetilbudet skal dømmes på — fantes ikke. Nå er «betalende» bare `active`
 * med løpende periode, og prøvene har sin egen blokk, lest fra
 * `metadata.prove_start` / `metadata.forste_belastning` som webhookene
 * skriver (src/lib/billing/prove-merke.ts).
 */

import { VARSEL_MIN_SCORE } from '@/lib/alerts/decision';
import { normaliserKilde } from '@/lib/analytics/kilde';
import { lesProveMerke } from '@/lib/billing/prove-merke';
import { TILBUD_UTLOSERE, dagenEtter, isoUke, osloDag, type Flate } from '@/lib/bruk/bruksdag';
import { summerTellinger, tomTellinger, type Tellinger, type TellingRad } from '@/lib/bruk/tell';
import { PREDICTION_TILE_REGIONS } from '@/lib/prediction/tile-regions';
import { byggRegistreringsblokk, type Registreringsblokk, type SoppregistreringRad } from '@/lib/rapport/soppregistreringer';

export type Betalingskilde = 'stripe' | 'revenuecat' | 'manuell';

export interface AbonnementRad {
  user_id: string;
  tier: string;
  status: string;
  current_period_end: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  /** Oppsagt, men løper ut perioden. Valgfri for eldre kall. */
  cancel_at_period_end?: boolean | null;
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
  /**
   * Enhetens tidssone ved registrering (user_metadata.tidssone, fra
   * september 2026) — «Europe/Oslo» mot «Europe/Stockholm» er det eneste
   * landsignalet vi har. null/undefined = ukjent (eldre kontoer, OAuth).
   */
  tidssone?: string | null;
  /**
   * user_metadata.plattform: «ios» / «android» for kontoer laget i appen,
   * ellers null (nettet). Valgfri for eldre kall.
   */
  plattform?: string | null;
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

/** Én rad per bruker, Oslo-dato og flate der soppforholdene ble vist (migrasjon 064). */
export interface BruksdagRad {
  user_id: string;
  /** YYYY-MM-DD */
  dag: string;
  flate: string;
  /** Områdeslug, «egen»/«standard» på hjem, utløseren på tilbud — tom ellers. Valgfri for eldre kall. */
  omrade?: string;
}

export interface RapportInn {
  brukere: BrukerRad[];
  abonnement: AbonnementRad[];
  varselabonnement: number;
  /** Radene bak tallet over — for kilde, region og aktivering. Valgfri for eldre kall. */
  varselabonnenter?: VarselAbonnentRad[];
  /** Bruksdager siste 28 dager. undefined = ikke målt (rapporten sier det). */
  bruksdager?: BruksdagRad[];
  /**
   * Radene for den nyeste utgaven av soppregistreringer i år (migrasjon 071).
   * [] = ikke målt ennå, undefined = tabellen svarte ikke.
   */
  soppregistreringer?: SoppregistreringRad[];
  /**
   * Kontoer som følger minst ett område — koblet på user_id ELLER samme
   * e-post (se kontoerSomFolgerOmrade). Bare id-er: e-postene blir igjen i
   * ruten. undefined = ikke målt.
   */
  kontoerSomFolger?: ReadonlySet<string>;
  /**
   * Anonyme flatetellinger siste 7 dager (migrasjon 070): første skjerm i
   * appen utlogget og registreringsskjemaet, per dag og språk. undefined =
   * ikke målt (rapporten sier det).
   */
  flatetellinger?: TellingRad[];
  /**
   * Interne kontoer (QA-brukeren, Apples demokonto): et App Store-kjøp gjort
   * for å teste kjøpsflyten ser identisk ut med et kundekjøp i tabellen —
   * provider «revenuecat», miljø PRODUCTION. Målt 6. september 2026: det ene
   * «betalt via App Store» i rapporten var QA-kontoen. Disse telles som
   * «gavepass og testkontoer», aldri som salg.
   */
  interneBrukere?: Set<string>;
  /** Regionscorer for i dag og i går, til «hva skjedde i skogen». */
  regionerIDag: Array<{ region: string; score: number }>;
  regionerIGar: Array<{ region: string; score: number }>;
  naa: Date;
}

export interface Dagsrapport {
  nyeBrukere: {
    siste24t: number;
    siste7d: number;
    totalt: number;
    /** Nye siste 7 dager per tidssone — landsignalet. «ukjent» alltid sist. */
    perTidssone7d: Array<{ tidssone: string; antall: number }>;
  };
  /** Registrerte som aldri kom tilbake. Den mest ærlige enkeltmålingen vi har. */
  aldriInnloggetIgjen: number;
  /** Bare status `active` med løpende periode — prøver telles under `prover`. */
  betalende: { totalt: number; perKilde: Record<Betalingskilde, number>; nyeSiste7d: number };
  /**
   * Prøveperioder (ekte butikkrader, aldri gavepass eller interne kontoer).
   * «gikk til betaling» leses av metadata.forste_belastning etter
   * metadata.prove_start; rader fra før merkingen (september 2026) kan ikke
   * telles der, og står som prøve bare så lenge status er trialing.
   */
  prover: {
    lopende: number;
    startetSiste7d: number;
    /**
     * Startet siste 7 dager, delt på plan: sesongpass mot måned. Det er dette
     * «sesongpass først» (arket og prissiden leder med passet fra 22. sep 2026)
     * skal dømmes på — 7 av 8 prøver før det valgte måned.
     */
    startetSiste7dPerPlan: { pass: number; maaned: number };
    gikkTilBetaling: number;
    gikkTilBetalingSiste7d: number;
    avbrutt: number;
  };
  /** Rader som SIER aktiv eller prøve, men der perioden er ute. Overses de, blåses tallet opp. */
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
  /**
   * Soppregistreringer, samme dato som før (migrasjon 071): nyeste utgave i
   * år. maalt=false når tabellen ikke svarte; blokk=null når ingen utgave er
   * målt ennå. Registreringsaktivitet, ikke soppmengde.
   */
  registreringer: { maalt: boolean; blokk: Registreringsblokk | null };
  /**
   * Nye kontoer siste 14 dager som følger et område (soppvarsel på konto
   * eller på samme e-post uten konto), per plattform. maalt=false når
   * koblingen ikke ble gjort.
   */
  nyeKontoerFolger: { maalt: boolean; perPlattform: Record<Plattform, { folger: number; nye: number }> };
  /**
   * Bruk av soppforholdene blant innloggede (docs/strategi-2026-2027.md § 4).
   * «Kom tilbake» = så forholdene på en SENERE dag enn registreringsdagen —
   * forsidekortet vises automatisk rett etter registrering, så samme dag
   * beviser ingenting. «Gjenbruk» = bruksdager i to ulike ISO-uker siste
   * 28 dager. Måles fra 6. september 2026; før det finnes ingen rader.
   * «steder» (Mine steder) fra migrasjon 066 — tallet vinterplanen trenger
   * for å avgjøre områdekartoteket.
   */
  bruk: {
    maalt: boolean;
    brukereSiste7d: number;
    perFlate: Record<Flate, number>;
    nyeSiste14d: number;
    komTilbake: number;
    perKilde: Array<{ kilde: string; nye: number; komTilbake: number }>;
    gjenbruk28d: number;
    /**
     * Prøvetilbudet som trakt, siste 7 dager: brukere som fikk arket vist per
     * utløser (omrade-kolonnen på tilbud-raden), og hvor mange av dem som så
     * prissiden samme dag eller dagen etter. «ukjent» = rader uten utløser
     * (fra før bølge 1), alltid sist.
     */
    tilbud: Array<{ utloser: string; vist: number; tilPris: number }>;
  };
  /**
   * Anonyme tellinger før konto i appen, siste 7 dager per språk
   * (migrasjon 070). maalt=false når tabellen ikke svarte.
   */
  tellinger: { maalt: boolean; siste7d: Tellinger };
}

export const UKJENT_KILDE = 'ukjent';

export type Plattform = 'ios' | 'android' | 'web';

/** Plattformen kontoen ble laget på. Alt uten «ios»/«android» er nettet. */
export function plattformFor(b: Pick<BrukerRad, 'plattform'>): Plattform {
  return b.plattform === 'ios' || b.plattform === 'android' ? b.plattform : 'web';
}

/** Det minste varselraden må ha for å avgjøre «følger et område». */
export interface FolgerRad {
  user_id: string | null;
  email: string | null;
  active: boolean;
  confirmed_at: string | null;
}

/**
 * Hvilke kontoer følger minst ett område? En konto kan følge på to måter:
 * en rad med egen user_id (skrudd på i appen), eller en kontoløs påmelding
 * på samme e-postadresse (skjemaet på /soppvarsel, ofte FØR kontoen ble
 * laget). Kontoer laget 1.–16. september 2026: 5 av 89 fulgte et område,
 * 3 av dem via skjemaet — uten e-postkoblingen hadde de manglet.
 *
 * Samme regel for «følger» som varseltrakten: aktiv, og bekreftet (en
 * kontorad er bekreftet i kraft av kontoen). E-post sammenlignes trimmet og
 * med små bokstaver, bare i minnet; svaret er id-er, aldri adresser.
 */
export function kontoerSomFolgerOmrade(
  kontoer: ReadonlyArray<{ id: string; email: string | null | undefined }>,
  rader: readonly FolgerRad[]
): Set<string> {
  const vask = (e: string | null | undefined) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
  const folger = new Set<string>();
  const eposter = new Set<string>();
  for (const r of rader) {
    if (!r.active) continue;
    if (r.user_id) folger.add(r.user_id);
    else if (r.confirmed_at !== null && vask(r.email)) eposter.add(vask(r.email));
  }
  const kjente = new Set<string>();
  for (const k of kontoer) {
    kjente.add(k.id);
    if (eposter.has(vask(k.email))) folger.add(k.id);
  }
  // Bare id-er som faktisk er kontoer: en rad kan peke på en slettet bruker.
  return new Set([...folger].filter((id) => kjente.has(id)));
}

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

function kilde(rad: AbonnementRad, interne?: Set<string>): Betalingskilde {
  if (interne?.has(rad.user_id)) return 'manuell';
  const p = rad.metadata?.provider;
  if (p === 'stripe') return 'stripe';
  if (p === 'revenuecat') return 'revenuecat';
  return 'manuell';
}

function periodeLoper(rad: AbonnementRad, naa: Date): boolean {
  // Ingen sluttdato = løper til noe annet sier stopp. Sjeldent, men gyldig.
  if (!rad.current_period_end) return true;
  return new Date(rad.current_period_end).getTime() > naa.getTime();
}

/** Betalende = status active OG perioden løper. `trialing` er en prøve, ikke en kunde. */
function erBetalende(rad: AbonnementRad, naa: Date): boolean {
  return rad.status === 'active' && periodeLoper(rad, naa);
}

function erProvende(rad: AbonnementRad, naa: Date): boolean {
  return rad.status === 'trialing' && periodeLoper(rad, naa);
}

/** Dagen pengene faktisk flyttet seg: første belastning etter prøve, ellers radens opprettelse. */
function kjopsdato(rad: AbonnementRad): string {
  return lesProveMerke(rad.metadata, 'forste_belastning') ?? rad.created_at;
}

export function byggDagsrapport(inn: RapportInn): Dagsrapport {
  const naa = inn.naa.getTime();
  const time24 = 24 * 3600_000;
  const dag7 = 7 * time24;

  const nyere = (iso: string, vindu: number) => naa - new Date(iso).getTime() <= vindu;

  const aktive = inn.abonnement.filter((a) => erBetalende(a, inn.naa));
  const kildeAv = (a: AbonnementRad) => kilde(a, inn.interneBrukere);
  const perKilde: Record<Betalingskilde, number> = { stripe: 0, revenuecat: 0, manuell: 0 };
  for (const a of aktive) perKilde[kildeAv(a)] += 1;

  // ── Prøver ────────────────────────────────────────────────────────────────
  // Bare butikkrader: et gavepass med status trialing er ikke en prøve, og
  // QA-kontoens sandkasseprøve er ikke en kunde på vei inn.
  const butikkRader = inn.abonnement.filter((a) => kildeAv(a) !== 'manuell');
  const proveStart = (a: AbonnementRad) => lesProveMerke(a.metadata, 'prove_start') ?? (a.status === 'trialing' ? a.created_at : null);
  const forsteBelastning = (a: AbonnementRad) => {
    const b = lesProveMerke(a.metadata, 'forste_belastning');
    const s = lesProveMerke(a.metadata, 'prove_start');
    return b && s && new Date(b).getTime() > new Date(s).getTime() ? b : null;
  };
  const startetSiste7d = butikkRader.filter((a) => {
    const s = proveStart(a);
    return s !== null && nyere(s, dag7);
  });
  const prover = {
    lopende: butikkRader.filter((a) => erProvende(a, inn.naa)).length,
    startetSiste7d: startetSiste7d.length,
    startetSiste7dPerPlan: {
      pass: startetSiste7d.filter((a) => a.tier === 'season_pass').length,
      maaned: startetSiste7d.filter((a) => a.tier !== 'season_pass').length
    },
    gikkTilBetaling: butikkRader.filter((a) => forsteBelastning(a) !== null).length,
    gikkTilBetalingSiste7d: butikkRader.filter((a) => {
      const b = forsteBelastning(a);
      return b !== null && nyere(b, dag7);
    }).length,
    // Avbrutt: sagt opp midt i prøven (løper ut), eller en merket prøve som
    // endte uten belastning (canceled, unpaid, incomplete_expired …).
    avbrutt: butikkRader.filter((a) => {
      if (a.status === 'trialing') return a.cancel_at_period_end === true;
      if (a.status === 'active') return false;
      return lesProveMerke(a.metadata, 'prove_start') !== null && forsteBelastning(a) === null;
    }).length
  };

  // ── Land: tidssone ved registrering ───────────────────────────────────────
  const perTidssone = new Map<string, number>();
  for (const b of inn.brukere) {
    if (!nyere(b.created_at, dag7)) continue;
    const t = b.tidssone ?? UKJENT_KILDE;
    perTidssone.set(t, (perTidssone.get(t) ?? 0) + 1);
  }
  const perTidssone7d = [...perTidssone.entries()]
    .map(([tidssone, antall]) => ({ tidssone, antall }))
    .sort((x, y) => {
      if (x.tidssone === UKJENT_KILDE) return 1;
      if (y.tidssone === UKJENT_KILDE) return -1;
      return y.antall - x.antall || x.tidssone.localeCompare(y.tidssone);
    });

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
    if (kildeAv(a) === 'manuell') continue;
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

  // ── Bruk av soppforholdene ────────────────────────────────────────────────
  const bruk = byggBruk(inn, naa, kildeForBruker);

  const flanker: Array<{ region: string; fra: number; til: number }> = [];
  const igar = new Map(inn.regionerIGar.map((r) => [r.region, r.score]));
  for (const r of inn.regionerIDag) {
    const f = igar.get(r.region);
    if (f !== undefined && f < VARSEL_TERSKEL && r.score >= VARSEL_TERSKEL) {
      flanker.push({ region: r.region, fra: f, til: r.score });
    }
  }

  // Nye kontoer (14 d) som følger et område, per plattform.
  const perPlattform: Record<Plattform, { folger: number; nye: number }> = {
    ios: { folger: 0, nye: 0 },
    android: { folger: 0, nye: 0 },
    web: { folger: 0, nye: 0 }
  };
  for (const b of inn.brukere) {
    if (!nyere(b.created_at, 14 * time24)) continue;
    const p = perPlattform[plattformFor(b)];
    p.nye += 1;
    if (inn.kontoerSomFolger?.has(b.id)) p.folger += 1;
  }

  // Tellingene før konto: siste 7 dager i Oslo-dato, som bruksdagene.
  const tellingsGrense = osloDag(new Date(naa - 6 * 24 * 3600_000));
  const tellinger = inn.flatetellinger
    ? { maalt: true, siste7d: summerTellinger(inn.flatetellinger, tellingsGrense) }
    : { maalt: false, siste7d: tomTellinger() };

  return {
    nyeBrukere: {
      siste24t: inn.brukere.filter((b) => nyere(b.created_at, time24)).length,
      siste7d: inn.brukere.filter((b) => nyere(b.created_at, dag7)).length,
      totalt: inn.brukere.length,
      perTidssone7d
    },
    aldriInnloggetIgjen: inn.brukere.filter((b) => !b.last_sign_in_at).length,
    betalende: {
      totalt: aktive.length,
      perKilde,
      // Bare ekte kjøp teller som nytt salg. Et gavepass er ikke en kunde, og
      // en prøve som konverterte teller den dagen den ble belastet — ikke
      // dagen raden ble opprettet.
      nyeSiste7d: aktive.filter((a) => kildeAv(a) !== 'manuell' && nyere(kjopsdato(a), dag7)).length
    },
    prover,
    utloptMenMarkertAktiv: inn.abonnement.filter(
      (a) => (a.status === 'active' || a.status === 'trialing') && !periodeLoper(a, inn.naa)
    ).length,
    varselabonnement: inn.varselabonnement,
    toppRegioner: [...inn.regionerIDag].sort((a, b) => b.score - a.score).slice(0, 3),
    flanker,
    kilder,
    varsel,
    bruk,
    tellinger,
    registreringer: inn.soppregistreringer
      ? { maalt: true, blokk: byggRegistreringsblokk(inn.soppregistreringer) }
      : { maalt: false, blokk: null },
    nyeKontoerFolger: { maalt: inn.kontoerSomFolger !== undefined, perPlattform }
  };
}

function byggBruk(inn: RapportInn, naa: number, kildeForBruker: Map<string, string>): Dagsrapport['bruk'] {
  const tomt: Record<Flate, number> = { hjem: 0, kart: 0, omrade: 0, steder: 0, pris: 0, tilbud: 0 };
  const dag14 = 14 * 24 * 3600_000;
  const nye = inn.brukere.filter((b) => naa - new Date(b.created_at).getTime() <= dag14);
  if (!inn.bruksdager) {
    return { maalt: false, brukereSiste7d: 0, perFlate: tomt, nyeSiste14d: nye.length, komTilbake: 0, perKilde: [], gjenbruk28d: 0, tilbud: [] };
  }

  // Dagsgrenser i Oslo-dato, som radene. «Siste 7 dager» = i dag og seks før.
  const grense7 = osloDag(new Date(naa - 6 * 24 * 3600_000));
  const grense28 = osloDag(new Date(naa - 27 * 24 * 3600_000));
  const rader = inn.bruksdager.filter((r) => r.dag >= grense28);
  // Prissiden og tilbudet er traktflater, ikke bruk av soppforholdene: de
  // teller i perFlate (sløyfa under), men aldri i «så forholdene», «kom
  // tilbake» eller gjenbruk.

  const brukereSiste7d = new Set<string>();
  const perFlateSett: Record<Flate, Set<string>> = { hjem: new Set(), kart: new Set(), omrade: new Set(), steder: new Set(), pris: new Set(), tilbud: new Set() };
  const ukerPerBruker = new Map<string, Set<string>>();
  const dagerPerBruker = new Map<string, string[]>();
  // Trakten ark → pris: tilbud-rader siste 7 dager med utløser, og alle
  // prissidedager (28 d) per bruker, så «dagen etter» også finnes for et
  // ark vist på vinduets siste dag.
  const tilbudRader: Array<{ user_id: string; dag: string; utloser: string }> = [];
  const prisDager = new Map<string, Set<string>>();
  for (const r of rader) {
    if (r.flate === 'pris' || r.flate === 'tilbud') {
      if (r.dag >= grense7) perFlateSett[r.flate].add(r.user_id);
      if (r.flate === 'pris') {
        let d = prisDager.get(r.user_id);
        if (!d) prisDager.set(r.user_id, (d = new Set()));
        d.add(r.dag);
      } else if (r.dag >= grense7) {
        const u = r.omrade ?? '';
        tilbudRader.push({ user_id: r.user_id, dag: r.dag, utloser: (TILBUD_UTLOSERE as readonly string[]).includes(u) ? u : UKJENT_KILDE });
      }
      continue;
    }
    let dager = dagerPerBruker.get(r.user_id);
    if (!dager) dagerPerBruker.set(r.user_id, (dager = []));
    dager.push(r.dag);
    let uker = ukerPerBruker.get(r.user_id);
    if (!uker) ukerPerBruker.set(r.user_id, (uker = new Set()));
    uker.add(isoUke(r.dag));
    if (r.dag >= grense7) {
      brukereSiste7d.add(r.user_id);
      if (r.flate in perFlateSett) perFlateSett[r.flate as Flate].add(r.user_id);
    }
  }

  // Kom tilbake: en bruksdag ETTER registreringsdagen (Oslo-dato begge).
  const komTilbakeSett = new Set<string>();
  for (const b of nye) {
    const registrert = osloDag(new Date(b.created_at));
    if ((dagerPerBruker.get(b.id) ?? []).some((d) => d > registrert)) komTilbakeSett.add(b.id);
  }
  const perKildeTall = new Map<string, { nye: number; komTilbake: number }>();
  for (const b of nye) {
    const k = kildeForBruker.get(b.id) ?? UKJENT_KILDE;
    let t = perKildeTall.get(k);
    if (!t) perKildeTall.set(k, (t = { nye: 0, komTilbake: 0 }));
    t.nye += 1;
    if (komTilbakeSett.has(b.id)) t.komTilbake += 1;
  }

  // Per utløser: brukere som fikk arket vist, og hvor mange av dem som så
  // prissiden samme dag eller dagen etter. En bruker teller én gang per
  // utløser, og som «til pris» hvis NOEN av visningene ble fulgt opp.
  const perUtloser = new Map<string, { vist: Set<string>; tilPris: Set<string> }>();
  for (const t of tilbudRader) {
    let u = perUtloser.get(t.utloser);
    if (!u) perUtloser.set(t.utloser, (u = { vist: new Set(), tilPris: new Set() }));
    u.vist.add(t.user_id);
    const pris = prisDager.get(t.user_id);
    if (pris && (pris.has(t.dag) || pris.has(dagenEtter(t.dag)))) u.tilPris.add(t.user_id);
  }
  const tilbud = [...perUtloser.entries()]
    .map(([utloser, u]) => ({ utloser, vist: u.vist.size, tilPris: u.tilPris.size }))
    .sort((x, y) => {
      if (x.utloser === UKJENT_KILDE) return 1;
      if (y.utloser === UKJENT_KILDE) return -1;
      return y.vist - x.vist || x.utloser.localeCompare(y.utloser);
    });

  return {
    maalt: true,
    brukereSiste7d: brukereSiste7d.size,
    perFlate: {
      hjem: perFlateSett.hjem.size,
      kart: perFlateSett.kart.size,
      omrade: perFlateSett.omrade.size,
      steder: perFlateSett.steder.size,
      pris: perFlateSett.pris.size,
      tilbud: perFlateSett.tilbud.size
    },
    nyeSiste14d: nye.length,
    komTilbake: komTilbakeSett.size,
    perKilde: [...perKildeTall.entries()]
      .map(([k, t]) => ({ kilde: k, ...t }))
      .sort((x, y) => {
        if (x.kilde === UKJENT_KILDE) return 1;
        if (y.kilde === UKJENT_KILDE) return -1;
        return y.nye - x.nye || x.kilde.localeCompare(y.kilde);
      }),
    gjenbruk28d: [...ukerPerBruker.values()].filter((u) => u.size >= 2).length,
    tilbud
  };
}
