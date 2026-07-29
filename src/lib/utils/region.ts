export type NordicCountry = 'NO' | 'SE';
export type Region = NordicCountry | 'other';

interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

const NORWAY: BoundingBox = { minLat: 57.7, maxLat: 71.5, minLon: 4.0, maxLon: 31.5 };
const SWEDEN: BoundingBox = { minLat: 55.2, maxLat: 69.1, minLon: 10.9, maxLon: 24.2 };

function inBox(lat: number, lon: number, box: BoundingBox) {
  return lat >= box.minLat && lat <= box.maxLat && lon >= box.minLon && lon <= box.maxLon;
}

/**
 * Approximate NO/SE land-border longitude at a given latitude, used to split
 * points that fall inside BOTH country boxes. The border trends east as you go
 * north, so a single fixed cutoff (the old 12.5) wrongly sent western Sweden —
 * e.g. Göteborg at 11.97°E — to Norway. Piecewise-linear through real border
 * control points: west of the line → NO, east → SE. Still an approximation
 * (a polygon border is the eventual upgrade), but correct for populated areas.
 */
function noSeBorderLon(lat: number): number {
  // South of Iddefjorden the border meets the sea at ~11.1°E (Svinesund), and
  // Norway's south coast ends well west of 11°E — so the whole Swedish
  // Bohuslän coast (Strömstad 11.17, Grebbestad 11.25, Fjällbacka 11.28) lies
  // WEST of the old 11.4 cutoff and was misclassified as Norway → blank
  // Kartverket map + Frost weather for users vacationing there.
  if (lat <= 58.9) return 11.0;
  // Iddefjord/Svinesund transition: rise steeply so Halden (59.12°N, 11.39°E)
  // and Tistedal stay Norwegian while Strömstad (58.94°N, 11.17°E) is Swedish.
  if (lat <= 59.1) return 11.0 + (lat - 58.9) * 2.4; // → 11.48 at 59.1°N
  if (lat <= 61) return 11.4 + (lat - 59) * 0.6; // → 12.6 at 61°N
  if (lat <= 65) return 12.6 + (lat - 61) * 0.475; // → 14.5 at 65°N
  if (lat <= 69) return 14.5 + (lat - 65) * 1.5; // → 20.5 at 69°N
  return 20.5;
}

export function getRegion(lat: number, lon: number): Region {
  const isNorway = inBox(lat, lon, NORWAY);
  const isSweden = inBox(lat, lon, SWEDEN);

  if (isNorway && !isSweden) return 'NO';
  if (isSweden && !isNorway) return 'SE';
  if (isNorway && isSweden) {
    return lon < noSeBorderLon(lat) ? 'NO' : 'SE';
  }
  return 'other';
}

export function isNordic(lat: number, lon: number): boolean {
  return getRegion(lat, lon) !== 'other';
}
