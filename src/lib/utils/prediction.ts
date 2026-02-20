export interface WeatherInput {
  temperature: number;
  humidity: number;
  rain3dMm: number;
}

export interface PredictionComponents {
  environment: number;
  historical: number;
  seasonal: number;
}

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

export function computeVegetationProxyScore(latitude: number, longitude: number, month: number): number {
  const seasonalBoost = month >= 7 && month <= 10 ? 12 : month >= 5 && month <= 11 ? 7 : 2;
  const geoNoise = Math.round(pseudoNoise(latitude, longitude, 17) * 25);
  return clamp(50 + seasonalBoost + geoNoise, 0, 100);
}

export function computeTerrainProxyScore(latitude: number, longitude: number): number {
  const slopeNoise = Math.round(pseudoNoise(latitude, longitude, 31) * 60);
  return clamp(25 + slopeNoise, 0, 100);
}

export function computeSoilProxyScore(latitude: number, longitude: number): number {
  const calcNoise = Math.round(pseudoNoise(latitude, longitude, 71) * 70);
  return clamp(20 + calcNoise, 0, 100);
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
  const vegetation = computeVegetationProxyScore(input.latitude, input.longitude, input.month);
  const terrain = computeTerrainProxyScore(input.latitude, input.longitude);
  const soil = computeSoilProxyScore(input.latitude, input.longitude);
  const weatherTrend = computeWeatherTrendScore(input.weather);
  const moisture = clamp(Math.round(input.weather.humidity * 0.7 + input.weather.rain3dMm * 1.4), 0, 100);

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

export function scoreToCondition(score: number): 'poor' | 'moderate' | 'good' | 'excellent' {
  if (score >= 75) return 'excellent';
  if (score >= 55) return 'good';
  if (score >= 35) return 'moderate';
  return 'poor';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function pseudoNoise(lat: number, lng: number, seed: number): number {
  const raw = Math.sin(lat * 12.9898 + lng * 78.233 + seed) * 43758.5453;
  return raw - Math.floor(raw);
}
