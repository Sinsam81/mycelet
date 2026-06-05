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

/**
 * Real forest properties at the queried point (NIBIO SR16 for Norway).
 * Present on the computed_fallback path when forest data is available.
 */
export interface PredictionForest {
  forestType: string;
  productivity: number | null;
  volumePerHa: number | null;
  source: 'sr16' | 'fallback';
}

/**
 * Per-species habitat-fit result: a multiplier in [0.2, 1.3] plus the
 * Norwegian reasons (tree-species match, soil richness) shown in the UI.
 */
export interface PredictionHabitat {
  score: number;
  reasons: string[];
}

export interface PredictionResponse {
  source?: 'prediction_tiles' | 'computed_fallback';
  /** Weather provider behind the snapshot — for source credit in the UI. */
  weatherSource?: 'met_frost' | 'smhi' | 'openweather' | 'unavailable' | null;
  /** Count of real prior finds (GBIF) near the queried point. */
  nearbyOccurrences?: number;
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
  /** Real forest data at the point (computed_fallback path); null when unavailable. */
  forest?: PredictionForest | null;
  /** Per-species habitat fit; present when both species + forest data exist. */
  habitat?: PredictionHabitat;
}
