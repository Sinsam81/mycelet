/**
 * HVOR STORT ER ET «LOVENDE STED» EGENTLIG?
 *
 * Toppstedene kommer fra /api/prediction/grid, som legger et n×n-rutenett over
 * kartutsnittet (n = 5–7) og scorer SENTERET i hver rute. Koordinatene kartet
 * får tilbake er altså ikke et sted modellen har vurdert punktvis — de er
 * adressen til en rute. Med 5 km søkeradius og n = 7 er hver rute ~1,4 km bred;
 * ved 35 km er den 10 km bred.
 *
 * Den romlige valideringen (26 menneskeanbefalte soppsteder mot kontrollpunkter
 * 3–15 km unna) viser samme sak fra den andre siden: modellen skiller skog fra
 * ikke-skog (AUC 0,692), men mellom to skogspunkter noen kilometer fra hverandre
 * er forskjellen ikke signifikant (AUC 0,654, p = 0,44). Vi vet altså noe om
 * ruta, ikke om punktet i den.
 *
 * Derfor tegnes toppstedene som en sirkel i rutas egen oppløsning. Denne filen
 * regner ut den radiusen, og bare den — så tallet kan testes uten Leaflet.
 */

/** Meter per breddegrad. Godt nok her: vi tegner et søkeområde, ikke en grense. */
const METERS_PER_DEGREE_LAT = 111_320;

/**
 * Gulv for radiusen. Det fineste rutenettet vi noen gang regner ut er 10 km / 7
 * ≈ 1,4 km brede ruter, altså ~700 m halvbredde. Skulle celledataene mangle,
 * er 500 m fortsatt et område og ikke et punkt — vi vil heller tegne litt for
 * lite enn å påstå presisjon vi ikke har.
 */
export const MIN_SEARCH_AREA_RADIUS_M = 500;

export type CellSpans = {
  /** Rutehøyde i grader (nord–sør). */
  latSpan: number;
  /** Rutebredde i grader (øst–vest). */
  lngSpan: number;
};

export type SpotBounds = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

/**
 * Cellestørrelsen rutenettet faktisk brukte, regnet av boksen og n.
 * Speiler utregningen i src/app/api/prediction/grid/route.ts.
 */
export function cellSpansFromBounds(bounds: SpotBounds, n: number): CellSpans {
  const cells = Math.max(1, Math.round(n));
  return {
    latSpan: Math.abs(bounds.maxLat - bounds.minLat) / cells,
    lngSpan: Math.abs(bounds.maxLng - bounds.minLng) / cells
  };
}

/**
 * Halve cellebredden i meter — sirkelen som får plass inne i ruta.
 *
 * Vi tar den minste av de to halvdelene, slik at sirkelen holder seg innenfor
 * ruta i begge retninger i stedet for å flyte inn over naborutene vi ikke
 * anbefalte.
 */
export function searchAreaRadiusMeters(spans: CellSpans, lat: number): number {
  const heightM = spans.latSpan * METERS_PER_DEGREE_LAT;
  const widthM = spans.lngSpan * METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
  const half = Math.min(heightM, widthM) / 2;
  if (!Number.isFinite(half) || half <= 0) return MIN_SEARCH_AREA_RADIUS_M;
  return Math.max(MIN_SEARCH_AREA_RADIUS_M, half);
}

/**
 * Radiusen for et svar fra grid-ruta. Bruker cellestørrelsen serveren oppgir
 * når den er der (den kjenner sin egen effektive n — gratisbrukere får 5, ikke
 * 7), og faller ellers tilbake på boksen vi selv sendte inn.
 */
export function searchAreaRadiusForResponse(input: {
  bounds: SpotBounds;
  requestedN: number;
  lat: number;
  cellLatSpan?: unknown;
  cellLngSpan?: unknown;
  n?: unknown;
}): number {
  const latSpan = Number(input.cellLatSpan);
  const lngSpan = Number(input.cellLngSpan);
  const spans =
    Number.isFinite(latSpan) && Number.isFinite(lngSpan) && latSpan > 0 && lngSpan > 0
      ? { latSpan, lngSpan }
      : cellSpansFromBounds(input.bounds, Number(input.n) || input.requestedN);
  return searchAreaRadiusMeters(spans, input.lat);
}
