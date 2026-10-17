// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Leaflet from 'leaflet';
import { VERNEDE_METODER, vernLeafletEtterFjerning } from '../leafletEtterFjerning';

/**
 * Sentry MYCELET-9 og MYCELET-A: Leaflets egne tidtakere og animasjonsrammer
 * kjører etter map.remove() og treffer den slettede kartflaten. Testene kaller
 * nøyaktig det tidtakeren og rammen kaller, på et kart som er fjernet.
 *
 * To ting i oppsettet er avgjørende for at testene sier noe:
 *
 *  - Leaflet lastes ÉN gang. vi.resetModules() laster ikke node_modules på
 *    nytt, så vernet ville blitt liggende på prototypen og «uten vern» ville
 *    i praksis kjørt med vern. Originalmetodene tas derfor vare på før noe
 *    vern legges på, og settes tilbake etter hver test (fjernVern).
 *  - Leaflet tar vare på window.requestAnimationFrame når modulen lastes.
 *    Animasjonsrammene går derfor via setTimeout, installert før lastingen, så
 *    falske tidtakere driver en animert panorering helt i mål.
 */

type KartInternt = Leaflet.Map & {
  _animateZoom: (center: Leaflet.LatLng, zoom: number, startAnim: boolean) => void;
  _onZoomTransitionEnd: () => void;
  _animatingZoom?: boolean;
};

const VERNET = Symbol.for('mycelet.leaflet.vernEtterFjerning');
const ALLE = [...VERNEDE_METODER, 'remove'] as const;

let L: typeof Leaflet;
let proto: Record<string | symbol, unknown>;
let originaler: Record<string, unknown>;

beforeAll(async () => {
  window.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
  window.cancelAnimationFrame = (id: number) => clearTimeout(id);
  L = (await import('leaflet')).default;
  proto = L.Map.prototype as unknown as Record<string | symbol, unknown>;
  originaler = Object.fromEntries(ALLE.map((n) => [n, proto[n]]));
});

function fjernVern() {
  for (const n of ALLE) proto[n] = originaler[n];
  delete proto[VERNET];
}

function medVern(vern: boolean) {
  fjernVern();
  if (vern) vernLeafletEtterFjerning(L);
  else expect(proto[VERNET]).toBeUndefined();
}

function lagKart(storrelse = { bredde: 400, hoyde: 300 }): KartInternt {
  const div = document.createElement('div');
  // jsdom har ingen layout; uten størrelse velger panBy en annen vei enn i nettleseren.
  Object.defineProperty(div, 'clientWidth', { get: () => storrelse.bredde });
  Object.defineProperty(div, 'clientHeight', { get: () => storrelse.hoyde });
  document.body.appendChild(div);
  return L.map(div, { center: [59.91, 10.75], zoom: 11 }) as KartInternt;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  fjernVern();
});

describe('uten vern — feilene fra Sentry', () => {
  it('MYCELET-9: zoom-tidtakeren etter remove() leser _leaflet_pos på en slettet kartflate', () => {
    medVern(false);
    vi.useFakeTimers();
    const map = lagKart();
    // Det requestAnimFrame-kallet i Map._tryAnimatedZoom gjør:
    map._animateZoom(L.latLng(59.95, 10.8), 12, true);
    map.remove();
    expect(() => vi.advanceTimersByTime(300)).toThrow(/_leaflet_pos/);
  });

  it('MYCELET-A: treghets-panBy etter remove() kaller addClass på en slettet kartflate', () => {
    medVern(false);
    const map = lagKart();
    map.remove();
    // Det requestAnimFrame-kallet i Map.Drag gjør når et sveip slippes med fart:
    expect(() => map.panBy([40, 0], { animate: true, noMoveStart: true, duration: 0.3 })).toThrow(/classList/);
  });

  it('søsken: den forsinkede «moveend» etter en størrelsesendring når lytterne etter remove()', () => {
    medVern(false);
    vi.useFakeTimers();
    const storrelse = { bredde: 400, hoyde: 300 };
    const map = lagKart(storrelse);
    const moveend = vi.fn();
    map.on('moveend', moveend);
    // Det window-resize gjør via _onResize: telefonen roteres.
    storrelse.bredde = 300;
    storrelse.hoyde = 500;
    map.invalidateSize({ debounceMoveend: true });
    map.remove();
    vi.advanceTimersByTime(300);
    expect(moveend).toHaveBeenCalledTimes(1);
  });
});

describe('med vern', () => {
  it('zoom-tidtakeren etter remove() gjør ingenting og nullstiller animasjonen', () => {
    medVern(true);
    vi.useFakeTimers();
    const map = lagKart();
    const zoomend = vi.fn();
    map.on('zoomend', zoomend);
    map._animateZoom(L.latLng(59.95, 10.8), 12, true);
    map.remove();
    expect(() => vi.advanceTimersByTime(300)).not.toThrow();
    expect(map._animatingZoom).toBe(false);
    // Ingen hendelser til lyttere på et kart som er borte.
    expect(zoomend).not.toHaveBeenCalled();
  });

  it('treghets-panBy etter remove() gjør ingenting og er fortsatt kjedbar', () => {
    medVern(true);
    const map = lagKart();
    map.remove();
    expect(map.panBy([40, 0], { animate: true, noMoveStart: true, duration: 0.3 })).toBe(map);
    expect(() => map.panBy([40, 0], { animate: false })).not.toThrow();
  });

  it('remove() tømmer den forsinkede «moveend» fra en størrelsesendring', () => {
    medVern(true);
    vi.useFakeTimers();
    const storrelse = { bredde: 400, hoyde: 300 };
    const map = lagKart(storrelse);
    const moveend = vi.fn();
    map.on('moveend', moveend);
    storrelse.bredde = 300;
    storrelse.hoyde = 500;
    map.invalidateSize({ debounceMoveend: true });
    map.remove();
    vi.advanceTimersByTime(300);
    expect(moveend).not.toHaveBeenCalled();
  });

  it('setView og zoom rundt et punkt etter remove() kaster ikke (rullehjul-tidtakeren)', () => {
    medVern(true);
    const map = lagKart();
    map.remove();
    expect(() => map.setView([60.1, 11.2], 13, { animate: false })).not.toThrow();
    expect(() => map.setZoomAround(L.point(10, 10), 12, { animate: false })).not.toThrow();
  });

  it('legges på én gang, og alle metodene finnes i denne Leaflet-versjonen', () => {
    // En ny Leaflet-versjon som gir nytt navn til en av disse, gjør vernet
    // stille virkningsløst for den metoden — derfor feiler testen her.
    for (const navn of ALLE) expect(typeof originaler[navn], navn).toBe('function');
    medVern(true);
    const forste = ALLE.map((n) => proto[n]);
    for (const n of ALLE) expect(proto[n], n).not.toBe(originaler[n]);
    vernLeafletEtterFjerning(L);
    expect(ALLE.map((n) => proto[n])).toEqual(forste);
  });
});

describe('et levende kart er uendret', () => {
  /**
   * Panorering, setView, en hel zoom-animasjon, en animert panorering kjørt
   * helt i mål og en størrelsesendring. Vernet skal bare virke når
   * kartflaten er borte, så tallene og hendelsene skal være identiske.
   */
  function scenario(vern: boolean) {
    medVern(vern);
    vi.useFakeTimers();
    const storrelse = { bredde: 400, hoyde: 300 };
    const map = lagKart(storrelse);
    const pane = map.getPane('mapPane') as HTMLElement;
    const hendelser: string[] = [];
    for (const type of ['movestart', 'move', 'moveend', 'zoomstart', 'zoom', 'zoomend', 'zoomanim', 'viewreset', 'resize']) {
      map.on(type, () => hendelser.push(type));
    }
    const bilder: Record<string, unknown>[] = [];
    const ta = (navn: string) =>
      bilder.push(JSON.parse(JSON.stringify({ navn, senter: map.getCenter(), zoom: map.getZoom(), flate: L.DomUtil.getPosition(pane), klasser: pane.className })));

    map.panBy([10, 5], { animate: false });
    ta('panBy');
    map.setView([60.39, 5.32], 9, { animate: false });
    ta('setView');
    map._animateZoom(L.latLng(60.4, 5.3), 10, true);
    ta('zoom-start');
    vi.advanceTimersByTime(300);
    ta('zoom-slutt');
    map.panBy([30, 0], { animate: true, duration: 0.1 });
    ta('pan-start');
    vi.advanceTimersByTime(500);
    ta('pan-slutt');
    storrelse.bredde = 300;
    map.invalidateSize({ debounceMoveend: true });
    vi.advanceTimersByTime(300);
    ta('storrelse');
    map.remove();
    vi.useRealTimers();
    document.body.innerHTML = '';
    return { bilder, hendelser };
  }

  it('grunnlinja uten vern kjører animasjonene helt i mål', () => {
    const { bilder, hendelser } = scenario(false);
    const bilde = (navn: string) => bilder.find((b) => b.navn === navn) as { flate: { x: number }; klasser: string; zoom: number };
    expect(bilde('zoom-start').klasser).toContain('leaflet-zoom-anim');
    expect(bilde('zoom-slutt').klasser).not.toContain('leaflet-zoom-anim');
    expect(bilde('zoom-slutt').zoom).toBe(10);
    expect(bilde('pan-start').klasser).toContain('leaflet-pan-anim');
    expect(bilde('pan-slutt').klasser).not.toContain('leaflet-pan-anim');
    expect(bilde('pan-slutt').flate.x).toBe(bilde('zoom-slutt').flate.x - 30);
    // setView fra zoom 11 til 9 og zoom-animasjonen til 10: to zoomend.
    expect(hendelser.filter((h) => h === 'zoomend')).toHaveLength(2);
    expect(hendelser.filter((h) => h === 'moveend').length).toBeGreaterThanOrEqual(4);
  });

  it('samme scenario gir nøyaktig samme resultat med vern', () => {
    const uten = scenario(false);
    const med = scenario(true);
    expect(med).toEqual(uten);
  });
});
