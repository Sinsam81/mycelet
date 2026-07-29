export interface PredictionTileRegion {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  step: number;
}

export const PREDICTION_TILE_REGIONS: readonly PredictionTileRegion[] = [
  { name: 'Oslo', minLat: 59.72, maxLat: 60.05, minLng: 10.35, maxLng: 11.15, step: 0.06 },
  { name: 'Trondheim', minLat: 63.28, maxLat: 63.52, minLng: 10.2, maxLng: 10.65, step: 0.07 },
  { name: 'Bergen', minLat: 60.2, maxLat: 60.52, minLng: 5.05, maxLng: 5.6, step: 0.07 },
  { name: 'Stavanger', minLat: 58.85, maxLat: 59.05, minLng: 5.6, maxLng: 6.1, step: 0.07 },
  { name: 'Innlandet', minLat: 60.7, maxLat: 61.0, minLng: 11.0, maxLng: 11.6, step: 0.07 }
];

export function predictionTileGridCells(
  region: PredictionTileRegion
): Array<{ lat: number; lng: number }> {
  const cells: Array<{ lat: number; lng: number }> = [];
  for (let lat = region.minLat; lat <= region.maxLat; lat += region.step) {
    for (let lng = region.minLng; lng <= region.maxLng; lng += region.step) {
      cells.push({ lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) });
    }
  }
  return cells;
}
