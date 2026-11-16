/**
 * Sesongkurven på artssiden: NÅR arten er registrert, uke for uke.
 *
 * Artssiden viste sesongen som én linje tekst («jul – okt»), mens repoet har
 * en empirisk ukekurve per art (phenology-data.ts, bygget på over 300 000
 * daterte funn). Det tidsmessige signalet er det validerte i hele produktet;
 * dette er første flate som viser det i stedet for bare å regne med det.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVA KURVEN ER — OG HVA DEN IKKE ER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Den viser når folk FINNER OG MELDER INN arten. Ikke hvor mye som finnes, og
 * ingenting om hvor. Verdiene er normalisert til toppuka = 1, så bare formen
 * betyr noe — derfor ingen tall på y-aksen. Teksten ved siden av sier
 * «registrerte funn», aldri «plukk nå», og blokka er lik for matsopp og
 * giftsopp.
 *
 * Bare hele-datasettet-kurven (`all`) brukes. Ingen breddegradsbånd, ingen
 * posisjon: en farlig art skal stå likt overalt (sperre B i season-region.ts),
 * og uten bånd er den regelen oppfylt av konstruksjonen.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FIRE GRUNNER TIL Å IKKE VISE EN KURVE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Generatoren kaster alle funn utenfor april–november før kurvene bygges
 * (phenology.ts forklarer hvorfor), så desember–mars er en hardkodet null —
 * fravær av data, ikke en måling. Kurven tegnes derfor bare over det målte
 * vinduet, og `hentSesongkurve` gir `null` når:
 *
 *   1. arten ikke har noen kurve (for få daterte funn);
 *   2. sesongvinduet i tekstraden over inneholder en måned utenfor det målte
 *      vinduet. Vintersopp og judasøre er «i sesong» i desember; en kurve som
 *      er flat null der ville motsagt raden den står under;
 *   3. kurven er kuttet i en av endene: verdien i første eller siste målte uke
 *      er over KANTGRENSE. Sandmorkel står på 24 % av toppen første uka i
 *      april — sesongen begynte før vinduet, og den delen har vi kastet;
 *   4. kurven har et brått trinn. Den er glattet over fem uker, så en ekte
 *      sesong kan ikke gå fra nesten ingenting til en vesentlig del av toppen
 *      på én uke. Gjør den det, ligger en opphopning av funn på én enkelt uke
 *      bak, og glattingen har smurt den ut til et platå. Storkremle har 657
 *      funn i uka 2.–8. juli mot 29 uka før: 168 er ført på 6. juli 2014 og
 *      399 på 4.–6. juli 2020. Det er masseregistreringer på noen få dager,
 *      ikke soppens sesong. For gulrød kremle ER platået toppen: kurven ville
 *      sagt «flest funn i midten av juli» om en art som topper i august.
 *      (Opphopningen ligger i funnene nord for 64°N: `south` og `central` er
 *      rene for alle tre artene, mens `north` har hele «toppen» sin i uke
 *      24–28. Det er `north` prediksjonen bruker der — se
 *      scripts/generate-phenology.mjs før noen stoler på de tre kurvene.)
 *
 * Disse artene beholder tekstraden alene. Ingen kurve er bedre enn en kurve
 * som viser kuttet eller masseregistreringen som om det var naturen. Målt mot
 * katalogen 16. november 2026: 61 av 80 arter får kurve, 10 har ingen kurve i
 * dataene, 6 stoppes av grunn 2 eller 3 (østerssopp, sandmorkel,
 * frostvokssopp, judasøre, vintersopp, blå ridderhatt) og 3 av grunn 4
 * (gulrød kremle, giftkremle, storkremle).
 *
 * Det målte vinduet leses fra `phenologyFactor`, som eier grensen: den svarer
 * `null` utenfor. Blir filteret i generatoren noen gang erstattet og porten
 * fjernet, følger kurven, aksen og bildeteksten etter av seg selv.
 *
 * ⚠️ Importer aldri denne modulen i en klientkomponent: den drar med seg
 * phenology-data.ts (54 kB). Komponenten som tegner (SesongKurve.tsx) får
 * ferdige tall og ferdig tekst som props og importerer bare typer herfra.
 *
 * Ren: ingen klokke leses her. Dagens dato sendes inn som Oslo-dato
 * (`sesongtilstand().osloDato`), så ingen test avhenger av dagen den kjøres.
 */

import { PHENOLOGY, PHENOLOGY_META } from '@/lib/prediction/phenology-data';
import { phenologyFactor } from '@/lib/prediction/phenology';
import { monthsInMask } from '@/lib/utils/season-region';

const UKER_I_AARET = 52;
const DAGER_I_AARET = 365;

/**
 * Høyeste verdi vi godtar i første og siste målte uke. Over dette er kurven
 * kuttet av vinduet, ikke av sesongen. Traktkantarell (0,10 siste uka i
 * november) skal med; frostvokssopp (0,26) og sandmorkel (0,24) skal ikke.
 */
const KANTGRENSE = 0.15;

/**
 * Et brått trinn (grunn 4): to naboverdier som skiller minst TRINNGRENSE av
 * toppen, der den laveste er under en tredel av den høyeste. Målt på kurvene
 * 16. november 2026: de tre kremleartene med platået i juni–juli (storkremle,
 * giftkremle, gulrød kremle — samme uke hos alle tre) har trinn på 0,19, 0,28
 * og 0,70; det største hos alle andre er 0,09. En bratt, men ekte sesong
 * (spiss morkel stiger 0,29 på én uke) rammes ikke, for den stiger fra et nivå
 * som allerede er høyt.
 */
const TRINNGRENSE = 0.15;
const TRINNFORHOLD = 1 / 3;

/** «Flest registrerte funn»: ukene rundt toppen med minst denne andelen av den. */
const TOPPANDEL = 0.8;

/** Første dag i hver måned, dag i året (ikke skuddår — som generatoren teller). */
const MANEDSSTART = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

/** Antall daterte funn bak ALLE kurvene til sammen. Finnes ikke per art. */
export const SESONGKURVE_FUNN: number = PHENOLOGY_META.d;

/** Første og siste dag i året (1–365) kurvene er bygget på. */
export interface Maalevindu {
  forsteDag: number;
  sisteDag: number;
}

export interface Sesongkurve {
  /** Ukeverdiene i det målte vinduet (0–1, toppuka = 1), tidligst først. */
  uker: number[];
  /** Ukeindeks (0–51, uke 0 = 1.–7. januar) for første og siste verdi i `uker`. */
  startUke: number;
  sluttUke: number;
  /** Uka med flest registrerte funn. */
  toppUke: number;
  /** Den sammenhengende perioden rundt toppen med minst 80 % av toppverdien. */
  toppFraUke: number;
  toppTilUke: number;
  /** Det målte vinduet: aksen går fra første til og med siste dag. */
  forsteDag: number;
  sisteDag: number;
  /** Måneden (1–12) vinduet begynner og slutter i. */
  forsteManed: number;
  sisteManed: number;
}

/**
 * En tredel av en måned — så presist ukedata lar seg si i ord. Verdiene er
 * også nøklene i `select`-uttrykkene i meldingskatalogen (seasonCurvePeak…).
 */
export interface Datodel {
  maaned: number;
  del: 'start' | 'midt' | 'slutt';
}

/** Et punkt på kurven: `x` er andelen (0–1) langs aksen, `verdi` høyden (0–1). */
export interface Kurvepunkt {
  x: number;
  verdi: number;
}

/** Alt komponenten trenger for å tegne, som andeler (0–1) langs aksen. */
export interface SesongkurveVisning {
  /** Ett punkt per uke, midt i uka. */
  punkter: Kurvepunkt[];
  /**
   * Kurven over perioden med flest registrerte funn (fra starten av første
   * toppuke til slutten av siste), med endepunktene interpolert. Tegnes som et
   * mørkere felt i kurven, så setningen «flest registrerte funn fra … til …»
   * har noe å peke på.
   */
  topp: Kurvepunkt[];
  maneder: Array<{
    maaned: number;
    /** Månedsskillet (1. i måneden). `null` for måneden aksen begynner i. */
    skille: number | null;
    /** Der månedsnavnet står. `null` når bare noen dager av måneden er med. */
    etikett: number | null;
  }>;
  /** Dagens dato, eller `null` utenfor det målte vinduet. */
  iDag: number | null;
}

/** Dagen midt i uka (uke 0 = 1.–7. januar). */
function ukeMidtdag(uke: number): number {
  return uke * 7 + 4;
}

function manedForDag(dag: number): number {
  let maaned = 1;
  for (let i = 0; i < MANEDSSTART.length; i++) if (dag >= MANEDSSTART[i]) maaned = i + 1;
  return maaned;
}

/** Dag i året for en Oslo-dato «ÅÅÅÅ-MM-DD», uten skuddår. `null` for alt annet. */
function dagIAaret(osloDato: string): number | null {
  const treff = /^\d{4}-(\d{2})-(\d{2})$/.exec(osloDato);
  if (!treff) return null;
  const maaned = Number(treff[1]);
  const dag = Number(treff[2]);
  if (maaned < 1 || maaned > 12 || dag < 1 || dag > 31) return null;
  return Math.min(DAGER_I_AARET, MANEDSSTART[maaned - 1] + dag - 1);
}

/**
 * Det målte vinduet: dagene phenology.ts svarer for. Breddegraden spiller
 * ingen rolle for porten — den avgjør bare hvilket bånd som slås opp.
 * `null` når arten ikke har noen kurve å svare med.
 */
function maaltVindu(speciesId: number): Maalevindu | null {
  let forsteDag: number | null = null;
  let sisteDag: number | null = null;
  for (let dag = 1; dag <= DAGER_I_AARET; dag++) {
    if (phenologyFactor(speciesId, 0, dag) === null) continue;
    if (forsteDag === null) forsteDag = dag;
    sisteDag = dag;
  }
  return forsteDag === null || sisteDag === null ? null : { forsteDag, sisteDag };
}

/**
 * Kjernen, uten oppslag: 52 ukeverdier + det målte vinduet + sesongvinduet
 * tekstraden viser → kurven som kan tegnes, eller `null` (grunn 2–4 øverst).
 */
export function byggSesongkurve(
  alleUker: readonly number[] | null | undefined,
  vindu: Maalevindu,
  sesongmaske: number
): Sesongkurve | null {
  if (!alleUker || alleUker.length !== UKER_I_AARET) return null;
  const { forsteDag, sisteDag } = vindu;
  if (!(forsteDag >= 1 && sisteDag <= DAGER_I_AARET && forsteDag < sisteDag)) return null;
  const forsteManed = manedForDag(forsteDag);
  const sisteManed = manedForDag(sisteDag);

  // Grunn 2: tekstraden sier «i sesong» i en måned kurven ikke har målt.
  if (monthsInMask(sesongmaske).some((maaned) => maaned < forsteManed || maaned > sisteManed)) return null;

  // Ukene som har midten sin inne i vinduet. Uka som bare så vidt stikker inn
  // (25. mars–1. april) har ett døgn med data og er ikke en måling.
  const ukeindekser: number[] = [];
  for (let uke = 0; uke < UKER_I_AARET; uke++) {
    const midt = ukeMidtdag(uke);
    if (midt >= forsteDag && midt <= sisteDag) ukeindekser.push(uke);
  }
  if (ukeindekser.length < 2) return null;
  const startUke = ukeindekser[0];
  const sluttUke = ukeindekser[ukeindekser.length - 1];
  const uker = alleUker.slice(startUke, sluttUke + 1);
  if (uker.some((verdi) => typeof verdi !== 'number' || !Number.isFinite(verdi) || verdi < 0)) return null;

  // Grunn 3: kuttet i en av endene. Ligger toppen utenfor vinduet (høyeste
  // verdi inni er under 1), er kurven kuttet enda verre.
  const toppverdi = Math.max(...uker);
  if (toppverdi < 0.999) return null;
  if (uker[0] > KANTGRENSE || uker[uker.length - 1] > KANTGRENSE) return null;

  // Grunn 4: et brått trinn — en opphopning av funn på én uke, ikke en sesong.
  for (let i = 1; i < uker.length; i++) {
    const hoy = Math.max(uker[i], uker[i - 1]);
    const lav = Math.min(uker[i], uker[i - 1]);
    if (hoy - lav >= TRINNGRENSE && lav <= TRINNFORHOLD * hoy) return null;
  }

  const toppIndeks = uker.indexOf(toppverdi);
  let fra = toppIndeks;
  let til = toppIndeks;
  while (fra > 0 && uker[fra - 1] >= TOPPANDEL * toppverdi) fra--;
  while (til < uker.length - 1 && uker[til + 1] >= TOPPANDEL * toppverdi) til++;

  return {
    uker,
    startUke,
    sluttUke,
    toppUke: startUke + toppIndeks,
    toppFraUke: startUke + fra,
    toppTilUke: startUke + til,
    forsteDag,
    sisteDag,
    forsteManed,
    sisteManed
  };
}

/**
 * Kurven for én art, eller `null` når den ikke skal vises (se toppen av fila).
 *
 * `sesongmaske` er vinduet tekstraden viser — `baseSeasonMask` fra
 * season-region.ts — slik at kurven aldri kan motsi raden den står under.
 */
export function hentSesongkurve(speciesId: number | null | undefined, sesongmaske: number): Sesongkurve | null {
  if (speciesId == null) return null;
  const kurve = PHENOLOGY[String(speciesId)]?.all;
  if (!kurve) return null;
  const vindu = maaltVindu(speciesId);
  return vindu ? byggSesongkurve(kurve, vindu, sesongmaske) : null;
}

/**
 * Aksen går over det målte vinduet, dag for dag: fra starten av første dag til
 * slutten av siste. Dag d dekker [d, d + 1) på aksen.
 */
function akse(kurve: Sesongkurve): { start: number; lengde: number } {
  return { start: kurve.forsteDag, lengde: kurve.sisteDag - kurve.forsteDag + 1 };
}

function klem(andel: number): number {
  return Math.min(1, Math.max(0, andel));
}

/** Hvor langs aksen (0–1) midten av en uke ligger. */
export function ukeTilAndel(kurve: Sesongkurve, uke: number): number {
  const { start, lengde } = akse(kurve);
  // Uka dekker dagene uke*7+1 … uke*7+7, altså [uke*7+1, uke*7+8) på aksen.
  return (uke * 7 + 4.5 - start) / lengde;
}

/**
 * Hvor dagens dato ligger langs aksen, eller `null` når den er utenfor det
 * målte vinduet. Da tegnes ingen markør: i januar sier kurven «når neste år»,
 * ikke «nå».
 */
export function dagensAndel(kurve: Sesongkurve, osloDato: string): number | null {
  const dag = dagIAaret(osloDato);
  if (dag == null || dag < kurve.forsteDag || dag > kurve.sisteDag) return null;
  const { start, lengde } = akse(kurve);
  return klem((dag + 0.5 - start) / lengde); // midt på dagen
}

/** Tredelen av måneden midten av en uke faller i. */
export function datodelForUke(uke: number): Datodel {
  const dag = ukeMidtdag(uke);
  const maaned = manedForDag(dag);
  const dagIManed = dag - MANEDSSTART[maaned - 1] + 1;
  return { maaned, del: dagIManed <= 10 ? 'start' : dagIManed <= 20 ? 'midt' : 'slutt' };
}

/** Perioden med flest registrerte funn, i ord: fra og til, som månedstredeler. */
export function toppPeriode(kurve: Sesongkurve): { fra: Datodel; til: Datodel } {
  return { fra: datodelForUke(kurve.toppFraUke), til: datodelForUke(kurve.toppTilUke) };
}

/** Kurvens høyde ved `x`, lineært mellom ukepunktene og flatt utenfor dem. */
function verdiVed(punkter: readonly Kurvepunkt[], x: number): number {
  if (x <= punkter[0].x) return punkter[0].verdi;
  for (let i = 1; i < punkter.length; i++) {
    const hoyre = punkter[i];
    if (x > hoyre.x) continue;
    const venstre = punkter[i - 1];
    const andel = (x - venstre.x) / (hoyre.x - venstre.x);
    return venstre.verdi + (hoyre.verdi - venstre.verdi) * andel;
  }
  return punkter[punkter.length - 1].verdi;
}

/** Minste del av en måned som må være med på aksen før navnet skrives ut. */
const MIN_DAGER_FOR_ETIKETT = 14;

export function sesongkurveVisning(kurve: Sesongkurve, osloDato: string): SesongkurveVisning {
  const { start, lengde } = akse(kurve);
  const slutt = start + lengde; // første dag ETTER aksen

  const punkter = kurve.uker.map((verdi, i) => ({ x: ukeTilAndel(kurve, kurve.startUke + i), verdi }));

  // Toppfeltet: fra starten av første toppuke til slutten av siste.
  const toppFra = klem((kurve.toppFraUke * 7 + 1 - start) / lengde);
  const toppTil = klem((kurve.toppTilUke * 7 + 8 - start) / lengde);
  const topp: Kurvepunkt[] = [
    { x: toppFra, verdi: verdiVed(punkter, toppFra) },
    ...punkter.filter((punkt) => punkt.x > toppFra && punkt.x < toppTil),
    { x: toppTil, verdi: verdiVed(punkter, toppTil) }
  ];

  const maneder: SesongkurveVisning['maneder'] = [];
  for (let maaned = 1; maaned <= 12; maaned++) {
    const manedStart = MANEDSSTART[maaned - 1];
    const manedSlutt = maaned < 12 ? MANEDSSTART[maaned] : DAGER_I_AARET + 1;
    const fra = Math.max(manedStart, start);
    const til = Math.min(manedSlutt, slutt);
    if (til <= fra) continue;
    maneder.push({
      maaned,
      skille: manedStart > start ? (manedStart - start) / lengde : null,
      etikett: til - fra >= MIN_DAGER_FOR_ETIKETT ? ((fra + til) / 2 - start) / lengde : null
    });
  }

  return { punkter, topp, maneder, iDag: dagensAndel(kurve, osloDato) };
}

// ---------------------------------------------------------------------------
// Teksten
// ---------------------------------------------------------------------------

/** `t` fra next-intl, bundet til SpeciesDetail-navnerommet. */
export type SesongkurveOversetter = (key: string, values?: Record<string, string | number>) => string;

export interface SesongkurveTekster {
  /** Figurens tilgjengelige navn: hva den viser, og toppen i ord. */
  ariaLabel: string;
  /** «Flest registrerte funn fra begynnelsen av august til midten av september.» */
  topp: string;
  /** Hva kurven er bygget på — og hva den ikke sier. */
  bildetekst: string;
  /** Etiketten på dagens dato. */
  iDag: string;
}

/**
 * Tekstene rundt kurven, på leserens språk. Setningene står hele i
 * meldingskatalogen (SpeciesDetail.seasonCurve…); her velges bare hvilken, og
 * hvilke måneder som settes inn.
 *
 * Ordlyden er «registrerte funn» hele veien. Ingenting her sier at arten er å
 * finne nå, hvor den finnes eller hva den kan brukes til — og teksten er den
 * samme for en matsopp og en giftsopp.
 */
export function sesongkurveTekster(input: {
  kurve: Sesongkurve;
  /** Artens navn på leserens språk. */
  navn: string;
  t: SesongkurveOversetter;
  /** Månedsnavnene skrevet helt ut, indeks 0 = januar (langeManedsnavn). */
  langeManeder: readonly string[];
  /** Antall daterte funn bak alle kurvene. Utelates → SESONGKURVE_FUNN. */
  antallFunn?: number;
}): SesongkurveTekster {
  const { kurve, navn, t, langeManeder, antallFunn = SESONGKURVE_FUNN } = input;
  const maned = (maaned: number) => langeManeder[maaned - 1] ?? '';
  const { fra, til } = toppPeriode(kurve);

  const topp =
    fra.maaned !== til.maaned
      ? t('seasonCurvePeakRange', {
          fromPart: fra.del,
          fromMonth: maned(fra.maaned),
          toPart: til.del,
          toMonth: maned(til.maaned)
        })
      : fra.del !== til.del
        ? t('seasonCurvePeakSameMonth', { fromPart: fra.del, toPart: til.del, month: maned(fra.maaned) })
        : t('seasonCurvePeakOne', { part: fra.del, month: maned(fra.maaned) });

  const vindu = { from: maned(kurve.forsteManed), to: maned(kurve.sisteManed) };

  return {
    ariaLabel: t('seasonCurveAria', { name: navn, ...vindu, peak: topp }),
    topp,
    bildetekst: t('seasonCurveCaption', { ...vindu, count: antallFunn }),
    iDag: t('seasonCurveToday')
  };
}
