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

export function getRegion(lat: number, lon: number): Region {
  const isNorway = inBox(lat, lon, NORWAY);
  const isSweden = inBox(lat, lon, SWEDEN);

  if (isNorway && !isSweden) return 'NO';
  if (isSweden && !isNorway) return 'SE';
  if (isNorway && isSweden) {
    return lon < 12.5 ? 'NO' : 'SE';
  }
  return 'other';
}

export function isNordic(lat: number, lon: number): boolean {
  return getRegion(lat, lon) !== 'other';
}
