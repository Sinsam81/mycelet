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
  weather: {
    temperature: number;
    humidity: number;
    rain3dMm: number;
  };
  counts: {
    findingsInArea: number;
    recent30d: number;
    recent365d: number;
  };
  hotspots: PredictionHotspot[];
}
