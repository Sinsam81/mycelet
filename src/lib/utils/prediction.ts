export interface WeatherInput {
  temperature: number;
  humidity: number;
  rain3dMm: number;
  /**
   * Antecedent soil-water-balance index 0..1 (see weather/soil-moisture.ts).
   * Optional — when present it's the preferred moisture signal; when absent
   * scoring falls back to rain3dMm + humidity unchanged.
   */
  soilMoistureIndex?: number | null;
}

export interface PredictionComponents {
  environment: number;
  historical: number;
  seasonal: number;
}

/**
 * Maksverdien hvert råledd kan nå. De er FASTE og ULIKE, og summerer til 100.
 *
 * Både API-et og panelet skal lese nevneren herfra. Uten det driftet de fra
 * hverandre: flisbanen i /api/prediction klampet miljøleddet til 0-100 mens
 * computeCellPrediction klamper til 0-50, så «Miljø 64» og «Miljø 46» kom fra
 * to skalaer bak samme etikett. Og panelet skrev tallet uten nevner i det hele
 * tatt — «Sesong: 15» på en augustdag er maksverdien, men leses som 15 av 100.
 */
export const COMPONENT_MAX = {
  environment: 50,
  historical: 35,
  seasonal: 15
} as const;

export interface AdvancedPredictionInput {
  latitude: number;
  longitude: number;
  month: number;
  weather: WeatherInput;
}

export interface AdvancedPredictionFactors {
  vegetation: number;
  moisture: number;
  terrain: number;
  soil: number;
  weatherTrend: number;
}

export function computeEnvironmentScore(input: WeatherInput): number {
  const { temperature, humidity, rain3dMm } = input;

  let temp = 0;
  if (temperature >= 8 && temperature <= 18) temp = 20;
  else if (temperature >= 5 && temperature <= 22) temp = 12;
  else if (temperature >= 2 && temperature <= 25) temp = 6;

  let humid = 0;
  if (humidity >= 80) humid = 18;
  else if (humidity >= 70) humid = 14;
  else if (humidity >= 60) humid = 8;

  let rain = 0;
  if (rain3dMm >= 12) rain = 12;
  else if (rain3dMm >= 5) rain = 8;
  else if (rain3dMm >= 2) rain = 4;

  return clamp(temp + humid + rain, 0, 50);
}

export function computeHistoricalScore(recent30d: number, recent365d: number): number {
  const shortTerm = Math.min(20, recent30d * 2.5);
  const longTerm = Math.min(15, recent365d * 0.3);
  return clamp(shortTerm + longTerm, 0, 35);
}

export function computeSeasonalScore(month: number): number {
  if (month >= 8 && month <= 10) return 15;
  if (month === 7 || month === 11) return 10;
  if (month >= 5 && month <= 6) return 5;
  return 2;
}

export function computeWeatherTrendScore(input: WeatherInput): number {
  let score = 0;

  if (input.rain3dMm >= 8 && input.rain3dMm <= 35) score += 45;
  else if (input.rain3dMm >= 4) score += 28;
  else if (input.rain3dMm > 0) score += 12;

  if (input.temperature >= 7 && input.temperature <= 16) score += 30;
  else if (input.temperature >= 4 && input.temperature <= 20) score += 18;

  if (input.humidity >= 78) score += 25;
  else if (input.humidity >= 65) score += 15;

  return clamp(score, 0, 100);
}

export function computeAdvancedFactors(input: AdvancedPredictionInput): AdvancedPredictionFactors {
  // Unknown spatial factors must be neutral, not coordinate-seeded pseudo-data.
  // computeCellPrediction replaces these values with real forest/elevation data
  // when available. Keeping 50 here makes missing coverage explicit and stable.
  const vegetation = 50;
  const terrain = 50;
  const soil = 50;
  const weatherTrend = computeWeatherTrendScore(input.weather);
  // Soil-water balance is the better moisture proxy (it decays through dry
  // spells, unlike a raw rain sum) — prefer it, blended with humidity. Fall
  // back to the humidity + recent-rain heuristic when it isn't available.
  const moisture =
    input.weather.soilMoistureIndex != null
      ? clamp(Math.round(input.weather.soilMoistureIndex * 100 * 0.7 + input.weather.humidity * 0.3), 0, 100)
      : clamp(Math.round(input.weather.humidity * 0.7 + input.weather.rain3dMm * 1.4), 0, 100);

  return {
    vegetation,
    moisture,
    terrain,
    soil,
    weatherTrend
  };
}

export function computeAdvancedEnvironmentScore(factors: AdvancedPredictionFactors): number {
  return clamp(
    Math.round(
      factors.vegetation * 0.3 +
        factors.moisture * 0.25 +
        factors.terrain * 0.12 +
        factors.soil * 0.1 +
        factors.weatherTrend * 0.23
    ),
    0,
    100
  );
}

export function computeTotalScore(components: PredictionComponents): number {
  return clamp(components.environment + components.historical + components.seasonal, 0, 100);
}

/**
 * ÉN STIGE FOR HELE APPEN — farger, dommer og `condition` i API-svaret.
 *
 * Tersklene er kalibrert mot den FAKTISKE fordelingen, ikke mot en tenkt
 * 0–100-skala. Målt over hele prediction_tiles i produksjon 2026-08-02
 * (n = 1000):
 *
 *     spenn 43–85 · p25 = 50 · median = 55 · p75 = 59 · p95 = 80
 *
 * De gamle tersklene var 75/55/35. Laveste score som FINNES er 43, så «poor»
 * krevde en verdi under minimum — bøtta var uoppnåelig, og 0 % av rasteret havnet
 * der. 71 % havnet i «moderate». Kartet ble derfor én sammenhengende gulfarge, og
 * appen kunne aldri si at det var lite sopp. Det var ikke ærlighet, det var en
 * feilkalibrert skala.
 *
 * Årsaken til at scoren ikke sprer seg av seg selv: vegetation/terrain/soil er
 * konstanten 50 når skogdata mangler (se computeAdvancedFactors), og de veier
 * 52 % av miljøleddet — gulv 26, tak 74. Det er ikke rettet; tersklene tar høyde
 * for det. Se docs/kalibrering-av-dommene.md.
 *
 * DE MÅ STÅ ETT STED. Da fargekartet og dommene hadde hver sin stige, malte kartet
 * det beste terrenget i fargen brukeren leser som «ingenting her» — se
 * kommentaren i condition-colors.ts. Verdiktteksten i prediction-explanation.ts
 * importerer disse, så en grønn ring og en grønn rute alltid betyr det samme.
 *
 * Etterprøv i uke 38, når rasteret dekker høysesong: fordelingen flytter seg
 * oppover, og «excellent» skal ikke fyre på halve kartet.
 */
export const CONDITION_THRESHOLDS = {
  excellent: 72, // topp ~10 % av det som faktisk forekommer
  good: 60, // topp ~25 %
  moderate: 50 // rundt medianen
} as const;

export function scoreToCondition(score: number): 'poor' | 'moderate' | 'good' | 'excellent' {
  if (score >= CONDITION_THRESHOLDS.excellent) return 'excellent';
  if (score >= CONDITION_THRESHOLDS.good) return 'good';
  if (score >= CONDITION_THRESHOLDS.moderate) return 'moderate';
  return 'poor';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
