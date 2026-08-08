/**
 * Områderapport for et sted på kartet.
 *
 * Bakgrunn: en nummerert nål gir inntrykk av at det skal være bra NØYAKTIG
 * der nåla står. Den romlige valideringen sier noe annet — modellen skiller
 * SKOG fra IKKE-SKOG, men innenfor skogen, på få kilometers skala, kan den
 * ikke peke ut ett sted framfor et vilkårlig annet. Rapporten er derfor
 * skrevet for å svare på «hva vet vi om dette OMRÅDET», ikke «hva står her».
 *
 * Regelen modulen er skrevet etter: HVER setning skal kunne spores til et felt
 * i inndataene. Mangler feltet, faller setningen bort — den blir ikke gjettet.
 * Det er derfor alle feltene er valgfrie, og hver seksjon bygges opp med push
 * og utelates helt når den ikke fikk en eneste linje.
 *
 * Vi HAR: skogtype, bonitet, volum, hvor langt unna skogdataene er målt,
 * datakilden, temperatur, nedbør, markfukt, luftfuktighet, sesong,
 * habitatbegrunnelser, registrerte funn i nærheten, og de andre rutene i
 * samme rutenett.
 *
 * Vi HAR IKKE: bestandsalder (SR16-adapteren henter bare treslag, bonitet og
 * volum — `ageYears` er alltid null), bunnvegetasjon, helning og solforhold.
 * Rapporten skriver derfor ingenting om dem. «Eldre barskog med fuktig
 * mosebunn» er nettopp setningen denne modulen ikke skal kunne produsere.
 *
 * Ren funksjon: ingen nettverk, ingen kartbibliotek, ingen `new Date()`.
 * Kalleren tres språket inn eksplisitt, fordi teksten lages på serveren og
 * next-intl ikke dekker det. Testes i __tests__/area-report.test.ts.
 */

import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';
import { forestTypeLabel } from '@/lib/utils/prediction-explanation';
import { CONDITION_THRESHOLDS } from '@/lib/utils/prediction';

/** Skogdataene slik NIBIO SR16 (Norge) eller CORINE (Sverige/Europa) gir dem. */
export interface AreaReportForest {
  forestType: string;
  /** Bonitet (H40). Null i CORINE-området — da skrives ingen bonitetslinje. */
  productivity: number | null;
  /** Stående volum, m³/ha. Null i CORINE-området. */
  volumePerHa: number | null;
  /** 'sr16' | 'corine' | 'fallback'. Brukes til å kreditere kilden. */
  source?: string | null;
  /**
   * Hvor langt unna punktet skogdataene faktisk er målt, i km.
   *   null      → vi vet ikke, og da sier rapporten ingenting om avstand.
   *   ~0        → oppslaget er gjort i selve punktet.
   *   > 0       → avstanden navngis, slik at «granskog» ikke låner presisjon
   *               fra et sted vi ikke har målt.
   */
  distanceKm?: number | null;
}

export interface AreaReportWeather {
  temperatureC?: number | null;
  humidityPct?: number | null;
  /** True når fuktprosenten er den nøytrale fallbacken, ikke en måling. */
  humidityEstimated?: boolean | null;
  rain3dMm?: number | null;
  rain7dMm?: number | null;
  rain14dMm?: number | null;
  /** Vannbalanse i rotsonen, 0–1. Null utenfor NO/SE. */
  soilMoistureIndex?: number | null;
}

export interface AreaReportSeason {
  /**
   * Arten brukeren har filtrert på, med sesongstatus regnet ut av kalleren fra
   * season_start/season_end/peak_season_* i databasen.
   */
  selected?: { name: string; inSeason: boolean; inPeak: boolean } | null;
  /**
   * Arter som ER i sesong denne måneden og som modellen rangerer høyest i
   * denne ruta. Navnene er allerede på leserens språk.
   */
  topSpecies?: string[];
}

/** De andre rutene i samme rutenett — det eneste «nabolaget» vi har målt. */
export interface AreaReportNeighbourhood {
  /** Antall ruter i søket som hadde skogdata og dermed en score. */
  scoredCellCount: number;
  /** Medianscore blant dem. */
  medianScore: number;
  /** Vanligste skogtype blant de scorede rutene. */
  dominantForestType?: string | null;
  /** Medianbonitet blant de scorede rutene som har bonitet. */
  medianProductivity?: number | null;
  /** Hvor stor rute punktet står for. */
  cellSizeKm?: { widthKm: number; heightKm: number } | null;
}

export interface AreaReportInput {
  /** Score for denne ruta, 0–100. */
  score: number;
  forest?: AreaReportForest | null;
  weather?: AreaReportWeather | null;
  season?: AreaReportSeason | null;
  /** Registrerte funn (GBIF/Artsdatabanken) innenfor en gitt radius. */
  nearbyFindings?: { count: number; radiusKm: number } | null;
  /** Habitatbegrunnelser fra computeHabitatScore — allerede lokalisert. */
  habitatReasons?: string[];
  neighbourhood?: AreaReportNeighbourhood | null;
  locale?: Locale;
}

export type AreaReportSectionId = 'forest' | 'conditions' | 'distinctive';

export interface AreaReportSection {
  id: AreaReportSectionId;
  heading: string;
  lines: string[];
}

export interface AreaReport {
  sections: AreaReportSection[];
}

/**
 * Under denne avstanden regnes skogoppslaget som gjort i selve punktet.
 * 50 m er godt under bredden på ruta punktet står for, og under oppløsningen
 * i SR16-rasteret (16 m) er «her» og «50 m unna» det samme oppslaget.
 */
const MEASURED_AT_POINT_KM = 0.05;

/**
 * Hvor stor forskjell i score som må til før vi sier at ruta skiller seg fra
 * de andre. Valideringen (26 menneskeanbefalte soppsteder mot kontrollpunkter
 * 3–15 km unna) fant ingen signifikant forskjell innenfor skog, så terskelen
 * er satt bevisst høyt: små utslag skal leses som støy, ikke som en påstand.
 */
/**
 * Under dette regner appen en forskjell som STØY, ikke som en påstand.
 *
 * Eksportert fordi kartlaget må bruke NØYAKTIG samme tall: det gikk ikke an at
 * områderapporten skrev «Området skiller seg lite fra nabolaget» samtidig som
 * sirkelen over den var malt fire ganger kraftigere enn nabosirkelen.
 */
export const DISTINCT_SCORE_DELTA = 8;

interface AreaReportCopy {
  headings: Record<AreaReportSectionId, string>;

  forestTypeOnly: (forest: string) => string;
  forestAtPoint: (forest: string) => string;
  forestAtDistance: (forest: string, distance: string) => string;
  productivity: (value: string) => string;
  volume: (value: string) => string;
  corineOnlyType: string;

  temperature: (value: string) => string;
  rain: (mm: string, days: number) => string;
  rainLastThree: (mm: string) => string;
  soilMoisture: (value: string) => string;
  humidity: (value: string) => string;
  humidityNotMeasured: string;

  speciesPeak: (name: string) => string;
  speciesInSeason: (name: string) => string;
  speciesOutOfSeason: (name: string) => string;
  topSpecies: (names: string) => string;

  cellSize: (width: string, height: string) => string;
  littleDifference: (score: string, median: string, cells: number) => string;
  standsOut: (score: string, median: string, cells: number) => string;
  regionConditions: (level: string) => string;
  conditionsExcellent: string;
  conditionsGood: string;
  conditionsOk: string;
  conditionsWeak: string;
  differentForest: (here: string, around: string) => string;
  differentProductivity: (here: string, around: string) => string;
  tooFewCells: string;
  findingsNearby: (count: number, radius: string) => string;
  noFindingsNearby: (radius: string) => string;

  distanceMeters: (meters: number) => string;
  distanceKilometers: (km: string) => string;
}

const COPY: Record<Locale, AreaReportCopy> = {
  nb: {
    headings: {
      forest: 'Skogen',
      conditions: 'Forholdene nå',
      distinctive: 'Hvorfor akkurat dette området'
    },

    forestTypeOnly: (forest) => `Skogtype: ${forest}.`,
    forestAtPoint: (forest) => `Skogdataene er målt i selve punktet: ${forest}.`,
    forestAtDistance: (forest, distance) => `Skogdataene er målt ${distance} unna punktet: ${forest}.`,
    productivity: (value) => `Bonitet ${value} av 6–26 — hvor produktiv marka er for trevekst. Høyere er rikere.`,
    volume: (value) => `Stående volum ${value} m³ per hektar.`,
    corineOnlyType: 'CORINE måler bare skogtype — ikke bonitet eller volum.',

    temperature: (value) => `Temperatur nå: ${value} °C.`,
    rain: (mm, days) => `${mm} mm nedbør siste ${days} døgn.`,
    rainLastThree: (mm) => `Av det kom ${mm} mm de siste tre døgnene.`,
    soilMoisture: (value) =>
      `Markfukt ${value} av 1 — vannbalansen i rotsonen, regnet ut fra nedbøren de siste ukene.`,
    humidity: (value) => `Luftfuktighet ${value} %.`,
    humidityNotMeasured: 'Nærmeste værstasjon måler ikke luftfuktighet, så den står ikke her.',

    speciesPeak: (name) => `${name} er i topp-sesong nå.`,
    speciesInSeason: (name) => `${name} er i sesong nå, men ikke topp-sesong.`,
    speciesOutOfSeason: (name) => `${name} er utenfor sesong nå.`,
    topSpecies: (names) => `Arter i sesong nå som modellen rangerer høyest i denne ruta: ${names}.`,

    cellSize: (width, height) =>
      `Punktet står for en rute på omtrent ${width} × ${height} km — det vi vet, vet vi om ruta, ikke om et enkelt tre.`,
    littleDifference: (score, median, cells) =>
      `Området skiller seg lite fra nabolaget: ${score} mot median ${median} for de ${cells} rutene vi målte i søket.`,
    standsOut: (score, median, cells) =>
      `Ruta scorer ${score} mot median ${median} for de ${cells} rutene vi målte i søket.`,
    regionConditions: (level) => `Forholdene i regionen er ${level} nå.`,
    conditionsExcellent: 'svært gode',
    conditionsGood: 'gode',
    conditionsOk: 'brukbare',
    conditionsWeak: 'svake',
    differentForest: (here, around) => `Ruta er ${here}; de fleste målte rutene rundt er ${around}.`,
    differentProductivity: (here, around) => `Bonitet ${here} her mot median ${around} i de målte rutene rundt.`,
    tooFewCells: 'Vi har for få målte ruter rundt til å si hva som skiller dette området fra nabolaget.',
    findingsNearby: (count, radius) =>
      `${count} registrerte funn innenfor ${radius} (Artsdatabanken/GBIF) — men registreringer følger stier og veier, så de sier mest om hvor folk går.`,
    noFindingsNearby: (radius) => `Ingen registrerte funn innenfor ${radius} (Artsdatabanken/GBIF).`,

    distanceMeters: (meters) => `${meters} m`,
    distanceKilometers: (km) => `${km} km`
  },
  sv: {
    headings: {
      forest: 'Skogen',
      conditions: 'Förhållandena nu',
      distinctive: 'Varför just det här området'
    },

    forestTypeOnly: (forest) => `Skogstyp: ${forest}.`,
    forestAtPoint: (forest) => `Skogsdata är mätta i själva punkten: ${forest}.`,
    forestAtDistance: (forest, distance) => `Skogsdata är mätta ${distance} från punkten: ${forest}.`,
    productivity: (value) => `Bonitet ${value} av 6–26 — hur produktiv marken är för trädtillväxt. Högre är bördigare.`,
    volume: (value) => `Stående volym ${value} m³ per hektar.`,
    corineOnlyType: 'CORINE mäter bara skogstyp — inte bonitet eller volym.',

    temperature: (value) => `Temperatur nu: ${value} °C.`,
    rain: (mm, days) => `${mm} mm nederbörd senaste ${days} dygnen.`,
    rainLastThree: (mm) => `Av det kom ${mm} mm de senaste tre dygnen.`,
    soilMoisture: (value) =>
      `Markfukt ${value} av 1 — vattenbalansen i rotzonen, beräknad från nederbörden de senaste veckorna.`,
    humidity: (value) => `Luftfuktighet ${value} %.`,
    humidityNotMeasured: 'Närmaste väderstation mäter inte luftfuktighet, så den står inte här.',

    speciesPeak: (name) => `${name} är i toppsäsong nu.`,
    speciesInSeason: (name) => `${name} är i säsong nu, men inte toppsäsong.`,
    speciesOutOfSeason: (name) => `${name} är utanför säsong nu.`,
    topSpecies: (names) => `Arter i säsong nu som modellen rankar högst i den här rutan: ${names}.`,

    cellSize: (width, height) =>
      `Punkten står för en ruta på ungefär ${width} × ${height} km — det vi vet, vet vi om rutan, inte om ett enskilt träd.`,
    littleDifference: (score, median, cells) =>
      `Området skiljer sig lite från grannskapet: ${score} mot median ${median} för de ${cells} rutor vi mätte i sökningen.`,
    standsOut: (score, median, cells) =>
      `Rutan får ${score} mot median ${median} för de ${cells} rutor vi mätte i sökningen.`,
    regionConditions: (level) => `Förhållandena i regionen är ${level} nu.`,
    conditionsExcellent: 'mycket goda',
    conditionsGood: 'goda',
    conditionsOk: 'godtagbara',
    conditionsWeak: 'svaga',
    differentForest: (here, around) => `Rutan är ${here}; de flesta mätta rutorna runt omkring är ${around}.`,
    differentProductivity: (here, around) => `Bonitet ${here} här mot median ${around} i de mätta rutorna runt omkring.`,
    tooFewCells: 'Vi har för få mätta rutor runt omkring för att säga vad som skiljer det här området från grannskapet.',
    findingsNearby: (count, radius) =>
      `${count} registrerade fynd inom ${radius} (Artdatabanken/GBIF) — men registreringar följer stigar och vägar, så de säger mest om var folk går.`,
    noFindingsNearby: (radius) => `Inga registrerade fynd inom ${radius} (Artdatabanken/GBIF).`,

    distanceMeters: (meters) => `${meters} m`,
    distanceKilometers: (km) => `${km} km`
  }
};

function copyFor(locale: Locale | undefined): AreaReportCopy {
  return COPY[locale ?? DEFAULT_LOCALE] ?? COPY[DEFAULT_LOCALE];
}

/** Tall med komma som desimalskilletegn — både norsk og svensk bruker komma. */
function formatNumber(value: number, decimals = 0): string {
  return value.toFixed(decimals).replace('.', ',');
}

/**
 * Avstand som lesbar streng. Under ~1 km i hele hundre meter, over i km med én
 * desimal. Kallere skal ha tatt «målt i punktet» før de kommer hit, så gulvet
 * på 100 m kan ikke lyve om et oppslag gjort på stedet.
 */
function formatDistance(km: number, copy: AreaReportCopy): string {
  const safe = Math.max(0, km);
  if (safe < 0.95) return copy.distanceMeters(Math.max(100, Math.round(safe * 10) * 100));
  return copy.distanceKilometers(formatNumber(Math.round(safe * 10) / 10, 1));
}

/**
 * Siste kopi av dommestigen som sto igjen på de gamle tersklene.
 *
 * Sto på 75/55/35 mens kartfargene, dommene og forsidens ring alle ble
 * rekalibrert til 72/60/50 (se CONDITION_THRESHOLDS). Følgen var at
 * områderapporten kunne kalle et nabolag «brukbare forhold» mens ruta rett over
 * sa «Lite kantarell i skogen nå» om nøyaktig samme tall.
 *
 * Leser nå fra samme sted som alt annet.
 */
function conditionsLevel(score: number, copy: AreaReportCopy): string {
  if (score >= CONDITION_THRESHOLDS.excellent) return copy.conditionsExcellent;
  if (score >= CONDITION_THRESHOLDS.good) return copy.conditionsGood;
  if (score >= CONDITION_THRESHOLDS.moderate) return copy.conditionsOk;
  return copy.conditionsWeak;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Én rute i rutenettet, slik prediksjonsrutene allerede har den. */
export interface NeighbourhoodCell {
  score: number;
  forestType?: string | null;
  productivity?: number | null;
}

/**
 * Slå sammen rutene i samme søk til det «nabolaget» rapporten kan sammenligne
 * med. Returnerer null når det ikke finnes en eneste scoret rute — da har vi
 * ingenting å sammenligne med, og rapporten sier det i stedet for å finne på
 * noe.
 */
export function summariseNeighbourhood(
  cells: NeighbourhoodCell[],
  options?: { cellSizeKm?: { widthKm: number; heightKm: number } | null }
): AreaReportNeighbourhood | null {
  if (cells.length === 0) return null;

  const counts = new Map<string, number>();
  for (const cell of cells) {
    if (!cell.forestType) continue;
    counts.set(cell.forestType, (counts.get(cell.forestType) ?? 0) + 1);
  }
  // Deterministisk ved uavgjort: flest først, deretter alfabetisk.
  const dominantForestType =
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;

  const productivities = cells
    .map((cell) => cell.productivity)
    .filter((value): value is number => typeof value === 'number');

  return {
    scoredCellCount: cells.length,
    medianScore: median(cells.map((cell) => cell.score)),
    dominantForestType,
    medianProductivity: productivities.length > 0 ? median(productivities) : null,
    cellSizeKm: options?.cellSizeKm ?? null
  };
}

/** Bygg rapporten. Seksjoner uten en eneste linje utelates. */
export function buildAreaReport(input: AreaReportInput): AreaReport {
  const copy = copyFor(input.locale);
  const locale = input.locale ?? DEFAULT_LOCALE;

  // ── 1. Skogen ────────────────────────────────────────────────────────
  const forestLines: string[] = [];
  const forest = input.forest;
  if (forest) {
    const label = forestTypeLabel(forest.forestType, locale);
    if (forest.distanceKm == null) {
      forestLines.push(copy.forestTypeOnly(label));
    } else if (forest.distanceKm <= MEASURED_AT_POINT_KM) {
      forestLines.push(copy.forestAtPoint(label));
    } else {
      forestLines.push(copy.forestAtDistance(label, formatDistance(forest.distanceKm, copy)));
    }

    if (forest.productivity != null) forestLines.push(copy.productivity(formatNumber(forest.productivity)));
    if (forest.volumePerHa != null) forestLines.push(copy.volume(formatNumber(Math.round(forest.volumePerHa))));
    // Sier hvorfor de to tallene mangler, i stedet for å la leseren tro at
    // skogen er tom. Gjelder bare CORINE-området (Sverige/Europa).
    if (forest.source === 'corine' && forest.productivity == null && forest.volumePerHa == null) {
      forestLines.push(copy.corineOnlyType);
    }
  }
  for (const reason of input.habitatReasons ?? []) forestLines.push(reason);

  // ── 2. Forholdene nå ─────────────────────────────────────────────────
  const conditionLines: string[] = [];
  const weather = input.weather;
  if (weather) {
    if (weather.temperatureC != null) {
      conditionLines.push(copy.temperature(formatNumber(Math.round(weather.temperatureC))));
    }
    // Lengste vinduet vi faktisk har tall for — soppen bryr seg om summen over
    // uker, ikke om det regnet i går.
    const rainWindow =
      weather.rain14dMm != null
        ? { mm: weather.rain14dMm, days: 14 }
        : weather.rain7dMm != null
          ? { mm: weather.rain7dMm, days: 7 }
          : weather.rain3dMm != null
            ? { mm: weather.rain3dMm, days: 3 }
            : null;
    if (rainWindow) {
      conditionLines.push(copy.rain(formatNumber(Math.round(rainWindow.mm)), rainWindow.days));
      if (weather.rain3dMm != null && rainWindow.days > 3) {
        conditionLines.push(copy.rainLastThree(formatNumber(Math.round(weather.rain3dMm))));
      }
    }
    if (weather.soilMoistureIndex != null) {
      conditionLines.push(copy.soilMoisture(formatNumber(weather.soilMoistureIndex, 2)));
    }
    // Er fuktprosenten bare den nøytrale fallbacken, oppgir vi ikke et tall
    // ingen stasjon har målt — vi sier at målingen mangler.
    if (weather.humidityEstimated) {
      conditionLines.push(copy.humidityNotMeasured);
    } else if (weather.humidityPct != null) {
      conditionLines.push(copy.humidity(formatNumber(Math.round(weather.humidityPct))));
    }
  }
  const season = input.season;
  if (season?.selected) {
    const { name, inSeason, inPeak } = season.selected;
    if (!inSeason) conditionLines.push(copy.speciesOutOfSeason(name));
    else if (inPeak) conditionLines.push(copy.speciesPeak(name));
    else conditionLines.push(copy.speciesInSeason(name));
  } else if (season?.topSpecies && season.topSpecies.length > 0) {
    conditionLines.push(copy.topSpecies(season.topSpecies.join(', ')));
  }

  // ── 3. Hvorfor akkurat dette området ─────────────────────────────────
  const distinctiveLines: string[] = [];
  const hood = input.neighbourhood;
  if (hood?.cellSizeKm) {
    distinctiveLines.push(
      copy.cellSize(formatNumber(hood.cellSizeKm.widthKm, 1), formatNumber(hood.cellSizeKm.heightKm, 1))
    );
  }
  // Med færre enn tre målte ruter finnes det ikke noe nabolag å sammenligne
  // med. Da sier vi det — det er et ærligere svar enn en oppdiktet forskjell.
  if (!hood || hood.scoredCellCount < 3) {
    distinctiveLines.push(copy.tooFewCells);
  } else {
    const score = Math.round(input.score);
    const medianScore = Math.round(hood.medianScore);
    const delta = score - medianScore;
    if (Math.abs(delta) < DISTINCT_SCORE_DELTA) {
      distinctiveLines.push(
        copy.littleDifference(formatNumber(score), formatNumber(medianScore), hood.scoredCellCount)
      );
    } else {
      distinctiveLines.push(copy.standsOut(formatNumber(score), formatNumber(medianScore), hood.scoredCellCount));
      // Bare når ruta faktisk skiller seg ut har det mening å peke på HVA som
      // er annerledes. Ellers ville vi laget en forklaring på en forskjell som
      // ikke finnes.
      if (forest && hood.dominantForestType && forest.forestType !== hood.dominantForestType) {
        distinctiveLines.push(
          copy.differentForest(
            forestTypeLabel(forest.forestType, locale),
            forestTypeLabel(hood.dominantForestType, locale)
          )
        );
      }
      if (
        forest?.productivity != null &&
        hood.medianProductivity != null &&
        Math.abs(forest.productivity - hood.medianProductivity) >= 2
      ) {
        distinctiveLines.push(
          copy.differentProductivity(
            formatNumber(forest.productivity),
            formatNumber(Math.round(hood.medianProductivity))
          )
        );
      }
    }
    distinctiveLines.push(copy.regionConditions(conditionsLevel(hood.medianScore, copy)));
  }
  if (input.nearbyFindings) {
    const radius = formatDistance(input.nearbyFindings.radiusKm, copy);
    distinctiveLines.push(
      input.nearbyFindings.count > 0
        ? copy.findingsNearby(input.nearbyFindings.count, radius)
        : copy.noFindingsNearby(radius)
    );
  }

  const sections: AreaReportSection[] = [];
  const push = (id: AreaReportSectionId, lines: string[]) => {
    if (lines.length > 0) sections.push({ id, heading: copy.headings[id], lines });
  };
  push('forest', forestLines);
  push('conditions', conditionLines);
  push('distinctive', distinctiveLines);

  return { sections };
}

/** Rapporten som flat tekst — for tester, logger og enkle visninger. */
export function areaReportToText(report: AreaReport): string {
  return report.sections
    .map((section) => [section.heading, ...section.lines].join('\n'))
    .join('\n\n');
}
