// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Leaflet from 'leaflet';

/**
 * Sentry MYCELET-9 og MYCELET-A: Leaflets egne tidtakere og animasjonsrammer
 * kjører etter map.remove() og treffer den slettede kartflaten. Testene kaller
 * nøyaktig det tidtakeren og rammen kaller, på et kart som er fjernet.
 *
 * Hver test laster Leaflet på nytt, så vernet (som endrer Map-prototypen)
 * ikke lekker mellom «uten vern» og «med vern».
 */

type KartInternt = Leaflet.Map & {
  _animateZoom: (center: Leaflet.LatLng, zoom: number, startAnim: boolean) => void;
  _onZoomTransitionEnd: () => void;
  _animatingZoom?: boolean;
  _mapPane?: HTMLElement;
};

async function lastLeaflet(medVern: boolean): Promise<typeof Leaflet> {
  vi.resetModules();
  const L = (await import('leaflet')).default;
  if (medVern) {
    const { vernLeafletEtterFjerning } = await import('../leafletEtterFjerning');
    vernLeafletEtterFjerning(L);
  }
  return L;
}

function lagKart(L: typeof Leaflet): KartInternt {
  const div = document.createElement('div');
  // jsdom har ingen layout; uten størrelse velger panBy en annen vei enn i nettleseren.
  Object.defineProperty(div, 'clientWidth', { value: 400 });
  Object.defineProperty(div, 'clientHeight', { value: 300 });
  document.body.appendChild(div);
  return L.map(div, { center: [59.91, 10.75], zoom: 11 }) as KartInternt;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('uten vern — feilene fra Sentry', () => {
  it('MYCELET-9: zoom-tidtakeren etter remove() leser _leaflet_pos på en slettet kartflate', async () => {
    const L = await lastLeaflet(false);
    vi.useFakeTimers();
    const map = lagKart(L);
    // Det requestAnimFrame-kallet i Map._tryAnimatedZoom gjør:
    map._animateZoom(L.latLng(59.95, 10.8), 12, true);
    map.remove();
    expect(() => vi.advanceTimersByTime(300)).toThrow(/_leaflet_pos/);
  });

  it('MYCELET-A: treghets-panBy etter remove() kaller addClass på en slettet kartflate', async () => {
    const L = await lastLeaflet(false);
    const map = lagKart(L);
    map.remove();
    // Det requestAnimFrame-kallet i Map.Drag gjør når et sveip slippes med fart:
    expect(() => map.panBy([40, 0], { animate: true, noMoveStart: true, duration: 0.3 })).toThrow(/classList/);
  });
});

describe('med vern', () => {
  it('zoom-tidtakeren etter remove() gjør ingenting og nullstiller animasjonen', async () => {
    const L = await lastLeaflet(true);
    vi.useFakeTimers();
    const map = lagKart(L);
    const zoomend = vi.fn();
    map.on('zoomend', zoomend);
    map._animateZoom(L.latLng(59.95, 10.8), 12, true);
    map.remove();
    expect(() => vi.advanceTimersByTime(300)).not.toThrow();
    expect(map._animatingZoom).toBe(false);
    // Ingen hendelser til lyttere på et kart som er borte.
    expect(zoomend).not.toHaveBeenCalled();
  });

  it('treghets-panBy etter remove() gjør ingenting og er fortsatt kjedbar', async () => {
    const L = await lastLeaflet(true);
    const map = lagKart(L);
    map.remove();
    expect(map.panBy([40, 0], { animate: true, noMoveStart: true, duration: 0.3 })).toBe(map);
    expect(() => map.panBy([40, 0], { animate: false })).not.toThrow();
  });

  it('setView og zoom rundt et punkt etter remove() kaster ikke (rullehjul-tidtakeren)', async () => {
    const L = await lastLeaflet(true);
    const map = lagKart(L);
    map.remove();
    expect(() => map.setView([60.1, 11.2], 13, { animate: false })).not.toThrow();
    expect(() => map.setZoomAround(L.point(10, 10), 12, { animate: false })).not.toThrow();
  });

  it('et levende kart oppfører seg som før', async () => {
    const L = await lastLeaflet(true);
    vi.useFakeTimers();
    const map = lagKart(L);
    const pane = map.getPane('mapPane') as HTMLElement;

    map.panBy([10, 5], { animate: false });
    expect(L.DomUtil.getPosition(pane)).toEqual(L.point(-10, -5));

    map.setView([60.39, 5.32], 9, { animate: false });
    expect(map.getZoom()).toBe(9);
    expect(map.getCenter().lat).toBeCloseTo(60.39, 2);

    const zoomend = vi.fn();
    map.on('zoomend', zoomend);
    map._animateZoom(L.latLng(60.4, 5.3), 10, true);
    expect(map._animatingZoom).toBe(true);
    expect(pane.classList.contains('leaflet-zoom-anim')).toBe(true);
    vi.advanceTimersByTime(300);
    expect(map._animatingZoom).toBe(false);
    expect(pane.classList.contains('leaflet-zoom-anim')).toBe(false);
    expect(map.getZoom()).toBe(10);
    expect(zoomend).toHaveBeenCalledTimes(1);
    map.remove();
  });

  it('samme scenario gir nøyaktig samme resultat med og uten vern', async () => {
    // Panorering, setView, en hel zoom-animasjon og en animert panorering til
    // slutt — tallene og hendelsene skal være identiske. Vernet skal bare
    // virke når kartflaten er borte.
    async function scenario(medVern: boolean) {
      const L = await lastLeaflet(medVern);
      vi.useFakeTimers();
      const map = lagKart(L);
      const pane = map.getPane('mapPane') as HTMLElement;
      const hendelser: string[] = [];
      for (const type of ['movestart', 'move', 'moveend', 'zoomstart', 'zoom', 'zoomend', 'zoomanim', 'viewreset']) {
        map.on(type, () => hendelser.push(type));
      }
      const bilde = () => ({
        senter: map.getCenter(),
        zoom: map.getZoom(),
        flate: L.DomUtil.getPosition(pane),
        klasser: pane.className
      });
      const bilder = [];
      map.panBy([10, 5], { animate: false });
      bilder.push(bilde());
      map.setView([60.39, 5.32], 9, { animate: false });
      bilder.push(bilde());
      map._animateZoom(L.latLng(60.4, 5.3), 10, true);
      bilder.push(bilde());
      vi.advanceTimersByTime(300);
      bilder.push(bilde());
      map.panBy([30, 0], { animate: true, duration: 0.1 });
      bilder.push(bilde());
      vi.advanceTimersByTime(500);
      bilder.push(bilde());
      map.remove();
      vi.useRealTimers();
      document.body.innerHTML = '';
      return { bilder: JSON.parse(JSON.stringify(bilder)), hendelser };
    }
    const uten = await scenario(false);
    const med = await scenario(true);
    expect(med).toEqual(uten);
    expect(uten.hendelser).toContain('zoomend');
  });

  it('legges på én gang, og alle metodene finnes i denne Leaflet-versjonen', async () => {
    const L = await lastLeaflet(false);
    const { VERNEDE_METODER, vernLeafletEtterFjerning } = await import('../leafletEtterFjerning');
    const proto = L.Map.prototype as unknown as Record<string, unknown>;
    // En ny Leaflet-versjon som gir nytt navn til en av disse, gjør vernet
    // stille virkningsløst for den metoden — derfor feiler testen her.
    for (const navn of VERNEDE_METODER) expect(typeof proto[navn], navn).toBe('function');

    vernLeafletEtterFjerning(L);
    const forste = VERNEDE_METODER.map((n) => proto[n]);
    vernLeafletEtterFjerning(L);
    expect(VERNEDE_METODER.map((n) => proto[n])).toEqual(forste);
  });
});
