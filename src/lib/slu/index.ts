/**
 * Swedish forest-data module — entry point.
 *
 * LIVE: forest TYPE via CORINE Land Cover 2018 (anonymous EEA ArcGIS query).
 * SLU Forest Map (richer per-species volume) remains the future upgrade path
 * behind the same ForestProperties shape. See ./skogskarta.ts.
 */

export { isWithinSweden, getSwedishForestProperties, parseCorineForestType } from './skogskarta';
