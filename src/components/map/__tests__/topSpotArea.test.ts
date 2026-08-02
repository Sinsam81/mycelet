import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createTopSpotArea, type TopSpotShapeFactory } from '../topSpotArea';

/**
 * FORMEN ER PÅSTANDEN.
 *
 * En nummerert nål sier «gå nøyaktig hit, dette er det beste stedet». Ingen av
 * delene stemmer: koordinaten er senteret i en rute på 1,4–10 km, og modellen
 * skiller ikke to skogspunkter få kilometer fra hverandre (AUC 0,654, p = 0,44).
 * Testene under holder fast på at kartet tegner ruta, ikke punktet.
 */
function fakeLeaflet() {
  const shape = () => ({ bindPopup: vi.fn(), addTo: vi.fn(), on: vi.fn() });
  return {
    circle: vi.fn((latlng: unknown, options: unknown) => ({ latlng, options, ...shape() })),
    circleMarker: vi.fn((latlng: unknown, options: unknown) => ({ latlng, options, ...shape() })),
    // Skal ALDRI kalles herfra — det var slik den nummererte nålen ble laget.
    divIcon: vi.fn(),
    marker: vi.fn()
  };
}

const SPOT = { lat: 59.84, lng: 10.65, score: 62 };

describe('createTopSpotArea', () => {
  it('tegner søkeområdet som en sirkel i oppgitt oppløsning', () => {
    const leaflet = fakeLeaflet();
    createTopSpotArea(leaflet as unknown as TopSpotShapeFactory, SPOT, 714, '#5E9440');

    expect(leaflet.circle).toHaveBeenCalledTimes(1);
    const [latlng, options] = leaflet.circle.mock.calls[0] as [number[], Record<string, unknown>];
    expect(latlng).toEqual([SPOT.lat, SPOT.lng]);
    expect(options.radius).toBe(714);
  });

  it('lager ingen nål og ingen ikon-html — altså heller ikke noe rangeringstall', () => {
    const leaflet = fakeLeaflet();
    createTopSpotArea(leaflet as unknown as TopSpotShapeFactory, SPOT, 714, '#5E9440');

    expect(leaflet.divIcon).not.toHaveBeenCalled();
    expect(leaflet.marker).not.toHaveBeenCalled();
    const serialized = JSON.stringify(leaflet.circle.mock.calls) + JSON.stringify(leaflet.circleMarker.mock.calls);
    expect(serialized).not.toContain('<div');
  });

  it('gir myk flate uten hard kant', () => {
    const leaflet = fakeLeaflet();
    createTopSpotArea(leaflet as unknown as TopSpotShapeFactory, SPOT, 714, '#5E9440');
    const options = (leaflet.circle.mock.calls[0] as [unknown, Record<string, number>])[1];

    // Fyll man ser, men ikke en flate som skjuler kartet under.
    expect(options.fillOpacity).toBeGreaterThan(0);
    expect(options.fillOpacity).toBeLessThanOrEqual(0.25);
    // Kanten skal være svak nok til at den ikke leses som en grense med et
    // fasitpunkt i midten.
    expect(options.weight).toBeLessThanOrEqual(1);
    expect(options.opacity).toBeLessThan(0.5);
  });

  it('gir et lite ankerpunkt, ikke en markør som roper', () => {
    const leaflet = fakeLeaflet();
    createTopSpotArea(leaflet as unknown as TopSpotShapeFactory, SPOT, 714, '#5E9440');

    expect(leaflet.circleMarker).toHaveBeenCalledTimes(1);
    const options = (leaflet.circleMarker.mock.calls[0] as [unknown, Record<string, number>])[1];
    // Den gamle nålen var 28 px i diameter. Ankeret er en prikk.
    expect(options.radius).toBeLessThanOrEqual(4);
  });
});

/**
 * KALLSTEDET, IKKE BARE HJELPEREN.
 *
 * MushroomMap.tsx laster ingen test (Leaflet + DOM), så en revert til
 * `divIcon` med et rangeringstall ville ikke gjort noe rødt i det hele tatt.
 * Samme grep som findingPopupElement.test.tsx bruker for popup-provideren.
 */
describe('MushroomMap tegner toppstedene med hjelperen', () => {
  const source = readFileSync(new URL('../MushroomMap.tsx', import.meta.url), 'utf8');

  it('bruker createTopSpotArea for toppstedene', () => {
    expect(source).toContain('createTopSpotArea(');
  });

  it('har ikke den nummererte nålen igjen', () => {
    expect(source).not.toContain('top-spot-marker');
    // `rank` var tallet i nålen og i overskriften «Topp {rank}».
    expect(source).not.toMatch(/\brank\b/);
  });
});
