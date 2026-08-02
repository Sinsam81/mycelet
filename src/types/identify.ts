export interface IdentifyLookAlike {
  name: string;
  danger: string;
  speciesId?: number;
  imageUrl?: string | null;
  edibility?: string | null;
  /** Why the two get confused (similarity_description). */
  whySimilar?: string | null;
  /** How to tell them apart (difference_description) — the actionable bit. */
  howToTell?: string | null;
}

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
  /** The app's curated species photo (mushroom_species.primary_image_url). */
  imageUrl?: string | null;
  // Local context fused from the app's own data (see identify-ranking.ts)
  inSeason?: boolean;
  peakSeason?: boolean;
  nearbyFindings?: number;
  dangerousLookAlikes?: IdentifyLookAlike[];
  /**
   * Hva vi VET om forvekslingsarter for dette forslaget. Uten dette feltet
   * rendrer «ingen registrert» og «sjekket, ingen farlige» helt likt.
   */
  lookAlikeData?: 'present' | 'none_recorded' | 'unavailable';
}

export interface IdentifyResultPayload {
  originalImageDataUrl: string;
  location: {
    latitude: number | null;
    longitude: number | null;
  };
  suggestions: IdentifySuggestion[];
  isPlant: boolean;
  /**
   * Satt når serveren ikke fikk lest spiselighet eller farlige
   * forvekslingsarter for ett eller flere forslag. Fraværet av en advarsel
   * betyr da IKKE at det er trygt — bare at vi ikke vet.
   */
  safetyDataIncomplete?: boolean;
}
