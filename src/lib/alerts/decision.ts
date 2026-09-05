import { REGION_CONDITION_THRESHOLDS } from '@/lib/prediction/region-score';

/**
 * Når skal et soppvarsel sendes?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DETTE ER HELE FUNKSJONEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Å sende e-post er trivielt. Å sende den på RIKTIG DAG er hele produktet, og
 * det er her en varslingsfunksjon dør: sender den for ofte, slår folk den av
 * og kommer aldri tilbake. Sender den for sjelden, går sesongen forbi.
 *
 * Konkurrentnotatene mine lister «push-spam» som et av mønstrene vi bevisst
 * skal unngå. Derfor er regelen her strengere enn den trenger å være.
 *
 * ── Hvorfor en FLANKE, ikke et nivå ──────────────────────────────────────────
 *
 * Det opplagte er «varsle når det er bra». Det er feil. Terskelen er
 * regionskalaens topp-dom («excellent», p90 over regiondøgn — se
 * region-score.ts), og selv den passeres omtrent hver sjette dag i sesong
 * (18 % av 562 regiondøgn, 11.08–05.09.2026). En nivåregel ville altså sendt
 * e-post hver uke i august uansett hva som skjedde. Det er ikke et varsel,
 * det er en abonnementsavis ingen har bedt om.
 *
 * Vi varsler derfor på OVERGANGEN: i går under terskelen, i dag over. Det er
 * øyeblikket som faktisk er nyheten — «det snudde i natt» — og det er det eneste
 * øyeblikket en e-post forteller noe mottakeren ikke kunne gjettet selv.
 *
 * Flanken løser også tilbakefallet: går det fra 90 ned til 50 og opp til 88
 * igjen to uker senere, er DET en ny nyhet. En regel som bare sammenlignet med
 * forrige varslede verdi (88 < 90) ville tiet.
 *
 * ── Karantenen ──────────────────────────────────────────────────────────────
 *
 * Været kan vippe rundt terskelen i dagevis. Uten karantene ville en uke med
 * 80-82-80-83 gitt tre e-poster om samme værsituasjon. Én per uke er taket,
 * uansett hvor mange ganger flanken krysses.
 *
 * ── Hva vi IKKE lover ───────────────────────────────────────────────────────
 *
 * Tallet er vær, sesong og skogtype for et OMRÅDE. Det sier ingenting om
 * skogen der mottakeren står. E-posten må formuleres deretter — se alerts/email.ts.
 */

/**
 * Under dette er dagen ikke verdt en e-post.
 *
 * ⚠️ REGIONSKALAEN, ikke punkt-stripa. Første utgave importerte
 * FORECAST_GREEN_MIN (85) — grønt på 7-dagersstripa, kalibrert på PUNKT-
 * dagscorer (median 86). Men cronen sender inn regionens score, som er
 * 90-persentilen over ruter og har en helt annen fordeling: der var 85 topp
 * 12 % av døgnene, og 7 av 22 regioner — Oslo og Stockholm blant dem — nådde
 * aldri 85 på 26 dager i august–september 2026. Varselet og X-posten var
 * stumme i de største markedene gjennom høysesongen, og docstringen over
 * («halvparten av dagene») beskrev en fordeling som aldri kom inn hit.
 *
 * Terskelen er nå bundet til regionstigen, så en justering av punkt-skalaen
 * aldri flytter varselet i stillhet, og nivået ER topp-dommen på /soppforhold:
 * «det snudde» i e-posten og «utmerket» på siden er samme påstand. Måles på
 * nytt med scripts/kalibrer-regionterskler.mjs etter sesongen.
 */
export const VARSEL_MIN_SCORE: number = REGION_CONDITION_THRESHOLDS.excellent;

/**
 * Minste antall dager mellom to varsler til samme abonnement.
 *
 * Sju er valgt fordi soppturer er en helgeaktivitet for de fleste: et varsel i
 * uka treffer planleggingsvinduet uten å bli støy. Se også helgeandelen i
 * docs/artikkelutkast/hva-viser-soppkartene.md — den er svekket, men finnes.
 */
export const VARSEL_KARANTENE_DAGER = 7;

/**
 * Hvor mye bedre dagen må være enn den dårligste dagen den siste uka.
 *
 * ⚠️ MÅLES MOT UKA, IKKE MOT I GÅR. Første forsøk krevde økningen på ÉN dag, og
 * en test over en hel sesong avslørte hvorfor det er feil: en jevn opptur på
 * 55-61-67-73-79-85 stiger seks poeng om dagen og krysser terskelen uten at noen
 * enkeltdag kvalifiserer. Varselet ville tiet gjennom hele bedringen — akkurat
 * den perioden mottakeren vil høre om.
 *
 * Mot ukas bunn fanges begge tilfellene riktig: den jevne oppturen får 85−55=30
 * og slipper gjennom, mens en flat uke rundt terskelen (80-81-80-81) får 81−80=1
 * og tier. Det siste er poenget — det er støy i modellen, ikke en nyhet.
 */
export const VARSEL_MIN_OKNING = 8;

export interface VarselTilstand {
  /** Regionens score i dag (90-persentilen — «der det er best i regionen»). */
  scoreIDag: number;
  /** Samme tall i går. null når gårsdagens fliser mangler. */
  scoreIGar: number | null;
  /**
   * Laveste score for regionen de siste sju dagene (i dag medregnet).
   * Referansepunktet for at bedringen er reell — se VARSEL_MIN_OKNING.
   */
  lavesteSisteUke: number;
  /** Når vi sist sendte et varsel for dette abonnementet. null = aldri. */
  sistVarsletIso: string | null;
  /** «Nå» — sendes inn så funksjonen er ren og testbar. */
  naa: Date;
  /**
   * Datoen (ÅÅÅÅ-MM-DD) for regionens siste omslag under→over terskelen i
   * historikkvinduet, eller null/utelatt når ingen finnes. Gjør at et varsel
   * som feilet på selve omslagsdagen (Resend nede, nettverksglipp) kan hentes
   * inn igjen dagen etter — se regel 3.
   */
  sisteOmslagIso?: string | null;
}

export type VarselAvslag =
  | 'under-terskel'
  | 'ingen-gaardag'
  | 'var-allerede-bra'
  | 'for-liten-okning'
  | 'i-karantene';

export type VarselBeslutning =
  | { send: true; fra: number; til: number }
  | { send: false; grunn: VarselAvslag };

export function skalVarsle(t: VarselTilstand): VarselBeslutning {
  // 1. Er dagen verdt en tur i det hele tatt?
  if (t.scoreIDag < VARSEL_MIN_SCORE) return { send: false, grunn: 'under-terskel' };

  // 2. Uten gårsdagen finnes ingen flanke. Da tier vi heller enn å gjette —
  //    fliser kan mangle fordi cron-jobben feilet, og et varsel basert på
  //    «vi vet ikke hva det var i går» er et varsel vi ikke kan stå inne for.
  if (t.scoreIGar === null) return { send: false, grunn: 'ingen-gaardag' };

  // 3. Var det bra allerede i går, er ingenting nytt — med ETT unntak: fikk
  //    abonnenten aldri varselet for denne syklusen (utsendingen feilet på
  //    omslagsdagen), får hen ta det igjen så lenge forholdene holder seg.
  //    Økningskravet (4) og karantenen (5) gjelder fortsatt, så dette kan
  //    aldri bli en ny e-postkilde — bare en forsinket levering av den ene.
  if (t.scoreIGar >= VARSEL_MIN_SCORE) {
    const omslag = t.sisteOmslagIso ?? null;
    const alleredeVarsletForSyklusen =
      omslag === null ||
      (t.sistVarsletIso !== null &&
        new Date(t.sistVarsletIso).getTime() >= new Date(`${omslag}T00:00:00Z`).getTime());
    if (alleredeVarsletForSyklusen) return { send: false, grunn: 'var-allerede-bra' };
  }

  // 4. Bedringen må være reell. Mot ukas bunn, ikke mot i går — se
  //    VARSEL_MIN_OKNING for hvorfor den forskjellen er hele poenget.
  if (t.scoreIDag - t.lavesteSisteUke < VARSEL_MIN_OKNING) {
    return { send: false, grunn: 'for-liten-okning' };
  }

  // 5. Karantene til slutt: en ekte flanke vi ikke får sende er verdt å skille
  //    fra en dag som aldri kvalifiserte. Rekkefølgen gjør avslagsgrunnen
  //    presis, og grunnen logges.
  if (t.sistVarsletIso !== null) {
    const dager = (t.naa.getTime() - new Date(t.sistVarsletIso).getTime()) / 86_400_000;
    if (dager < VARSEL_KARANTENE_DAGER) return { send: false, grunn: 'i-karantene' };
  }

  // «Fra» er ukas bunn, ikke gårsdagen: det er tallet e-posten skal vise, fordi
  // det er den endringen mottakeren faktisk har opplevd.
  return { send: true, fra: t.lavesteSisteUke, til: t.scoreIDag };
}
