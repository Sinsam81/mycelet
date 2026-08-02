/**
 * Build human-readable explanations for a prediction result.
 *
 * The "alltid forklar hvorfor"-prinsippet from docs/roadmap.md says every
 * highlighted area on the map should answer the question "hvorfor er dette
 * markert?" — which protects us when the prediction is wrong (the user can
 * see we're guessing based on data, not magic) and builds trust when it's
 * right.
 *
 * This module is the pure-logic half of that. It takes a prediction
 * response + species context + current month, returns an ordered list of
 * tagged sentences. The companion component PredictionExplanation renders
 * them; tests live next door.
 *
 * Design decisions:
 *   - Tag each line as 'positive' / 'neutral' / 'negative' so the renderer
 *     can color-code without re-parsing the text.
 *   - Group by category so a UI could show only "weather" or only
 *     "season" sections if it wants.
 *   - The copy lives in a per-locale table (COPY below) because these strings
 *     ARE the user-facing explanations, not internal telemetry — and they are
 *     generated server-side, so the reader's language has to be passed in.
 *     Callers that omit `locale` get Norwegian, the app default.
 *   - When no species context is provided (general "is it mushroom
 *     weather?" call), fall back to generic advice using the same data.
 */

import { resolveSpeciesPreferences, type SpeciesContext } from '@/lib/utils/species-scoring';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

export type ExplanationLevel = 'positive' | 'neutral' | 'negative';

export type ExplanationCategory = 'season' | 'temperature' | 'rain' | 'humidity' | 'habitat' | 'mycorrhizal' | 'occurrence';

export interface Explanation {
  level: ExplanationLevel;
  category: ExplanationCategory;
  text: string;
}

export interface SpeciesExplanationContext {
  norwegianName: string;
  /** Curated Swedish name; used instead of the Norwegian one when locale is 'sv'. */
  swedishName?: string | null;
  latinName: string;
  genus: string | null;
  seasonStart: number; // 1-12
  seasonEnd: number;
  peakSeasonStart: number | null;
  peakSeasonEnd: number | null;
  habitat: string[] | null;
  mycorrhizalPartners: string[] | null;
}

/**
 * Local weather shape for the explanation logic. Decoupled from
 * WeatherSummary so callers can pass values from anywhere — the prediction
 * route's response, a manual input form, etc. — without forcing an exact
 * provider-shape match.
 */
export interface ExplanationWeather {
  temperatureC: number;
  humidityPct: number;
  /**
   * True når humidityPct er den nøytrale fallbacken (stasjonen mangler
   * fuktsensor), ikke en måling. Da skrives INGEN fuktlinje — et tall vi ikke
   * har målt skal ikke stå som «75 % luftfuktighet — moderat».
   */
  humidityEstimated?: boolean | null;
  rain3dMm: number;
  rain7dMm?: number | null;
  rain14dMm?: number | null;
  minTemp7dC?: number | null;
  maxTemp7dC?: number | null;
  /**
   * Root-zone moisture index [0,1] from computeSoilMoistureIndex. Unlike a raw
   * rain sum it dries out, so it is the signal that can tell "wet two weeks ago"
   * apart from "wet now". Null/undefined outside NO/SE and for forecast days.
   */
  soilMoistureIndex?: number | null;
}

/**
 * Real forest data near the queried point (NIBIO SR16 / CORINE). When present,
 * it supersedes the species' generic "preferred habitat" line with what's
 * actually on the ground — and the server-computed habitat reasons.
 */
export interface ExplanationForest {
  forestType: string;
  productivity: number | null;
  volumePerHa: number | null;
  /**
   * Hvor langt unna skogdataene er målt, i km. Null/undefined betyr «i punktet»
   * — bare da skriver vi «Skog her». Flisebanen i /api/prediction leverer et
   * tall (rasteret har ~7 km mellom midtpunktene), og da navngir teksten
   * avstanden i stedet for å låne presisjonen i «bonitet 20» til et sted vi
   * ikke har målt.
   */
  distanceKm?: number | null;
  /** Habitat-fit multiplier [0.2, 1.3] from computeHabitatScore. */
  habitatScore: number | null;
  /** Habitat reasons (tree-species match, soil richness), already in the reader's language. */
  habitatReasons: string[];
  /** Data provider: 'sr16' (NO/NIBIO), 'corine' (SE/Europe). Drives the credit label. */
  source?: string;
}

export interface ExplanationInput {
  weather: ExplanationWeather;
  /** Optional: when set, explanation is species-specific. */
  species?: SpeciesExplanationContext;
  /** Optional real forest data at the point (NIBIO). Supersedes generic habitat. */
  forest?: ExplanationForest | null;
  /** Count of real prior finds (GBIF/Artsdatabanken) near the point. */
  nearbyOccurrences?: number;
  /** Current month (1-12). Pass `new Date().getMonth() + 1`. */
  month: number;
  /** Reader's language. Defaults to Norwegian. */
  locale?: Locale;
}

/** Every user-facing sentence this module can produce, in one language. */
interface ExplanationCopy {
  months: string[];
  forestTypes: Record<string, string>;
  forestFallback: string;
  /**
   * `mushroom_species.habitat` og `.mycorrhizal_partners` er NORSKE ord i
   * databasen ('barskog', 'bjørk'). De limes rett inn i setningsmalene, så uten
   * disse tabellene fikk en svensk leser «Föredraget habitat: barskog,
   * blandingsskog, mose» og «Följer gran/furu/bjørk/eik» — «bjørk» kan ikke
   * engang skrives på svensk. Tom tabell for nb: der ER verdiene allerede
   * riktige, og utdataene forblir byte-identiske.
   */
  habitatTerms: Record<string, string>;
  partnerTerms: Record<string, string>;
  rainWindow: { d14: string; d7: string; d3: string };

  speciesOutOfSeason: (name: string, from: string, to: string) => string;
  speciesPeakSeason: (name: string, from: string, to: string) => string;
  speciesInSeason: (name: string) => string;
  genericHighSeason: string;
  genericShoulderSeason: string;
  genericLowSeason: string;

  occurrenceHint: string;

  tempInOptimum: (temp: number, name: string, min: number, max: number) => string;
  tempInTolerance: (temp: number, min: number, max: number) => string;
  tempOutsideTolerance: (temp: number, floor: number, ceil: number) => string;
  tempGenericGood: (temp: number) => string;
  tempGenericModerate: (temp: number) => string;
  tempGenericBad: (temp: number) => string;

  rainWellWatered: (mm: number, window: string) => string;
  rainBelowOptimum: (mm: number, window: string) => string;
  rainTooDry: (mm: number, window: string) => string;
  fruitingWindow: string;

  humidityHigh: (pct: number) => string;
  humidityModerate: (pct: number) => string;
  humidityLow: (pct: number) => string;

  forestHere: (source: string, forest: string, bonitet: string) => string;
  /** Samme opplysning når dataene er hentet et stykke unna — avstanden med. */
  forestNearby: (source: string, forest: string, bonitet: string, distance: string) => string;
  distanceMeters: (meters: number) => string;
  distanceKilometers: (km: string) => string;
  bonitetSuffix: (productivity: number) => string;
  preferredHabitat: (tags: string) => string;
  mycorrhizalPartners: (partners: string) => string;

  verdictExcellent: (who: string) => string;
  verdictGood: (who: string) => string;
  verdictOk: (who: string) => string;
  verdictWeak: (who: string) => string;
  verdictFor: (name: string) => string;
}

const COPY: Record<Locale, ExplanationCopy> = {
  nb: {
    months: [
      'januar',
      'februar',
      'mars',
      'april',
      'mai',
      'juni',
      'juli',
      'august',
      'september',
      'oktober',
      'november',
      'desember'
    ],
    forestTypes: {
      gran: 'granskog',
      furu: 'furuskog',
      bar: 'barskog',
      lauv: 'løvskog',
      blandet: 'blandingsskog',
      apent: 'åpent landskap'
    },
    forestFallback: 'skog',
    // Verdiene i databasen er allerede norske.
    habitatTerms: {},
    partnerTerms: {},
    rainWindow: { d14: '14 dager', d7: '7 dager', d3: '3 dager' },

    speciesOutOfSeason: (name, from, to) => `${name} er utenfor sesong nå (sesong: ${from}–${to})`,
    speciesPeakSeason: (name, from, to) => `Topp-sesong for ${name.toLowerCase()} (${from}–${to})`,
    speciesInSeason: (name) => `${name} er i sesong, men ikke topp-sesong`,
    genericHighSeason: 'Hovedsesong for sopp i Norge',
    genericShoulderSeason: 'Tidlig/sen sesong — variert utvalg',
    genericLowSeason: 'Lav sesong for de fleste arter',

    occurrenceHint:
      'Andre har registrert funn i nærheten før — men registreringer følger stier og veier, så bruk det som et hint',

    tempInOptimum: (temp, name, min, max) =>
      `${temp}°C — innenfor optimum for ${name.toLowerCase()} (${min}–${max}°C)`,
    tempInTolerance: (temp, min, max) => `${temp}°C — innenfor toleranse, men ikke optimum (${min}–${max}°C)`,
    tempOutsideTolerance: (temp, floor, ceil) => `${temp}°C — utenfor toleranse-vindu (${floor}–${ceil}°C)`,
    tempGenericGood: (temp) => `${temp}°C — gunstig sopp-temperatur`,
    tempGenericModerate: (temp) => `${temp}°C — moderat for sopp`,
    tempGenericBad: (temp) => `${temp}°C — for kaldt eller for varmt`,

    rainWellWatered: (mm, window) => `${mm}mm regn siste ${window} — godt fuktet`,
    rainBelowOptimum: (mm, window) => `${mm}mm regn siste ${window} — under optimum`,
    rainTooDry: (mm, window) => `Bare ${mm}mm regn siste ${window} — for tørt`,
    fruitingWindow:
      'God fukt-base de siste ukene + tørrere de siste dagene — gunstig vindu for soppfruktsetting',

    humidityHigh: (pct) => `${pct}% luftfuktighet — høyt`,
    humidityModerate: (pct) => `${pct}% luftfuktighet — moderat`,
    humidityLow: (pct) => `${pct}% luftfuktighet — tørt`,

    forestHere: (source, forest, bonitet) => `Skog her (${source}): ${forest}${bonitet}`,
    forestNearby: (source, forest, bonitet, distance) =>
      `Nærmeste skogdata (${source}, ${distance} unna): ${forest}${bonitet}`,
    distanceMeters: (meters) => `${meters} m`,
    distanceKilometers: (km) => `${km} km`,
    bonitetSuffix: (productivity) => `, bonitet ${productivity}`,
    preferredHabitat: (tags) => `Foretrukket habitat: ${tags}`,
    mycorrhizalPartners: (partners) => `Følger ${partners}`,

    verdictExcellent: (who) => `Svært gode forhold${who} nå`,
    verdictGood: (who) => `Gode forhold${who} nå`,
    verdictOk: (who) => `Brukbare forhold${who} nå`,
    verdictWeak: (who) => `Svake forhold${who} nå`,
    verdictFor: (name) => ` for ${name.toLowerCase()}`
  },
  sv: {
    months: [
      'januari',
      'februari',
      'mars',
      'april',
      'maj',
      'juni',
      'juli',
      'augusti',
      'september',
      'oktober',
      'november',
      'december'
    ],
    forestTypes: {
      gran: 'granskog',
      furu: 'tallskog',
      bar: 'barrskog',
      lauv: 'lövskog',
      blandet: 'blandskog',
      apent: 'öppet landskap'
    },
    forestFallback: 'skog',
    // Habitat-taggene slik de er skrevet i mushroom_species.habitat. Ukjente
    // verdier faller gjennom uendret — samme oppførsel som før tabellen fantes.
    habitatTerms: {
      barskog: 'barrskog',
      granskog: 'granskog',
      furuskog: 'tallskog',
      lauvskog: 'lövskog',
      løvskog: 'lövskog',
      eikeskog: 'ekskog',
      lerkeskog: 'lärkskog',
      blandingsskog: 'blandskog',
      fjellbjørkeskog: 'fjällbjörkskog',
      'fuktig skog': 'fuktig skog',
      'eldre bestand': 'äldre bestånd',
      kantsoner: 'kantzoner',
      lysninger: 'gläntor',
      brannfelt: 'brandfält',
      skog: 'skog',
      eng: 'äng',
      beite: 'betesmark',
      beitemark: 'betesmark',
      gress: 'gräs',
      gressmark: 'gräsmark',
      plen: 'gräsmatta',
      hage: 'trädgård',
      park: 'park',
      myr: 'myr',
      mose: 'mossa',
      moserik: 'mossrik',
      fuktig: 'fuktig',
      kalkrik: 'kalkrik',
      sandgrunn: 'sandmark',
      'sur jord': 'sur jord',
      sti: 'stig'
    },
    // Vertstrærne slik de er skrevet i mushroom_species.mycorrhizal_partners.
    partnerTerms: {
      gran: 'gran',
      furu: 'tall',
      bjørk: 'björk',
      bjork: 'björk',
      eik: 'ek',
      bøk: 'bok',
      ask: 'ask',
      alm: 'alm',
      osp: 'asp',
      or: 'al',
      selje: 'sälg',
      rogn: 'rönn',
      hassel: 'hassel',
      lind: 'lind',
      lerk: 'lärk',
      contorta: 'contortatall'
    },
    rainWindow: { d14: '14 dagarna', d7: '7 dagarna', d3: '3 dagarna' },

    speciesOutOfSeason: (name, from, to) => `${name} är utanför säsong nu (säsong: ${from}–${to})`,
    speciesPeakSeason: (name, from, to) => `Toppsäsong för ${name.toLowerCase()} (${from}–${to})`,
    speciesInSeason: (name) => `${name} är i säsong, men inte toppsäsong`,
    genericHighSeason: 'Högsäsong för svamp',
    genericShoulderSeason: 'Tidig/sen säsong — varierat utbud',
    genericLowSeason: 'Lågsäsong för de flesta arter',

    occurrenceHint:
      'Andra har registrerat fynd i närheten tidigare — men registreringar följer stigar och vägar, så använd det som en ledtråd',

    tempInOptimum: (temp, name, min, max) => `${temp}°C — inom optimum för ${name.toLowerCase()} (${min}–${max}°C)`,
    tempInTolerance: (temp, min, max) => `${temp}°C — inom tolerans, men inte optimum (${min}–${max}°C)`,
    tempOutsideTolerance: (temp, floor, ceil) => `${temp}°C — utanför toleransfönstret (${floor}–${ceil}°C)`,
    tempGenericGood: (temp) => `${temp}°C — gynnsam svamptemperatur`,
    tempGenericModerate: (temp) => `${temp}°C — medelbra för svamp`,
    tempGenericBad: (temp) => `${temp}°C — för kallt eller för varmt`,

    rainWellWatered: (mm, window) => `${mm}mm regn senaste ${window} — ordentligt fuktig mark`,
    rainBelowOptimum: (mm, window) => `${mm}mm regn senaste ${window} — under optimum`,
    rainTooDry: (mm, window) => `Bara ${mm}mm regn senaste ${window} — för torrt`,
    fruitingWindow:
      'Bra markfukt de senaste veckorna + torrare de senaste dagarna — gynnsamt läge för svampens fruktsättning',

    humidityHigh: (pct) => `${pct}% luftfuktighet — hög`,
    humidityModerate: (pct) => `${pct}% luftfuktighet — måttlig`,
    humidityLow: (pct) => `${pct}% luftfuktighet — låg`,

    forestHere: (source, forest, bonitet) => `Skog här (${source}): ${forest}${bonitet}`,
    forestNearby: (source, forest, bonitet, distance) =>
      `Närmaste skogsdata (${source}, ${distance} härifrån): ${forest}${bonitet}`,
    distanceMeters: (meters) => `${meters} m`,
    distanceKilometers: (km) => `${km} km`,
    bonitetSuffix: (productivity) => `, bonitet ${productivity}`,
    preferredHabitat: (tags) => `Föredraget habitat: ${tags}`,
    mycorrhizalPartners: (partners) => `Följer ${partners}`,

    verdictExcellent: (who) => `Mycket goda förhållanden${who} nu`,
    verdictGood: (who) => `Goda förhållanden${who} nu`,
    verdictOk: (who) => `Godtagbara förhållanden${who} nu`,
    verdictWeak: (who) => `Svaga förhållanden${who} nu`,
    verdictFor: (name) => ` för ${name.toLowerCase()}`
  }
};

function copyFor(locale: Locale | undefined): ExplanationCopy {
  return COPY[locale ?? DEFAULT_LOCALE] ?? COPY[DEFAULT_LOCALE];
}

/** The species name in the reader's language, falling back to Norwegian. */
function speciesName(species: SpeciesExplanationContext, locale: Locale | undefined): string {
  if (locale === 'sv') return species.swedishName?.trim() || species.norwegianName;
  return species.norwegianName;
}

function monthName(month: number, copy: ExplanationCopy): string {
  return copy.months[Math.max(1, Math.min(12, month)) - 1];
}

function inMonth(month: number, start: number, end: number): boolean {
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end;
}

function forestLabel(forestType: string, copy: ExplanationCopy): string {
  return copy.forestTypes[forestType] ?? copy.forestFallback;
}

/**
 * Oversett de norske DB-verdiene til leserens språk. Ukjente verdier slippes
 * gjennom uendret — bedre et norsk ord enn en manglende linje, og for nb er
 * tabellen tom, så utdataene er uendret.
 */
function localizeTerms(values: string[], table: Record<string, string>): string[] {
  return values.map((value) => table[value.trim().toLowerCase()] ?? value);
}

/** Credit the right data source in the habitat line. CORINE for Sweden/Europe,
 *  NIBIO otherwise (Norway / unspecified — preserves the original label). */
function forestSourceLabel(source: string | undefined): string {
  return source === 'corine' ? 'CORINE' : 'NIBIO';
}

/**
 * Avstand som en leselig streng. Under ~1 km i hele hundre meter, over i km med
 * én desimal — komma som desimalskilletegn, som både norsk og svensk bruker.
 * Gulvet på 100 m er med vilje: en avstand vi runder til «0 m» ville lest som
 * «her», og det er nettopp påstanden linja ikke skal gjenta.
 */
function formatDistance(km: number, copy: ExplanationCopy): string {
  const safe = Math.max(0, km);
  if (safe < 0.95) return copy.distanceMeters(Math.max(100, Math.round(safe * 10) * 100));
  return copy.distanceKilometers((Math.round(safe * 10) / 10).toFixed(1).replace('.', ','));
}

/** Map the habitat-fit multiplier to a color level for the UI. */
function habitatLevel(score: number | null): ExplanationLevel {
  if (score == null) return 'neutral';
  if (score >= 0.85) return 'positive';
  if (score <= 0.45) return 'negative';
  return 'neutral';
}

function pickRain(
  weather: ExplanationInput['weather'],
  copy: ExplanationCopy
): { mm: number; days: number; window: string } {
  // Prefer the longest window we have data for; mushroom prediction cares
  // most about cumulative rainfall across 1-2 weeks, not the last 3 days.
  // The DAY COUNT comes back too — the threshold is calibrated per 3 days, so
  // comparing it to a 14-day total made a drought read as "over optimum".
  if (weather.rain14dMm != null) return { mm: weather.rain14dMm, days: 14, window: copy.rainWindow.d14 };
  if (weather.rain7dMm != null) return { mm: weather.rain7dMm, days: 7, window: copy.rainWindow.d7 };
  return { mm: weather.rain3dMm, days: 3, window: copy.rainWindow.d3 };
}

/**
 * Build the explanation. Returns lines ordered by importance — season
 * first (it's the strongest gate), then weather (temp, rain, humidity),
 * then habitat / mycorrhizal hints when species context is available.
 */
export function buildExplanation(input: ExplanationInput): Explanation[] {
  const lines: Explanation[] = [];
  const copy = copyFor(input.locale);

  // ── Season ──────────────────────────────────────────────────────────
  if (input.species) {
    const { species } = input;
    const name = speciesName(species, input.locale);
    const inSeason = inMonth(input.month, species.seasonStart, species.seasonEnd);
    const inPeak =
      species.peakSeasonStart != null &&
      species.peakSeasonEnd != null &&
      inMonth(input.month, species.peakSeasonStart, species.peakSeasonEnd);

    if (!inSeason) {
      lines.push({
        level: 'negative',
        category: 'season',
        text: copy.speciesOutOfSeason(
          name,
          monthName(species.seasonStart, copy),
          monthName(species.seasonEnd, copy)
        )
      });
    } else if (inPeak) {
      lines.push({
        level: 'positive',
        category: 'season',
        text: copy.speciesPeakSeason(
          name,
          monthName(species.peakSeasonStart!, copy),
          monthName(species.peakSeasonEnd!, copy)
        )
      });
    } else {
      lines.push({ level: 'neutral', category: 'season', text: copy.speciesInSeason(name) });
    }
  } else {
    // Generic mushroom-season heuristic
    const month = input.month;
    if (month >= 8 && month <= 10) {
      lines.push({ level: 'positive', category: 'season', text: copy.genericHighSeason });
    } else if (month === 7 || month === 11) {
      lines.push({ level: 'neutral', category: 'season', text: copy.genericShoulderSeason });
    } else {
      lines.push({ level: 'negative', category: 'season', text: copy.genericLowSeason });
    }
  }

  // ── Prior finds nearby (GBIF / Artsdatabanken) ──────────────────────
  // Informational provenance only. Corrected local/seasonal validation measured
  // recurrence below chance, so it does not increase the score or confidence.
  if (input.nearbyOccurrences && input.nearbyOccurrences >= 0.05) {
    lines.push({
      level: 'neutral',
      category: 'occurrence',
      // Explicitly framed as an observation-density hint, not evidence of
      // presence: registrations cluster on trails/roads (accessibility bias),
      // so this signal is near-chance and deliberately does NOT raise the score.
      text: copy.occurrenceHint
    });
  }

  // ── Temperature ─────────────────────────────────────────────────────
  const temp = input.weather.temperatureC;
  if (input.species?.genus) {
    // Pass through SpeciesContext shape so species-level overrides (e.g.
    // svart trompetsopp vs traktkantarell) take effect.
    const speciesCtx: SpeciesContext = {
      latinName: input.species.latinName,
      genus: input.species.genus,
      seasonStart: input.species.seasonStart,
      seasonEnd: input.species.seasonEnd,
      peakSeasonStart: input.species.peakSeasonStart,
      peakSeasonEnd: input.species.peakSeasonEnd
    };
    const prefs = resolveSpeciesPreferences(speciesCtx);
    const inOptimum = temp >= prefs.tempCMin && temp <= prefs.tempCMax;
    const inTolerance = temp >= prefs.tempCFloor && temp <= prefs.tempCCeil;
    if (inOptimum) {
      lines.push({
        level: 'positive',
        category: 'temperature',
        text: copy.tempInOptimum(
          Math.round(temp),
          speciesName(input.species, input.locale),
          prefs.tempCMin,
          prefs.tempCMax
        )
      });
    } else if (inTolerance) {
      lines.push({
        level: 'neutral',
        category: 'temperature',
        text: copy.tempInTolerance(Math.round(temp), prefs.tempCMin, prefs.tempCMax)
      });
    } else {
      lines.push({
        level: 'negative',
        category: 'temperature',
        text: copy.tempOutsideTolerance(Math.round(temp), prefs.tempCFloor, prefs.tempCCeil)
      });
    }
  } else {
    if (temp >= 10 && temp <= 18) {
      lines.push({ level: 'positive', category: 'temperature', text: copy.tempGenericGood(Math.round(temp)) });
    } else if (temp >= 5 && temp <= 22) {
      lines.push({ level: 'neutral', category: 'temperature', text: copy.tempGenericModerate(Math.round(temp)) });
    } else {
      lines.push({ level: 'negative', category: 'temperature', text: copy.tempGenericBad(Math.round(temp)) });
    }
  }

  // ── Rain (cumulative window) ────────────────────────────────────────
  const rain = pickRain(input.weather, copy);
  const optMm = input.species
    ? resolveSpeciesPreferences({
        latinName: input.species.latinName,
        genus: input.species.genus,
        seasonStart: input.species.seasonStart,
        seasonEnd: input.species.seasonEnd,
        peakSeasonStart: input.species.peakSeasonStart,
        peakSeasonEnd: input.species.peakSeasonEnd
      }).rainOptMm
    : 6;
  const rainMm = Math.round(rain.mm);
  // rainOptMm is calibrated as mm over THREE days (species-scoring.ts) and is
  // applied to rain3dMm by rainFit(). Comparing it against a 14-day total made
  // 6mm/14d — 0.4 mm/day, a drought — print a green "over optimum", while the
  // ground loses ~2.7 mm/day to evapotranspiration at 15 °C. Normalise both
  // sides to mm per day so the line means the same thing in every window.
  const RAIN_OPT_WINDOW_DAYS = 3;
  const optPerDay = optMm / RAIN_OPT_WINDOW_DAYS;
  const ratePerDay = rain.mm / rain.days;
  if (ratePerDay >= optPerDay * 1.5) {
    lines.push({ level: 'positive', category: 'rain', text: copy.rainWellWatered(rainMm, rain.window) });
  } else if (ratePerDay >= optPerDay * 0.5) {
    lines.push({ level: 'neutral', category: 'rain', text: copy.rainBelowOptimum(rainMm, rain.window) });
  } else {
    lines.push({ level: 'negative', category: 'rain', text: copy.rainTooDry(rainMm, rain.window) });
  }

  // ── Fruiting window (a wet base + recent drying often triggers a flush) ──
  // A wet BASE plus a drier spell right now is the flush signal. "Wet base" has
  // to mean the same thing the rain band means, not a separate lower threshold.
  if (ratePerDay >= optPerDay * 1.5 && input.weather.rain3dMm < optMm) {
    lines.push({ level: 'positive', category: 'rain', text: copy.fruitingWindow });
  }

  // ── Humidity ────────────────────────────────────────────────────────
  // Ingen fuktlinje når verdien bare er den nøytrale fallbacken. Å utelate
  // linja er ærlig — å skrive «75 % luftfuktighet — moderat» er å oppgi en
  // måling ingen stasjon har gjort.
  const hum = Math.round(input.weather.humidityPct);
  if (input.weather.humidityEstimated) {
    // ingen linje
  } else if (input.weather.humidityPct >= 80) {
    lines.push({ level: 'positive', category: 'humidity', text: copy.humidityHigh(hum) });
  } else if (input.weather.humidityPct >= 60) {
    lines.push({ level: 'neutral', category: 'humidity', text: copy.humidityModerate(hum) });
  } else {
    lines.push({ level: 'negative', category: 'humidity', text: copy.humidityLow(hum) });
  }

  // ── Habitat ──────────────────────────────────────────────────────────
  // Prefer the REAL forest near the point (NIBIO) over the species' generic
  // preferred-habitat tags. The server already computed the match reasons;
  // we tag them by the overall habitat fit so the UI can color-code.
  //
  // «Her» sies BARE når dataene faktisk er målt i punktet (distanceKm null).
  // Kommer de fra en flis i nærheten, står avstanden i setningen: «bonitet 20»
  // er en ekte og presis måling, og presisjonen skal følge stedet den gjelder.
  if (input.forest) {
    const f = input.forest;
    const level = habitatLevel(f.habitatScore);
    const bonitetPart = f.productivity != null ? copy.bonitetSuffix(f.productivity) : '';
    const sourceLabel = forestSourceLabel(f.source);
    const forestName = forestLabel(f.forestType, copy);
    lines.push({
      level: 'neutral',
      category: 'habitat',
      text:
        f.distanceKm == null
          ? copy.forestHere(sourceLabel, forestName, bonitetPart)
          : copy.forestNearby(sourceLabel, forestName, bonitetPart, formatDistance(f.distanceKm, copy))
    });
    for (const reason of f.habitatReasons) {
      lines.push({ level, category: 'habitat', text: reason });
    }
  } else if (input.species?.habitat && input.species.habitat.length > 0) {
    lines.push({
      level: 'neutral',
      category: 'habitat',
      text: copy.preferredHabitat(localizeTerms(input.species.habitat, copy.habitatTerms).join(', '))
    });
  }

  // ── Mycorrhizal partners ────────────────────────────────────────────
  if (input.species?.mycorrhizalPartners && input.species.mycorrhizalPartners.length > 0) {
    lines.push({
      level: 'neutral',
      category: 'mycorrhizal',
      text: copy.mycorrhizalPartners(
        localizeTerms(input.species.mycorrhizalPartners, copy.partnerTerms).join('/')
      )
    });
  }

  return lines;
}

const LEVEL_MARK: Record<ExplanationLevel, string> = { positive: '✓', neutral: '•', negative: '✕' };

// Verdicts describe CONDITIONS (season + weather + forest type), NOT the odds
// of a find at this exact pixel. The temporal signal is validated (~0.89 AUC);
// spot-level spatial ranking is near-chance (~0.52, accessibility bias), so the
// old "lovende sted … her" wording overclaimed. "Gode forhold nå" is what we can
// honestly stand behind. See docs/reports/prediction-model.md.
function verdictText(score: number, copy: ExplanationCopy, speciesName?: string): string {
  const who = speciesName ? copy.verdictFor(speciesName) : '';
  if (score >= 75) return copy.verdictExcellent(who);
  if (score >= 55) return copy.verdictGood(who);
  if (score >= 35) return copy.verdictOk(who);
  return copy.verdictWeak(who);
}

export interface SpotSummary {
  verdict: string;
  reasons: string[];
}

/**
 * Persuasive, data-backed summary for one map spot (top-5 pin / species photo):
 * a confident verdict headline + evidence lines (season, weather, fruiting
 * window, forest, prior finds), each marked by level.
 */
export function buildSpotSummary(input: ExplanationInput & { score: number }): SpotSummary {
  const lines = buildExplanation(input);
  const copy = copyFor(input.locale);
  return {
    verdict: verdictText(
      input.score,
      copy,
      input.species ? speciesName(input.species, input.locale) : undefined
    ),
    reasons: lines.map((line) => `${LEVEL_MARK[line.level]} ${line.text}`)
  };
}
