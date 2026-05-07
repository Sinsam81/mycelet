export interface PredictionHotspot {
  lat: number;
  lng: number;
  count: number;
  score: number;
}

export interface PredictionTile {
  id: string;
  tile_date: string;
  species_id: number | null;
  source: 'mvp_baseline' | 'sentinel_batch' | 'hybrid';
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  score: number;
  confidence: number | null;
  components: Record<string, number>;
  metadata: Record<string, unknown>;
}

/**
 * Per-species context attached to the response when ?speciesId=N is set.
 * Used by the client to render PredictionExplanation without an extra
 * round-trip to fetch species details.
 */
export interface PredictionSpeciesSummary {
  id: number;
  norwegianName: string;
  latinName: string;
  genus: string | null;
  seasonStart: number;
  seasonEnd: number;
  peakSeasonStart: number | null;
  peakSeasonEnd: number | null;
  habitat: string[] | null;
  mycorrhizalPartners: string[] | null;
}

/**
 * Weather snapshot embedded in a prediction response. Extended fields
 * (rain7d/14d, min/max temp 7d) are populated when the upstream
 * provider — Frost or SMHI — returns them; OpenWeather only fills
 * rain3dMm.
 */
export interface PredictionWeatherSnapshot {
  temperature: number;
  humidity: number;
  rain3dMm: number;
  rain7dMm?: number | null;
  rain14dMm?: number | null;
  minTemp7dC?: number | null;
  maxTemp7dC?: number | null;
}

export interface PredictionResponse {
  source?: 'prediction_tiles' | 'computed_fallback';
  access?: 'free_limited' | 'premium_full';
  upsellMessage?: string;
  model?: {
    version: string;
    factors: {
      vegetation: number;
      moisture: number;
      terrain: number;
      soil: number;
      weatherTrend: number;
    };
  };
  score: number;
  baseScore?: number;
  speciesFit?: number | null;
  condition: 'poor' | 'moderate' | 'good' | 'excellent';
  components: {
    environment: number;
    historical: number;
    seasonal: number;
    vegetation?: number;
    moisture?: number;
    terrain?: number;
    soil?: number;
    weatherTrend?: number;
  };
  weather: PredictionWeatherSnapshot;
  counts: {
    findingsInArea: number;
    recent30d: number;
    recent365d: number;
  };
  hotspots: PredictionHotspot[];
  /** Present when the request included ?speciesId. */
  species?: PredictionSpeciesSummary;
}
