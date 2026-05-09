/**
 * NIBIO forest-data module — entry point.
 *
 * Phase 2 prediction-engine input. Currently a SCAFFOLD: types and
 * scoring logic are real, but `getForestProperties` returns null until
 * the SR16 raster is wired in. See docs/nibio-setup.md.
 */

export { isWithinNorway, getForestProperties, fallbackProperties } from './sr16';
export { computeHabitatScore } from './habitat';
export type {
  ForestType,
  ForestProperties,
  HabitatQuery,
  HabitatScore,
  SpeciesHabitatPreferences
} from './types';
