export interface RegionTileState {
  region: string;
  tileDate: string | null;
  updatedAt: string | null;
  error?: string;
}

export interface AssessedRegionTileState extends RegionTileState {
  fresh: boolean;
}

export function assessTileFreshness(
  states: RegionTileState[],
  expectedDate: string
): { fresh: boolean; regions: AssessedRegionTileState[] } {
  const regions = states.map((state) => ({
    ...state,
    fresh: !state.error && state.tileDate === expectedDate
  }));

  return {
    fresh: regions.length > 0 && regions.every((region) => region.fresh),
    regions
  };
}
