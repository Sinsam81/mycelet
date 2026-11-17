// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Leaflet from 'leaflet';
import { avstandMeter, flyttetoleranseMeter, kartErFlyttet, meterPerPiksel, senterForBoks } from '@/lib/map/funnposisjon';

/**
 * «⭐ Lovende» zoomer kartet til boksen rundt de lovende områdene, og skriver
 * ned senteret som «der APPEN la kartet» — ellers leser funnskjemaet
 * flyttingen som brukerens egen (se senterForBoks i funnposisjon.ts).
 *
 * MushroomMap.tsx lastes ikke av noen test, så de to tingene koblingen hviler
 * på, prøves her mot EKTE Leaflet:
 *
 *  1. Punktet som skrives ned, er punktet fitBounds faktisk legger kartet på.
 *  2. Det måtte regnes ut. Å lytte på neste «moveend» gir feil sted når
 *     fitBounds avbryter en panorering som alt pågår.
 *
 * Selve linja i kartet er låst i lovende-kobling.test.ts.
 */

let L: typeof Leaflet;
const kart: Leaflet.Map[] = [];

beforeAll(async () => {
  // Leaflet tar vare på requestAnimationFrame når modulen lastes — se
  // leafletEtterFjerning.test.ts. Via setTimeout driver falske tidtakere en
  // animert panorering helt i mål.
  window.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
  window.cancelAnimationFrame = (id: number) => clearTimeout(id);
  L = (await import('leaflet')).default;
});

afterEach(() => {
  for (const map of kart.splice(0)) map.remove();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/** En telefonskjerm. Kartet åpner sentrert på brukeren, som i appen. */
function lagKart(senter: [number, number], zoom = 13) {
  const div = document.createElement('div');
  // jsdom har ingen layout; uten størrelse kan ikke Leaflet regne ut zoomen for en boks.
  Object.defineProperty(div, 'clientWidth', { get: () => 390 });
  Object.defineProperty(div, 'clientHeight', { get: () => 700 });
  document.body.appendChild(div);
  const map = L.map(div, { center: senter, zoom, maxZoom: 20, zoomControl: false });
  kart.push(map);
  return map;
}

/** Det kartet gjør: boksen får litt luft rundt seg, og senteret skrives ned. */
function zoomTilBoks(map: Leaflet.Map, sorvest: [number, number], nordost: [number, number]) {
  const utsnitt = L.latLngBounds([sorvest, nordost]).pad(0.2);
  map.fitBounds(utsnitt);
  return senterForBoks(utsnitt.getSouthWest(), utsnitt.getNorthEast());
}

const punkt = (p: Leaflet.LatLng) => ({ lat: p.lat, lng: p.lng });
const erFlyttet = (map: Leaflet.Map, autoSenter: { lat: number; lng: number }) => {
  const senter = map.getCenter();
  return kartErFlyttet(punkt(senter), autoSenter, flyttetoleranseMeter(senter.lat, map.getZoom()));
};

const HJEMME: [number, number] = [59.9139, 10.7522];

describe('senteret som skrives ned, er der fitBounds legger kartet', () => {
  /**
   * `hopp`: boksen gir en annen zoom enn kartet hadde, og Leaflet setter da
   * utsnittet direkte — senteret blir målet på desimalen. Ellers panorerer det
   * animert, i hele piksler.
   */
  const bokser: Array<{
    navn: string;
    start: [number, number];
    sorvest: [number, number];
    nordost: [number, number];
    hopp: boolean;
  }> = [
    { navn: 'to områder noen hundre meter unna', start: HJEMME, sorvest: [59.9065, 10.7302], nordost: [59.9195, 10.7638], hopp: false },
    { navn: 'søket gikk ut til 35 km', start: HJEMME, sorvest: [59.6, 10.2], nordost: [60.25, 11.4], hopp: true },
    { navn: 'Tromsø, der kartet strekker mest', start: [69.6492, 18.9553], sorvest: [69.3, 18.2], nordost: [69.95, 19.9], hopp: true }
  ];

  for (const { navn, start, sorvest, nordost, hopp } of bokser) {
    it(navn, () => {
      vi.useFakeTimers();
      const map = lagKart(start);
      const autoSenter = zoomTilBoks(map, sorvest, nordost);
      vi.advanceTimersByTime(1000);

      expect(map.getZoom() !== 13).toBe(hopp);
      const avvik = avstandMeter(punkt(map.getCenter()), autoSenter);
      // Gjennomsnittet av breddegradene ville bommet med flere hundre meter på de to store boksene.
      expect(avvik).toBeLessThan(hopp ? 1 : 1.5 * meterPerPiksel(autoSenter.lat, map.getZoom()));
      // Kartet HAR flyttet seg — og regnes likevel ikke som flyttet av brukeren.
      expect(avstandMeter(punkt(map.getCenter()), { lat: start[0], lng: start[1] })).toBeGreaterThan(150);
      expect(erFlyttet(map, autoSenter)).toBe(false);
      // Målt mot senteret fra før, ville appens egen flytting sett ut som brukerens.
      expect(erFlyttet(map, { lat: start[0], lng: start[1] })).toBe(true);
    });
  }

  it('en animert panorering (samme zoom) ender innenfor pikselavrundingen', () => {
    vi.useFakeTimers();
    const map = lagKart(HJEMME, 13);
    const utsnitt = L.latLngBounds([
      [59.905, 10.74],
      [59.935, 10.8]
    ]);
    // Forutsetningen for testen: boksen gir samme zoom, så Leaflet panorerer animert.
    expect(map.getBoundsZoom(utsnitt)).toBe(13);
    map.fitBounds(utsnitt);
    const autoSenter = senterForBoks(utsnitt.getSouthWest(), utsnitt.getNorthEast());
    // Animasjonen er i gang: kartet står fortsatt der det sto.
    expect(avstandMeter(punkt(map.getCenter()), { lat: HJEMME[0], lng: HJEMME[1] })).toBeLessThan(1);
    vi.advanceTimersByTime(1000);

    expect(avstandMeter(punkt(map.getCenter()), autoSenter)).toBeLessThan(flyttetoleranseMeter(HJEMME[0], 13) / 3);
    expect(erFlyttet(map, autoSenter)).toBe(false);
  });

  it('drar brukeren kartet etterpå, er det flyttet', () => {
    vi.useFakeTimers();
    const map = lagKart(HJEMME);
    const autoSenter = zoomTilBoks(map, [59.9065, 10.7302], [59.9195, 10.7638]);
    vi.advanceTimersByTime(1000);
    expect(erFlyttet(map, autoSenter)).toBe(false);

    map.panBy([0, -180], { animate: false });
    expect(erFlyttet(map, autoSenter)).toBe(true);
  });
});

describe('hvorfor senteret regnes ut og ikke leses av neste «moveend»', () => {
  it('fitBounds stopper en panorering som pågår, og melder «moveend» for DEN først', () => {
    vi.useFakeTimers();
    const map = lagKart(HJEMME, 13);
    // Kartet glir fortsatt etter et sveip i det svaret fra «Lovende» kommer.
    map.panBy([120, 0]);
    vi.advanceTimersByTime(60);

    const lyttet: { senter: { lat: number; lng: number } | null } = { senter: null };
    map.once('moveend', () => {
      lyttet.senter = punkt(map.getCenter());
    });
    const utsnitt = L.latLngBounds([
      [59.905, 10.74],
      [59.935, 10.8]
    ]);
    map.fitBounds(utsnitt);
    const autoSenter = senterForBoks(utsnitt.getSouthWest(), utsnitt.getNorthEast());
    vi.advanceTimersByTime(1000);

    // Lytteren fikk stedet kartet ble stoppet på — ikke der det endte.
    expect(lyttet.senter).not.toBeNull();
    expect(erFlyttet(map, lyttet.senter as { lat: number; lng: number })).toBe(true);
    // Det utregnede målet er der kartet står.
    expect(erFlyttet(map, autoSenter)).toBe(false);
  });
});
