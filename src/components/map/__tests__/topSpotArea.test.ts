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
    // Kanten skal være SYNLIG — flislaget under er nå et vaskelag uten kant,
    // og et søkeområde man ikke finner er verdiløst. Men den skal ikke være en
    // heltrukken grense: stiplingen er det som skiller «let her omkring» fra
    // «her går en strek». Under 0,7 så den ikke leses som en solid ring.
    expect(options.weight).toBeLessThanOrEqual(2);
    expect(options.opacity).toBeLessThan(0.7);
    expect(options.dashArray, 'kanten må være stiplet, ikke heltrukken').toBeTruthy();
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

/**
 * De 12 søkeområdene ER de høyest scorende cellene lokalt, så den globale
 * paletten gir dem én farge i 78 % av tilfellene (målt på rasteret; resten to,
 * aldri tre eller fire). Følgen var 12 identiske ringer — samme farge, samme
 * gjennomsiktighet, samme størrelse — og brukeren måtte åpne popup på hver
 * enkelt for å se tallet.
 *
 * Samme feil og samme løsning som kartlaget: rangér innenfor settet.
 */
describe('fyllstyrken kan skille områdene fra hverandre', () => {
  const lag = (fillOpacity?: number) => {
    const leaflet = fakeLeaflet();
    createTopSpotArea(leaflet as unknown as TopSpotShapeFactory, SPOT, 564, '#5E9440', fillOpacity);
    return leaflet.circle.mock.calls[0][1] as Record<string, unknown>;
  };

  it('tar imot en dekkevne per område', () => {
    expect(lag(0.12).fillOpacity).toBe(0.12);
    expect(lag(0.55).fillOpacity).toBe(0.55);
  });

  it('beholder den gamle verdien når ingen sendes inn', () => {
    expect(lag().fillOpacity).toBe(0.16);
  });

  it('rører ikke fargen — den er fortsatt absolutt', () => {
    // Ærligheten ligger i fargen: vi sier hvilket område som er best AV DEM på
    // skjermen, ikke at det er bra i seg selv.
    const o = lag(0.55);
    expect(o.color).toBe('#5E9440');
    expect(o.fillColor).toBe('#5E9440');
  });
});
