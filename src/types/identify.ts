export interface IdentifySuggestion {
  name: string;
  norwegianName?: string;
  commonNames: string[];
  probability: number;
  edibility: string;
  description: string | null;
  taxonomy: Record<string, string> | null;
  similarImages: string[];
  speciesId?: number;
  // Local context fused from the app's own data (see identify-ranking.ts)
  inSeason?: boolean;
  peakSeason?: boolean;
  nearbyFindings?: number;
}

export interface IdentifyResultPayload {
  originalImageDataUrl: string;
  location: {
    latitude: number | null;
    longitude: number | null;
  };
  suggestions: IdentifySuggestion[];
  isPlant: boolean;
}
