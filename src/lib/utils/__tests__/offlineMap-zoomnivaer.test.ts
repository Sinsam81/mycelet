import { describe, expect, it } from 'vitest';
import {
  MAX_NATIVE_ZOOM,
  MAX_TILES_PER_SAVE,
  OSM_TILE_TEMPLATE,
  SATELLITE_TILE_TEMPLATE,
  TERRAIN_TILE_TEMPLATE,
  countTilesForArea,
  getTileUrlsForBounds,
  offlineZoomLevels,
  type OfflineAreaBounds
} from '../offlineMap';

/**
 * Hvilke zoomnivåer «Lagre kartområde» henter, og hvor mange fliser det blir.
 *
 * To ting var galt uten at noe sa fra:
 *  - Lista over fliser ble kuttet ved 550. Det som falt bort var det som sto
 *    sist — og med et helt land i utsnittet var det nivået brukeren så på.
 *  - Sto kartet på zoom 19–20 (forstørrede fliser fra nivå 18), ble nivå 19 og
 *    20 forsøkt hentet hos Kartverket, som ikke har dem.
 */

const MALER = [TERRAIN_TILE_TEMPLATE, OSM_TILE_TEMPLATE, SATELLITE_TILE_TEMPLATE] as const;

/** Utsnittet en kartflate på `bredde` × `hoyde` px viser på et zoomnivå — samme regning som Leaflet. */
function utsnitt(lat: number, lng: number, zoom: number, bredde: number, hoyde: number): OfflineAreaBounds {
  const n = 256 * 2 ** zoom;
  const cx = ((lng + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180);
  const cy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  const tilLat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const tilLng = (x: number) => (x / n) * 360 - 180;
  return {
    north: tilLat(cy - hoyde / 2),
    south: tilLat(cy + hoyde / 2),
    west: tilLng(cx - bredde / 2),
    east: tilLng(cx + bredde / 2)
  };
}

/** En telefon (kartflata er skjermbredden minus marger) og den bredeste kartflata siden tillater. */
const TELEFON = { bredde: 343, hoyde: 450 };
const STOR_SKJERM = { bredde: 736, hoyde: 740 };

describe('offlineZoomLevels', () => {
  it('nivået brukeren ser på står først, så ett ut og ett inn', () => {
    expect(offlineZoomLevels(13, TERRAIN_TILE_TEMPLATE)).toEqual({ zoom: 13, zoomLevels: [13, 12, 14] });
    expect(offlineZoomLevels(9, OSM_TILE_TEMPLATE)).toEqual({ zoom: 9, zoomLevels: [9, 8, 10] });
  });

  it('går aldri dypere enn bakgrunnskartet har fliser for', () => {
    // Kartverket stopper på 18. Kartet kan stå på 19 og 20 ved å forstørre.
    expect(offlineZoomLevels(18, TERRAIN_TILE_TEMPLATE)).toEqual({ zoom: 18, zoomLevels: [18, 17] });
    expect(offlineZoomLevels(19, TERRAIN_TILE_TEMPLATE)).toEqual({ zoom: 18, zoomLevels: [18, 17] });
    expect(offlineZoomLevels(20, TERRAIN_TILE_TEMPLATE)).toEqual({ zoom: 18, zoomLevels: [18, 17] });
    // OSM og flyfoto har nivå 19.
    expect(offlineZoomLevels(18, OSM_TILE_TEMPLATE)).toEqual({ zoom: 18, zoomLevels: [18, 17, 19] });
    expect(offlineZoomLevels(20, OSM_TILE_TEMPLATE)).toEqual({ zoom: 19, zoomLevels: [19, 18] });
    expect(offlineZoomLevels(20, SATELLITE_TILE_TEMPLATE)).toEqual({ zoom: 19, zoomLevels: [19, 18] });
  });

  it('holder for alle zoomnivåer kartet kan stå på, i alle tre bakgrunnskart', () => {
    for (const mal of MALER) {
      for (let visning = 0; visning <= 20; visning += 1) {
        const { zoom, zoomLevels } = offlineZoomLevels(visning, mal);
        expect(zoomLevels[0], `${mal} ${visning}`).toBe(zoom);
        expect(Math.max(...zoomLevels), `${mal} ${visning}`).toBeLessThanOrEqual(MAX_NATIVE_ZOOM[mal]);
        expect(new Set(zoomLevels).size, `${mal} ${visning}`).toBe(zoomLevels.length);
        expect(zoom).toBe(Math.min(visning, MAX_NATIVE_ZOOM[mal]));
      }
    }
  });

  it('oversiktsnivået går aldri grovere enn 8 — som før', () => {
    expect(offlineZoomLevels(8, TERRAIN_TILE_TEMPLATE)).toEqual({ zoom: 8, zoomLevels: [8, 9] });
    expect(offlineZoomLevels(5, TERRAIN_TILE_TEMPLATE)).toEqual({ zoom: 5, zoomLevels: [5, 8, 6] });
  });

  it('runder et brøkdels zoomnivå, og tåler et ukjent bakgrunnskart', () => {
    expect(offlineZoomLevels(12.6, TERRAIN_TILE_TEMPLATE).zoom).toBe(13);
    expect(offlineZoomLevels(20, 'https://example.test/{z}/{x}/{y}.png')).toEqual({ zoom: 18, zoomLevels: [18, 17] });
  });

  it('kjenner alle tre bakgrunnskartene', () => {
    expect(Object.keys(MAX_NATIVE_ZOOM).sort()).toEqual([...MALER].sort());
  });
});

describe('hvor mange fliser en lagring trenger', () => {
  const antall = (visning: number, flate: { bredde: number; hoyde: number }, mal = TERRAIN_TILE_TEMPLATE) => {
    const { zoomLevels } = offlineZoomLevels(visning, mal);
    return countTilesForArea(utsnitt(61.5, 10.5, visning, flate.bredde, flate.hoyde), zoomLevels, mal);
  };

  it('teller de samme flisene som hentes — hver én gang', () => {
    const b = utsnitt(59.91, 10.75, 12, TELEFON.bredde, TELEFON.hoyde);
    const forventet = new Set([12, 11, 13].flatMap((z) => getTileUrlsForBounds(b, z, TERRAIN_TILE_TEMPLATE)));
    expect(countTilesForArea(b, [12, 11, 13], TERRAIN_TILE_TEMPLATE)).toBe(forventet.size);
    expect(countTilesForArea(b, [12, 12, 11, 13], TERRAIN_TILE_TEMPLATE)).toBe(forventet.size);
  });

  it('et vanlig utsnitt er langt under taket', () => {
    for (let visning = 7; visning <= 20; visning += 1) {
      expect(antall(visning, TELEFON), `telefon zoom ${visning}`).toBeLessThan(60);
      expect(antall(visning, STOR_SKJERM), `stor skjerm zoom ${visning}`).toBeLessThan(120);
    }
  });

  it('taket nås først med et helt land i utsnittet', () => {
    expect(antall(5, TELEFON)).toBeLessThanOrEqual(MAX_TILES_PER_SAVE);
    expect(antall(4, TELEFON)).toBeGreaterThan(MAX_TILES_PER_SAVE);
    expect(antall(6, STOR_SKJERM)).toBeLessThanOrEqual(MAX_TILES_PER_SAVE);
    expect(antall(5, STOR_SKJERM)).toBeGreaterThan(MAX_TILES_PER_SAVE);
  });

  it('det var nivået brukeren så på som falt bort da lista ble kuttet', () => {
    // Slik lista ble bygget før: [8, 4, 5], kuttet ved 550. Nivå 8 alene fyller
    // mer enn det, så ikke én flis fra nivå 4 eller 5 ble med — og nivå 4 er
    // det offline-siden tegner området på.
    const b = utsnitt(61.5, 10.5, 4, TELEFON.bredde, TELEFON.hoyde);
    const gammelListe = [8, 4, 5].flatMap((z) => getTileUrlsForBounds(b, z, TERRAIN_TILE_TEMPLATE));
    const beholdt = gammelListe.slice(0, MAX_TILES_PER_SAVE);
    expect(getTileUrlsForBounds(b, 8, TERRAIN_TILE_TEMPLATE).length).toBeGreaterThan(MAX_TILES_PER_SAVE);
    expect(beholdt.every((url) => url.includes('/webmercator/8/'))).toBe(true);
    expect(beholdt.some((url) => url.includes('/webmercator/4/'))).toBe(false);
  });
});
