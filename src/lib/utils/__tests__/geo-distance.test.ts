import { describe, expect, it } from 'vitest';
import { filterWithinRadiusKm, haversineKm } from '../geo-distance';

/**
 * Rutenettet /api/prediction/grid regner på legges ut n×n over hele boksen
 * kartet sender inn, og boksen bygges med halvbredde radiusKm i begge retninger
 * (lngDelta kompenserer allerede for breddegrad). Rutesenteret lengst ute ligger
 * derfor `radiusKm · (n−1)/n · √2` unna — 6,07 km for n=7 og radius 5.
 */
function gridCellCenters(originLat: number, originLng: number, radiusKm: number, n: number) {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((originLat * Math.PI) / 180));
  const minLat = originLat - latDelta;
  const minLng = originLng - lngDelta;
  const latSpan = (2 * latDelta) / n;
  const lngSpan = (2 * lngDelta) / n;
  const cells: { lat: number; lng: number }[] = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      cells.push({ lat: minLat + latSpan * (row + 0.5), lng: minLng + lngSpan * (col + 0.5) });
    }
  }
  return cells;
}

describe('haversineKm', () => {
  it('gir 0 for samme punkt', () => {
    expect(haversineKm(59.91, 10.75, 59.91, 10.75)).toBeCloseTo(0, 6);
  });

  it('måler Oslo–Bergen til rundt 305 km', () => {
    expect(haversineKm(59.91, 10.75, 60.39, 5.32)).toBeGreaterThan(295);
    expect(haversineKm(59.91, 10.75, 60.39, 5.32)).toBeLessThan(315);
  });
});

describe('filterWithinRadiusKm', () => {
  it('kutter hjørnerutene som ligger utenfor radiusen banneret lover', () => {
    const origin = { lat: 59.91, lng: 10.75 };
    const cells = gridCellCenters(origin.lat, origin.lng, 5, 7);
    const worst = Math.max(...cells.map((c) => haversineKm(origin.lat, origin.lng, c.lat, c.lng)));
    // Uten filteret ville banneret sagt «innen 5 km» over en nål på 6,07 km.
    expect(worst).toBeGreaterThan(5);
    expect(worst).toBeCloseTo(6.07, 1);

    const kept = filterWithinRadiusKm(origin, cells, 5);
    expect(kept.length).toBeLessThan(cells.length);
    for (const c of kept) {
      expect(haversineKm(origin.lat, origin.lng, c.lat, c.lng)).toBeLessThanOrEqual(5);
    }
  });

  it('gjelder like mye på 35 km og i nord', () => {
    // Samme feil, større utslag: RADII_KM slutter på 35.
    const origin = { lat: 69.65, lng: 18.96 }; // Tromsø
    const cells = gridCellCenters(origin.lat, origin.lng, 35, 7);
    const worst = Math.max(...cells.map((c) => haversineKm(origin.lat, origin.lng, c.lat, c.lng)));
    expect(worst).toBeGreaterThan(35);

    const kept = filterWithinRadiusKm(origin, cells, 35);
    expect(Math.max(...kept.map((c) => haversineKm(origin.lat, origin.lng, c.lat, c.lng)))).toBeLessThanOrEqual(35);
  });

  it('beholder alt som allerede ligger innenfor', () => {
    const origin = { lat: 59.91, lng: 10.75 };
    const inside = [
      { lat: 59.92, lng: 10.76 },
      { lat: 59.9, lng: 10.74 }
    ];
    expect(filterWithinRadiusKm(origin, inside, 5)).toHaveLength(2);
  });
});
