/**
 * Dyplenke til et bestemt kartutsnitt: `/map?lat=…&lng=…&zoom=…`.
 *
 * Lenka fantes i UI-et lenge før kartet leste den. «Best i landet i dag» på
 * forsiden lover «trykk for å se på kartet» og peker på nettopp denne URL-en
 * for alle 22 områdene — men /map deklarerte bare `{ mine?: string }` i
 * searchParams, så lat/lng ble forkastet i stillhet. Kartet åpnet på Oslo og
 * hoppet deretter til brukerens egen posisjon når GPS-en løste seg. Trykket du
 * på Bodø, havnet du hjemme hos deg selv.
 *
 * Validering hører hjemme her, ikke i sidekomponenten: verdiene kommer fra en
 * URL en hvilken som helst bruker kan skrive. En NaN videre til Leaflet gir et
 * kart som ikke tegner seg i det hele tatt.
 */

export interface MapViewParams {
  lat: number;
  lng: number;
  zoom: number;
}

/** Samme tak som kartet selv bruker (`maxZoom: 20`). */
const MIN_ZOOM = 3;
const MAX_ZOOM = 20;
const DEFAULT_ZOOM = 11;

function tall(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Leser et gyldig kartutsnitt ut av søkeparametrene, eller null.
 *
 * Alt-eller-ingenting med vilje: en lenke med bare `lat` er en ødelagt lenke,
 * og å sentrere på halve koordinaten ville flyttet kartet til et vilkårlig
 * sted i stedet for å la det åpne der det pleier.
 */
export function parseMapViewParams(params: {
  lat?: string | string[];
  lng?: string | string[];
  zoom?: string | string[];
}): MapViewParams | null {
  const lat = tall(params.lat);
  const lng = tall(params.lng);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;

  const rawZoom = tall(params.zoom);
  const zoom =
    rawZoom === null ? DEFAULT_ZOOM : Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(rawZoom)));

  return { lat, lng, zoom };
}
