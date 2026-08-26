/**
 * "Perfekt soppdag" assessment — decides whether *today* is a great day to go
 * mushroom foraging in a region, from weather + season alone. It answers "is it
 * mushroom weather right now?" (area-agnostic), NOT "is this exact spot good?"
 * (that's the per-cell prediction).
 *
 * This is the reusable brain behind the proactive "perfect day" notification:
 * a daily job (native push when the app ships, or a cron) calls it per user
 * area and, when `optimal`, sends `title` + `message` (+ `reasons` as the
 * data-backed "why"). It can also power an in-app banner.
 *
 * Pure + deterministic given (weather, month) — easy to unit-test and to reason
 * about. Calibrated by hand from field knowledge; tune against real data later.
 */

import { buildExplanation, type ExplanationWeather } from '@/lib/utils/prediction-explanation';
import { FORECAST_GREEN_MIN } from '@/lib/utils/forecast-scale';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

export interface MushroomDayAssessment {
  /** True only inside the broad mushroom season and when the score clears the bar. */
  optimal: boolean;
  /** 0–100 "is it mushroom weather" score. */
  score: number;
  /** Short headline, e.g. "🍄 Perfekt soppdag i dag!". */
  title: string;
  /** One-line body for the notification / banner. */
  message: string;
  /** Data-backed positive reasons (season, rain, temp, humidity) — the "why". */
  reasons: string[];
}

/** Cumulative rainfall over the longest window we have data for. */
function cumulativeRain(weather: ExplanationWeather): number {
  if (weather.rain14dMm != null) return weather.rain14dMm;
  if (weather.rain7dMm != null) return weather.rain7dMm;
  return weather.rain3dMm * 3; // rough extrapolation from the 3-day figure
}

/**
 * Sesongleddets vekt (0-35) per måned — nivået, ikke trappen.
 *
 * August–oktober er høysesong; juli og november er skuldre; juni er såvidt i
 * gang. Verdiene er de samme som før; det er OVERGANGEN mellom dem som er ny.
 */
const SEASON_WEIGHT_BY_MONTH = [0, 0, 0, 0, 0, 10, 22, 35, 35, 35, 22, 0];

/**
 * Er måneden innenfor den generelle soppsesongen?
 *
 * UTLEDET av vekttabellen over, ikke skrevet ned en gang til. Det var poenget:
 * flush.ts hadde sin egen port (`month < 5 || month > 11`) mens denne filen
 * brukte `month >= 6`, og de to står rett over hverandre i det samme kortet på
 * forsiden.
 *
 * Følgen var målt over 2 212 maidager: 540 (24,4 %) viste det grønne banneret
 * «Forholdene er modne nå 🍄 — soppen kommer nå», og 540 av 540 (100 %) hadde en
 * gul ring over seg som sa at forholdene ikke var optimale. `optimal` forekommer
 * i 0,0 % av maidagene, så motsigelsen var strukturell, ikke et uhell i været.
 *
 * Mai er ikke et vilkårlig valg: SEASON_WEIGHT_BY_MONTH gir mai vekten 0. Appens
 * egen scoring har hele tiden regnet mai som utenfor sesongen — det var bare
 * flush-banneret som ikke visste det.
 *
 * NB: dette er den GENERELLE sesongen. Arter med egen fenologikurve (morkler om
 * våren) vurderes mot sin egen kurve — se den artsspesifikke porten i flush.ts,
 * som nå kjøres FØR denne.
 */
export function isInMushroomSeason(month: number): boolean {
  const m = Math.round(month);
  if (m < 1 || m > 12) return false;
  return SEASON_WEIGHT_BY_MONTH[m - 1] > 0;
}

/** Dagen midt i hver måned, som dag-i-året (ikke-skuddår). Ankerpunktene. */
const MID_MONTH_DAY_OF_YEAR = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

/**
 * Glatt sesongvekt for en gitt dag i måneden.
 *
 * FØR var dette en trapp: `month >= 8 && month <= 10 → 35`, ellers 22, 10 eller
 * 0. Med identisk vær ga det et sprang på 13-22 poeng ved midnatt hver 1. i
 * måneden — 31. okt 100, 1. nov 87; 30. nov 87, 1. des 65. Sju-dagersstripen
 * krysser et månedsskifte seks dager i måneden, så brukeren så stripen falle et
 * helt hakk uten at noe i været hadde endret seg. Det er nøyaktig samme feilklasse
 * som regnvindus-spranget som allerede er meldt fra om én gang (se
 * headeren i src/app/api/mushroom-forecast/route.ts).
 *
 * Nå interpoleres det lineært mellom månedenes MIDTPUNKTER. To konsekvenser
 * som er verdt å kjenne:
 *  - Midt i måneden er verdien nøyaktig den gamle, så nivået i høysesongen står.
 *    Kallere som bare oppgir måned (ingen `dayOfMonth`) behandles som midt i
 *    måneden og får derfor eksakt samme tall som før.
 *  - På skulderdagene glir tallet. Første halvdel av august ligger noen poeng
 *    lavere enn før, siste halvdel av juli noen poeng høyere — som er det
 *    interpolasjonen betyr: 2. august ligner mer på slutten av juli enn på
 *    midten av september.
 */
export function seasonWeight(month: number, dayOfMonth?: number): number {
  const m = Math.max(1, Math.min(12, Math.round(month)));
  if (dayOfMonth == null) return SEASON_WEIGHT_BY_MONTH[m - 1];

  const anchor = MID_MONTH_DAY_OF_YEAR[m - 1];
  const day = MID_MONTH_DAY_OF_YEAR[m - 1] + (Math.round(dayOfMonth) - 15);

  // Hvilke to måneder dagen ligger mellom, og hvor langt (0-1) mellom dem.
  const goingForward = day >= anchor;
  const otherMonth = goingForward ? (m % 12) + 1 : ((m + 10) % 12) + 1;
  let otherAnchor = MID_MONTH_DAY_OF_YEAR[otherMonth - 1];
  // Året går rundt: desember → januar og januar → desember.
  if (goingForward && otherAnchor < anchor) otherAnchor += 365;
  if (!goingForward && otherAnchor > anchor) otherAnchor -= 365;

  const span = Math.abs(otherAnchor - anchor);
  const t = span === 0 ? 0 : Math.min(1, Math.abs(day - anchor) / span);
  const from = SEASON_WEIGHT_BY_MONTH[m - 1];
  const to = SEASON_WEIGHT_BY_MONTH[otherMonth - 1];
  return from + (to - from) * t;
}

/**
 * User-facing copy per language. These strings are served straight to the client
 * (home card, push notification), so the caller must pass the reader's locale —
 * a Swedish user seeing Norwegian here was the bug this table fixes.
 */
interface DayCopy {
  titleOptimal: string;
  titleNormal: string;
  messageOptimal: string;
  messageNormal: string;
  /**
   * Hvorfor dagen IKKE er optimal. Uten disse var det én setning bak hele
   * spennet — se kommentaren over verdictFor().
   */
  titleDrySoil: string;
  messageDrySoil: string;
  titleLittleRain: string;
  messageLittleRain: string;
  titleOffSeason: string;
  messageOffSeason: string;
}

/**
 * Portene for «perfekt soppdag».
 *
 * ⚠️ TERSKELEN ER DEN SAMME SOM FARGEN BRUKER, OG MÅ FORBLI DET.
 *
 * Den sto på 65 mens ringen krevde 85 for å bli grønn — to terskler, tjue poeng
 * fra hverandre, som dømte nøyaktig samme tall på nøyaktig samme kort. Følgen
 * var at overskriften «🍄 Perfekt soppdag i dag!» sto over en GUL ring.
 * Uttømmende oppregning av nåbare værkombinasjoner i høysesong: 31 passerer
 * optimal-porten, og 25 av dem (81 %) tegnes gult.
 *
 * 65 var dessuten under 25-persentilen i appens egen målte sesongfordeling
 * (p25 = 73, median = 86, n = 99 176 dagscorer). «Perfekt» kunne altså fyre på
 * en dag som var dårligere enn fem av seks dager i sesongen.
 *
 * forecast-scale.ts hevdet å ha samlet «fire ulike terskelsett». Denne var det
 * femte, og den styrte den mest bombastiske setningen appen har.
 */
const OPTIMAL_SCORE_MIN = FORECAST_GREEN_MIN;
const OPTIMAL_RAIN_MIN_MM = 15;

/**
 * Fra hvilket tall kortet skal FORKLARE hvorfor dagen ikke ble perfekt.
 *
 * Bevisst lavere enn feiringsporten, og bevisst et eget tall. Da OPTIMAL_SCORE_MIN
 * ble hevet til 85, ville en felles konstant tatt med seg forklaringene i fallet:
 * en dag på 78 med tørr mark ville mistet «Alt stemmer — bortsett fra marka» og
 * fått den intetsigende «ikke helt optimale» i stedet. Det var nettopp den
 * intetsigende varianten forrige runde fjernet.
 */
const EXPLAIN_SCORE_MIN = 65;

const COPY: Record<Locale, DayCopy> = {
  nb: {
    titleOptimal: '🍄 Perfekt soppdag i dag!',
    titleNormal: 'Soppforhold i dag',
    messageOptimal: 'Forholdene er ideelle for å finne sopp i dag — ta turen ut! 🍄',
    messageNormal: 'Forholdene er ikke helt optimale akkurat nå. Sjekk kartet for ditt nærområde.',
    titleDrySoil: 'Alt stemmer — bortsett fra marka',
    messageDrySoil:
      'Vær og sesong er på plass, men marka er fortsatt for tørr etter tørkeperioden. Den trenger et skikkelig regn, så følger soppen på 1–2 uker.',
    titleLittleRain: 'Mildt nok — men det har regnet for lite',
    messageLittleRain:
      'Temperatur og sesong stemmer, men det har kommet lite nedbør de siste to ukene. Første ordentlige regnværet setter det i gang.',
    titleOffSeason: 'Utenom soppsesongen',
    messageOffSeason: 'Det er utenfor hovedsesongen. Kom tilbake fra sensommeren.'
  },
  sv: {
    titleOptimal: '🍄 Perfekt svampdag i dag!',
    titleNormal: 'Svampförhållanden i dag',
    messageOptimal: 'Förhållandena är idealiska för att hitta svamp i dag — ut i skogen! 🍄',
    messageNormal: 'Förhållandena är inte helt optimala just nu. Kolla kartan över ditt närområde.',
    titleDrySoil: 'Allt stämmer — utom marken',
    messageDrySoil:
      'Väder och säsong är på plats, men marken är fortfarande för torr efter torkan. Den behöver ett ordentligt regn, sedan följer svampen om 1–2 veckor.',
    titleLittleRain: 'Milt nog — men det har regnat för lite',
    messageLittleRain:
      'Temperatur och säsong stämmer, men det har kommit lite nederbörd de senaste två veckorna. Första ordentliga regnet sätter i gång det.',
    titleOffSeason: 'Utanför svampsäsongen',
    messageOffSeason: 'Det är utanför högsäsongen. Kom tillbaka i slutet av sommaren.'
  }
};

export function assessMushroomDay(
  weather: ExplanationWeather,
  month: number,
  locale: Locale = DEFAULT_LOCALE,
  /**
   * Dagen i måneden (1-31). Uten den behandles dagen som midt i måneden, som
   * gir nøyaktig de gamle tallene — se seasonWeight.
   */
  dayOfMonth?: number
): MushroomDayAssessment {
  let score = 0;

  // Season (0–35) — the strongest gate. Glatt over månedsskiftet, se seasonWeight.
  score += seasonWeight(month, dayOfMonth);

  // Cumulative rain (0–30) — a moist base is what drives fruiting.
  const rain = cumulativeRain(weather);
  if (rain >= 40) score += 30;
  else if (rain >= 20) score += 20;
  else if (rain >= 10) score += 10;

  // Temperature (0–20) — mild is best.
  const t = weather.temperatureC;
  if (t >= 10 && t <= 18) score += 20;
  else if (t >= 6 && t <= 22) score += 10;

  // Humidity (0–15).
  const h = weather.humidityPct;
  if (h >= 80) score += 15;
  else if (h >= 65) score += 8;

  score = Math.max(0, Math.min(100, Math.round(score)));

  // Ringen viser 0–100, men teksten hadde bare TO tilstander. Da `optimal` er
  // portet på fire vilkår som ringen ikke kjenner, kunne tallet og ordene peke
  // hver sin vei — og de gjorde det ofte.
  //
  // Målt over jun–nov (ERA5, 14 steder NO+SE, 2014–2024, n = 28 182 stedsdøgn):
  // nøyaktig 2 distinkte titler; 50 % fikk «Forholdene er ikke helt optimale»,
  // og bak den ENE setningen lå score fra 5 til 100 (94 distinkte ringtall). I
  // aug–okt hadde 15,8 % av dagene score ≥ 80 uten å være optimale — gul ring
  // med 80–100 over «ikke helt optimale» — og 53 døgn viste bokstavelig
  // «100 av 100» i gult. Ekte eksempel: Oslo 2023-09-07, score 100, 52,7 mm regn
  // på 14 dager, men soil = 0,438 → vetoet slo inn.
  //
  // Vetoet er RIKTIG — marka var tørr. Feilen var at kortet ikke sa hvorfor.
  // Nå navngir teksten porten som ikke slapp gjennom, så tallet og ordene henger
  // sammen, og brukeren får vite hva som mangler i stedet for bare at noe gjør
  // det.
  function verdictFor(input: {
    copy: DayCopy;
    optimal: boolean;
    score: number;
    inSeasonWindow: boolean;
    rain: number;
    moistNow: boolean;
  }): { title: string; message: string } {
    const { copy: c, optimal: ok, score: s, inSeasonWindow: iw, rain: r, moistNow: m } = input;
    if (ok) return { title: c.titleOptimal, message: c.messageOptimal };
    if (!iw) return { title: c.titleOffSeason, message: c.messageOffSeason };
    // Bare når tallet er høyt nok til at brukeren undrer seg over avviket.
    // Under det er «ikke helt optimalt» en dekkende beskrivelse i seg selv.
    // NB: EXPLAIN_SCORE_MIN, ikke OPTIMAL_SCORE_MIN — se kommentaren ved dem.
    if (s >= EXPLAIN_SCORE_MIN) {
      if (!m) return { title: c.titleDrySoil, message: c.messageDrySoil };
      if (r < OPTIMAL_RAIN_MIN_MM) return { title: c.titleLittleRain, message: c.messageLittleRain };
    }
    return { title: c.titleNormal, message: c.messageNormal };
  }

  // Only celebrate inside the broad mushroom season; never in deep winter, even
  // if a freak-warm-and-wet day would otherwise score high. A genuinely good day
  // also needs a real moisture base — a dry spell never fruits, however mild or
  // in-season it is.
  const inSeasonWindow = month >= 6 && month <= 11;

  // A 14-day rain SUM stays high for two weeks after one old downpour, so on its
  // own it will celebrate a day when the ground has long since dried out. When
  // the bucket model is available it may VETO the celebration — it can never
  // lift a low score. 0.55 is the same gate assessFlush uses to return
  // 'fruiting', so the headline and the flush banner directly beneath it cannot
  // contradict each other. Without this, the card could read "🍄 Perfekt
  // soppdag i dag!" above a grey "Tørt — soppen venter på regn".
  //
  // Null or undefined (OpenWeather, forecast days) leaves the veto inert.
  const moistNow = weather.soilMoistureIndex == null || weather.soilMoistureIndex >= 0.55;
  const optimal = score >= OPTIMAL_SCORE_MIN && inSeasonWindow && rain >= OPTIMAL_RAIN_MIN_MM && moistNow;

  const reasons = buildExplanation({ weather, month, locale })
    .filter((line) => line.level === 'positive')
    // Don't list "godt fuktet" as a reason on a day the moisture model vetoed.
    .filter((line) => moistNow || line.category !== 'rain')
    .map((line) => line.text);

  const copy = COPY[locale] ?? COPY[DEFAULT_LOCALE];
  const { title, message } = verdictFor({ copy, optimal, score, inSeasonWindow, rain, moistNow });

  return { optimal, score, title, message, reasons };
}
