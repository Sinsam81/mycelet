import type * as Leaflet from 'leaflet';

/**
 * Leaflet 1.9 lar egne tidtakere og animasjonsrammer leve videre etter
 * map.remove(). remove() sletter kartflaten (`_mapPane`), men:
 *
 *  - en zoom setter setTimeout(_onZoomTransitionEnd, 250) og nullstiller ikke
 *    `_animatingZoom` ved remove(), så tidtakeren kjører _move → _getMapPanePos
 *    → getPosition(undefined). Sentry MYCELET-9: «undefined is not an object
 *    (evaluating 't._leaflet_pos')», mekanisme setTimeout.
 *  - et sveip med fart planlegger requestAnimationFrame(() => map.panBy(...))
 *    for treghet. Fjernes kartet før den rammen, kaller panBy
 *    addClass(undefined). Sentry MYCELET-A: «undefined is not an object
 *    (evaluating 't.classList')», mekanisme requestAnimationFrame.
 *
 * Begge skjedde på iPhone rett etter at brukeren forlot /map (Sentry-URL «/»
 * og «/profile»): et trykk i menyen eller et sveip tilbake fra kanten mens
 * kartet fortsatt zoomet eller gled. Ingenting av dette er synlig for
 * brukeren — siden er alt byttet — men feilene er ubehandlede og havner i
 * Sentry som høy prioritet.
 *
 * Søsken av samme slag: en størrelsesendring (telefonen roteres, verktøylinja
 * endrer høyde) gir invalidateSize({debounceMoveend: true}), som sender
 * «moveend» 200 ms senere via `_sizeTimer`. remove() tømmer den ikke og kobler
 * heller ikke fra appens egne lyttere, så hendelsen nådde kartsidens
 * moveend-lytter på et kart som var borte.
 *
 * Vernet pakker inn hver Map-metode som rører kartflaten direkte (funnet med
 * `grep _mapPane node_modules/leaflet/src/map/Map.js`) slik at den ikke gjør
 * noe når flaten er borte. Et levende kart har alltid `_mapPane` og går
 * uendret gjennom originalen. `_animateZoom` har allerede samme vern i
 * Leaflet selv. I tillegg tømmer remove() den ventende `_sizeTimer`. Testen i __tests__/leafletEtterFjerning.test.ts gjenskaper
 * begge feilene uten vernet og feiler hvis en ny Leaflet-versjon gir nytt
 * navn til noen av metodene.
 */

/** Map-metodene som derefererer `this._mapPane` og kan kalles etter remove(). */
export const VERNEDE_METODER = [
  '_onZoomTransitionEnd',
  '_getMapPanePos',
  'panBy',
  '_rawPanBy',
  '_resetView',
  '_onPanTransitionEnd'
] as const;

type VernetMetode = (typeof VERNEDE_METODER)[number];

interface KartInternt {
  _mapPane?: HTMLElement;
  _animatingZoom?: boolean;
  /** invalidateSize sin forsinkede «moveend» (Map.js). */
  _sizeTimer?: ReturnType<typeof setTimeout>;
}

type Metode = (this: KartInternt, ...args: unknown[]) => unknown;

const VERNET = Symbol.for('mycelet.leaflet.vernEtterFjerning');

/** Hva hver metode gjør på et fjernet kart. Samme returtype som originalen. */
function etterFjerning(L: typeof Leaflet): Record<VernetMetode, (kart: KartInternt) => unknown> {
  return {
    // Tidtakeren fra _animateZoom: ingen flate å flytte. Nullstill flagget så
    // et senere kall heller ikke prøver.
    _onZoomTransitionEnd: (kart) => {
      kart._animatingZoom = false;
      return undefined;
    },
    // Samme verdi som Leaflet selv faller tilbake på når posisjonen mangler.
    _getMapPanePos: () => L.point(0, 0),
    // panBy er kjedbar (returnerer kartet).
    panBy: (kart) => kart,
    _rawPanBy: () => undefined,
    _resetView: () => undefined,
    _onPanTransitionEnd: () => undefined
  };
}

/**
 * Legg vernet på Leaflets Map-prototype. Kalles én gang før det første kartet
 * lages; senere kall gjør ingenting.
 */
export function vernLeafletEtterFjerning(L: typeof Leaflet): void {
  const proto = L.Map.prototype as unknown as Record<string | symbol, unknown>;
  if (proto[VERNET]) return;
  const reserve = etterFjerning(L);
  for (const navn of VERNEDE_METODER) {
    const original = proto[navn];
    // Mangler metoden (ny Leaflet-versjon), lar vi den være: et manglende vern
    // er bedre enn et kart som ikke starter. Testen fanger det.
    if (typeof original !== 'function') continue;
    proto[navn] = function (this: KartInternt, ...args: unknown[]) {
      return this._mapPane ? (original as Metode).apply(this, args) : reserve[navn](this);
    };
  }
  const remove = proto.remove;
  if (typeof remove === 'function') {
    proto.remove = function (this: KartInternt, ...args: unknown[]) {
      clearTimeout(this._sizeTimer);
      return (remove as Metode).apply(this, args);
    };
  }
  proto[VERNET] = true;
}
