/**
 * Typer for offline-map.js. Filen ved siden av er ren JS med vilje — den lastes
 * direkte av public/offline/index.html og går aldri gjennom bundleren. tsconfig
 * har allowJs: false, så testene i src/ trenger denne erklæringen for å kunne
 * importere de rene funksjonene.
 */

export interface OfflineShellBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface OfflineShellTile {
  x: number;
  y: number;
  column: number;
  row: number;
}

export interface OfflineShellGrid {
  zoom: number;
  minX: number;
  minY: number;
  columns: number;
  rows: number;
  tiles: OfflineShellTile[];
}

export interface OfflineShellArea {
  id?: string;
  name?: string;
  centerLat?: number;
  centerLng?: number;
  zoom: number;
  bounds: OfflineShellBounds;
  cachedTiles?: number;
  createdAt?: string;
}

/** Hvorfor skallet vises — se shellReason i offline-map.js. */
export type OfflineShellReason = 'offline' | 'noResponse' | 'direct';

/** Det skallet trenger av navigator for å si fra til service workeren før et nytt forsøk. */
export interface OfflineShellNavigator {
  serviceWorker?: {
    controller?: { postMessage(message: { type: string; url: string }): void } | null;
  } | null;
}

export const TILE_SIZE: number;
export const TILE_CACHE_NAME: string;
export const AREAS_STORAGE_KEY: string;
export const LOCALE_COOKIE: string;
export const WAIT_FOR_NETWORK_MESSAGE: string;
export const MAX_GRID_SPAN: number;
export const TILE_TEMPLATES: string[];

export function subdomainFor(x: number, y: number): string;
export function tileUrl(template: string, x: number, y: number, zoom: number): string;
export function latLngToPixel(lat: number, lng: number, zoom: number): { x: number; y: number };
export function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number };
export function buildTileGrid(bounds: OfflineShellBounds, zoom: number, maxSpan?: number): OfflineShellGrid;
export function projectToGrid(
  grid: OfflineShellGrid,
  lat: number,
  lng: number
): { x: number; y: number; inside: boolean };
export function parseAreas(raw: string | null | undefined): OfflineShellArea[];
export function readLocale(cookieString: string | null | undefined): 'nb' | 'sv';
export function shellReason(pathname: string, online: boolean): OfflineShellReason;
export function shellIntro(
  locale: 'nb' | 'sv',
  reason: OfflineShellReason
): { heading: string; note: string | null };
export function retryWithNetworkWait(
  nav: OfflineShellNavigator | null | undefined,
  href: string,
  reload: () => void
): void;
