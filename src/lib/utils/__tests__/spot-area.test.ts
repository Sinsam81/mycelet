import { describe, expect, it } from 'vitest';
import {
  MIN_SEARCH_AREA_RADIUS_M,
  cellSpansFromBounds,
  searchAreaRadiusForResponse,
  searchAreaRadiusMeters
} from '../spot-area';

/**
 * Boksen kartet sender til /api/prediction/grid: halvbredde radiusKm i begge
 * retninger, med lengdegradene skalert for breddegraden. Samme utregning som i
 * generateTopSpots (MushroomMap.tsx).
 */
function boxAround(lat: number, lng: number, radiusKm: number) {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - latDelta, maxLat: lat + latDelta, minLng: lng - lngDelta, maxLng: lng + lngDelta };
}

const NESODDEN = { lat: 59.84, lng: 10.65 };

describe('cellSpansFromBounds', () => {
  it('deler boksen i n×n like ruter', () => {
    const box = boxAround(NESODDEN.lat, NESODDEN.lng, 5);
    const spans = cellSpansFromBounds(box, 7);
    expect(spans.latSpan).toBeCloseTo((box.maxLat - box.minLat) / 7, 10);
    expect(spans.lngSpan).toBeCloseTo((box.maxLng - box.minLng) / 7, 10);
  });

  it('tåler n = 0 uten å dele på null', () => {
    const box = boxAround(NESODDEN.lat, NESODDEN.lng, 5);
    expect(Number.isFinite(cellSpansFromBounds(box, 0).latSpan)).toBe(true);
  });
});

describe('searchAreaRadiusMeters', () => {
  /**
   * Kjernen i hele endringen: sirkelen skal ha rutenettets oppløsning, ikke
   * en nåls. 5 km søk med n = 7 gir ruter på 10/7 ≈ 1,43 km — altså ~714 m
   * radius. En nål påsto i praksis noen titalls meter.
   */
  it('gir halve cellebredden — ~714 m for 5 km søk med n = 7', () => {
    const radius = searchAreaRadiusMeters(cellSpansFromBounds(boxAround(NESODDEN.lat, NESODDEN.lng, 5), 7), NESODDEN.lat);
    expect(radius).toBeGreaterThan(690);
    expect(radius).toBeLessThan(740);
  });

  it('vokser med søkeradien — 35 km søk gir ~5 km radius', () => {
    const radius = searchAreaRadiusMeters(
      cellSpansFromBounds(boxAround(NESODDEN.lat, NESODDEN.lng, 35), 7),
      NESODDEN.lat
    );
    expect(radius).toBeGreaterThan(4700);
    expect(radius).toBeLessThan(5200);
  });

  it('holder seg innenfor ruta i begge retninger', () => {
    // Bevisst skeiv rute: sirkelen skal følge den KORTESTE siden, ellers flyter
    // den inn over naboruter vi aldri anbefalte.
    const spans = { latSpan: 0.02, lngSpan: 0.2 };
    const radius = searchAreaRadiusMeters(spans, 60);
    expect(radius).toBeLessThanOrEqual((spans.latSpan * 111_320) / 2 + 1);
  });

  it('faller tilbake på gulvet når celledataene er tull', () => {
    expect(searchAreaRadiusMeters({ latSpan: 0, lngSpan: 0 }, 59.9)).toBe(MIN_SEARCH_AREA_RADIUS_M);
    expect(searchAreaRadiusMeters({ latSpan: NaN, lngSpan: NaN }, 59.9)).toBe(MIN_SEARCH_AREA_RADIUS_M);
  });
});

describe('searchAreaRadiusForResponse', () => {
  const box = boxAround(NESODDEN.lat, NESODDEN.lng, 5);

  it('bruker cellestørrelsen serveren oppgir', () => {
    const radius = searchAreaRadiusForResponse({
      bounds: box,
      requestedN: 7,
      lat: NESODDEN.lat,
      cellLatSpan: (box.maxLat - box.minLat) / 5,
      cellLngSpan: (box.maxLng - box.minLng) / 5,
      n: 5
    });
    // Gratisbrukere får n = 5, altså GROVERE ruter enn de 7 vi ba om. Da skal
    // sirkelen bli større, ikke stå igjen med premium-oppløsningen.
    const requested = searchAreaRadiusMeters(cellSpansFromBounds(box, 7), NESODDEN.lat);
    expect(radius).toBeGreaterThan(requested);
  });

  it('regner det selv når svaret ikke sier noe om cellene', () => {
    const radius = searchAreaRadiusForResponse({ bounds: box, requestedN: 7, lat: NESODDEN.lat });
    expect(radius).toBeCloseTo(searchAreaRadiusMeters(cellSpansFromBounds(box, 7), NESODDEN.lat), 6);
  });

  it('ignorerer ubrukelige celleverdier fra serveren', () => {
    const radius = searchAreaRadiusForResponse({
      bounds: box,
      requestedN: 7,
      lat: NESODDEN.lat,
      cellLatSpan: 0,
      cellLngSpan: null,
      n: 7
    });
    expect(radius).toBeCloseTo(searchAreaRadiusMeters(cellSpansFromBounds(box, 7), NESODDEN.lat), 6);
  });
});
