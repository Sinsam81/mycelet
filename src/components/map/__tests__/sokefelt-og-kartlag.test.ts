import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * To ting på kartet som bare fantes for den som ser skjermen og leser norsk:
 *
 *  - Søkefeltet hadde en plassholder og ikke noe navn, og fokusrammen var
 *    fjernet uten erstatning.
 *  - Lagvelgeren (Terreng / Kart / Satellitt / Turruter) sto med faste norske
 *    ord, mens den svenske introen ba brukeren bytte til «Satellit».
 *
 * MushroomMap.tsx lastes ikke av noen test (Leaflet + DOM), derfor kildevakter.
 */
const MAPPE = new URL('..', import.meta.url);
const les = (navn: string) => readFileSync(new URL(navn, MAPPE), 'utf8');
const KART = les('MushroomMap.tsx');

describe('søkefeltet på kartet', () => {
  const start = KART.indexOf('value={speciesSearch}');
  const felt = KART.slice(KART.lastIndexOf('<input', start), KART.indexOf('/>', start));

  it('står i kildekoden der testen leter', () => {
    expect(start).toBeGreaterThan(-1);
    expect(felt).toContain('onChange={(event) => searchSpeciesForSpots(event.target.value)}');
  });

  it('har et navn, og navnet følger plassholderen', () => {
    const uttrykk = "{selectedSpeciesName ? t('searchPlaceOnly') : t('searchSpeciesOrPlace')}";
    expect(felt).toContain(`placeholder=${uttrykk}`);
    expect(felt).toContain(`aria-label=${uttrykk}`);
  });

  it('har en synlig fokusramme i stedet for den som er fjernet', () => {
    expect(felt).toContain('focus:outline-none');
    expect(felt).toMatch(/focus-visible:ring-2 focus-visible:ring-forest-\d+/);
  });

  it('kutter en for lang plassholder med «…», ikke midt i et ord', () => {
    expect(felt).toContain('placeholder-shown:text-ellipsis');
  });

  it('ingen kartkomponent fjerner fokusrammen uten å gi en annen', () => {
    for (const navn of readdirSync(MAPPE).filter((n) => /\.tsx$/.test(n))) {
      for (const klasser of les(navn).match(/className="[^"]*focus:outline-none[^"]*"/g) ?? []) {
        expect(klasser, navn).toMatch(/focus(-visible)?:ring-/);
      }
    }
  });

  it('nøklene finnes på begge språk og sier det samme', () => {
    expect(nb.MushroomMap.searchSpeciesOrPlace).toMatch(/^Søk sopp eller sted/);
    expect(sv.MushroomMap.searchSpeciesOrPlace).toMatch(/^Sök svamp eller plats/);
    expect(nb.MushroomMap.searchPlaceOnly).toMatch(/^Søk sted/);
    expect(sv.MushroomMap.searchPlaceOnly).toMatch(/^Sök plats/);
  });
});

describe('lagvelgeren på kartet', () => {
  const NOKLER = ['layerTerrain', 'layerMap', 'layerSatellite', 'layerTrails'] as const;

  it('bygges av oversatte navn, ikke av faste norske ord', () => {
    const start = KART.indexOf('L.control\n        .layers(');
    expect(start).toBeGreaterThan(-1);
    const velger = KART.slice(start, KART.indexOf('.addTo(map);', start));
    for (const nokkel of NOKLER) expect(velger, nokkel).toContain(`[t('${nokkel}')]`);
    expect(velger).not.toMatch(/\{\s*Terreng:/);
    expect(KART).not.toContain("'Turruter (Kartverket, Norge)'");
  });

  it('har navnene på begge språk, og de svenske er svenske', () => {
    expect(NOKLER.map((n) => nb.MushroomMap[n])).toEqual(['Terreng', 'Kart', 'Satellitt', 'Turruter (Kartverket, Norge)']);
    expect(NOKLER.map((n) => sv.MushroomMap[n])).toEqual([
      'Terräng',
      'Karta',
      'Satellit',
      'Vandringsleder (Kartverket, Norge)'
    ]);
  });

  it('gir hvert lag sitt eget navn — like navn ville slått to lag sammen til ett valg', () => {
    for (const katalog of [nb, sv]) {
      const navn = NOKLER.map((n) => katalog.MushroomMap[n]);
      expect(new Set(navn).size).toBe(navn.length);
    }
  });

  it('introen nevner satellittlaget med det navnet lagvelgeren faktisk viser', () => {
    expect(nb.MushroomMap.introSatellite).toContain(`<b>${nb.MushroomMap.layerSatellite}</b>`);
    expect(sv.MushroomMap.introSatellite).toContain(`<b>${sv.MushroomMap.layerSatellite}</b>`);
  });

  it('kildeangivelsen for flyfoto og turruter følger språket', () => {
    expect(KART).toContain("`${t('attributionAerial')} &copy; Esri, Maxar, Earthstar Geographics`");
    expect(KART).toContain("`${t('attributionTrails')} &copy; Kartverket`");
    expect([nb.MushroomMap.attributionAerial, sv.MushroomMap.attributionAerial]).toEqual(['Flyfoto', 'Flygfoto']);
    expect([nb.MushroomMap.attributionTrails, sv.MushroomMap.attributionTrails]).toEqual(['Turruter', 'Vandringsleder']);
  });

  it('Leaflets egne knapper har navn på leserens språk, ikke «Zoom in», «Layers» og «Close popup»', () => {
    expect(KART).toContain(".zoom({ position: 'topright', zoomInTitle: t('zoomIn'), zoomOutTitle: t('zoomOut') })");
    expect(KART).toContain("lagknapp?.setAttribute('aria-label', t('layersControl'));");
    const popup = KART.slice(KART.indexOf("map.on('popupopen', (e: import('leaflet').PopupEvent) => {"));
    expect(popup.slice(0, 400)).toContain(".querySelector('.leaflet-popup-close-button')");
    expect(popup.slice(0, 400)).toContain("kryss.setAttribute('aria-label', t('closePopup'));");
    expect([nb.MushroomMap.zoomIn, nb.MushroomMap.zoomOut, nb.MushroomMap.layersControl, nb.MushroomMap.closePopup]).toEqual([
      'Zoom inn',
      'Zoom ut',
      'Kartlag',
      'Lukk'
    ]);
    expect([sv.MushroomMap.zoomIn, sv.MushroomMap.zoomOut, sv.MushroomMap.layersControl, sv.MushroomMap.closePopup]).toEqual([
      'Zooma in',
      'Zooma ut',
      'Kartlager',
      'Stäng'
    ]);
  });

  it('husker turrutelaget på lagets identitet, ikke på navnet', () => {
    // Navnene er nå oversatt; et oppslag på navn ville glemt valget ved språkbytte.
    expect(KART).toContain("if (e.layer === turruter) writeLocal(TRAIL_LAYER_KEY, '1');");
    expect(KART).toContain("if (e.layer === turruter) writeLocal(TRAIL_LAYER_KEY, '0');");
  });
});
