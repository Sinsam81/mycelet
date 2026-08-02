export interface PredictionHotspot {
  lat: number;
  lng: number;
  count: number;
  score: number;
  /**
   * Arten scoren gjelder. Rasteret lagrer én flis per art per rute, så et sted
   * har ett tall per art — «60/100» er 60 for kantarell, ikke for sopp som
   * sådan. Kartet slår sammen til beste art per rute og navngir den.
   * Null på fallback-banen: der er punktene funnklynger på tvers av arter, ikke
   * artsfliser. (Fallback-bane-SCOREN er artsoppdelt — se `leadingSpecies`.)
   */
  speciesId?: number | null;
  /**
   * Rutestørrelsen tallet gjelder for, i grader. Kartet tegner ruta i denne
   * størrelsen i stedet for en liten sirkel, så tegningen ikke påstår mer om
   * HVOR enn modellen kan bære (romlig AUC ~0,52). Null/undefined betyr ukjent
   * oppløsning — da faller kartet tilbake til en nøytral sirkel.
   */
  gridSizeDeg?: number | null;
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
  /** Curated Swedish name; the client prefers it when the reader's language is Swedish. */
  swedishName?: string | null;
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
  /**
   * True når `humidity` ikke er målt, men den nøytrale fallbacken (stasjonen
   * mangler fuktsensor). Klienten skal da ikke skrive tallet som en måling.
   * Valgfri fordi eldre, mellomlagrede svar ikke har feltet.
   */
  humidityEstimated?: boolean | null;
  rain3dMm: number;
  rain7dMm?: number | null;
  rain14dMm?: number | null;
  minTemp7dC?: number | null;
  maxTemp7dC?: number | null;
}

/**
 * Real forest properties (NIBIO SR16 for Norway, CORINE for Sweden).
 *
 * NB: not necessarily measured AT the queried point. On the tile path the
 * values come from the nearest pre-generated tile, whose centre can be several
 * kilometres away — `distanceKm` says how far, and the UI must name it rather
 * than write «her». Null means the lookup was done for the point itself (the
 * computed_fallback path calls getForestProperties live).
 */
export interface PredictionForest {
  forestType: string;
  productivity: number | null;
  volumePerHa: number | null;
  source: 'sr16' | 'fallback';
  distanceKm?: number | null;
}

/**
 * Per-species habitat-fit result: a multiplier in [0.2, 1.3] plus the
 * reasons (tree-species match, soil richness) shown in the UI, in the
 * requesting user's language. Reasons that come from pre-generated tiles are
 * stored in Norwegian, since tiles are computed once for all readers.
 */
export interface PredictionHabitat {
  score: number;
  reasons: string[];
}

export interface PredictionResponse {
  source?: 'prediction_tiles' | 'computed_fallback';
  /**
   * Hvilken dags forhåndsberegnede raster tallet står på. Bare satt på
   * flisbanen. Normalt dagens UTC-dato; i vinduet før nattens cron har kjørt,
   * gårsdagens.
   */
  tileDate?: string;
  /**
   * Weather provider behind the snapshot — for source credit in the UI.
   * Must stay in sync with WeatherSummary['source'] in src/lib/weather/index.ts.
   * 'open_meteo' manglet her, og fordi UI-oppslaget var et Record<string, string>
   * forsvant krediteringen stille i stedet for å gi typefeil.
   */
  weatherSource?: 'met_frost' | 'smhi' | 'openweather' | 'open_meteo' | 'unavailable' | null;
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
  /**
   * Modellens tre råledd. SKALAENE ER FASTE OG ULIKE — se
   * src/lib/utils/prediction.ts: miljø 0–50, historikk 0–35, sesong 0–15.
   * De MÅ vises med nevner; «Sesong: 15» leses ellers som 15 av 100 når 15 er
   * maksverdien. Begge kodeveier skal bruke de samme nevnerne.
   *
   * Utelates når svaret ikke har en ekte oppdeling å vise (kartets flisbane har
   * bare den lagrede totalen per rute). Null-verdier ville påstått at leddene
   * ER null, som er en annen og verre feil enn å la være å vise dem.
   */
  components?: {
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
  /**
   * Arten som drar `score` når kalleren IKKE ba om en bestemt art. Uten den er
   * tallet et svar uten spørsmål — panelet setter navnet ved siden av.
   *
   * Settes av BEGGE banene: flisbanen tar den beste arten per rute fra
   * rasteret, fallback-banen regner samme artsliste live. Er den likevel tom
   * (oppslaget feilet, eller ingen art overlevde filteret), er tallet et
   * generelt forholdstall for stedet — en annen størrelse enn artstallet, og
   * panelet MÅ da si det i stedet for å la tallet stå alene.
   */
  leadingSpecies?: {
    id: number;
    norwegianName: string;
    swedishName: string | null;
    /**
     * Ferdig lokalisert navn. Settes bare av kartet, som bygger panelet fra
     * flisene mens API-kallet fortsatt er underveis og allerede har navnene
     * oversatt. Serveren sender de rå kolonnene og lar panelet velge.
     */
    displayName?: string;
  };
  /** Present when the request included ?speciesId. */
  species?: PredictionSpeciesSummary;
  /** Real forest data at the point (computed_fallback path); null when unavailable. */
  forest?: PredictionForest | null;
  /** Per-species habitat fit; present when both species + forest data exist. */
  habitat?: PredictionHabitat;
}
