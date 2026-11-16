import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * «⭐ Lovende» bruker reglene i src/lib/map/lovende-sok.ts — de er testet der
 * (og mot ruta i src/app/api/prediction/grid/__tests__/beste-score.test.ts).
 * MushroomMap.tsx lastes ikke av noen test (Leaflet + DOM), så koblingen låses
 * med en kildevakt — samme grep som de andre kartlagene.
 */
const KILDE = readFileSync(new URL('../MushroomMap.tsx', import.meta.url), 'utf8');

function mellom(start: string, slutt: string): string {
  const fra = KILDE.indexOf(start);
  expect(fra, `fant ikke «${start}»`).toBeGreaterThan(-1);
  const til = KILDE.indexOf(slutt, fra + start.length);
  expect(til, `fant ikke «${slutt}» etter «${start}»`).toBeGreaterThan(fra);
  return KILDE.slice(fra, til);
}

const sok = mellom('const generateTopSpots = useCallback(async (', 'setTopAccess(limited ?');

describe('«Lovende» — søket følger reglene i lovende-sok.ts', () => {
  it('radiene kommer fra samme sted som reglene', () => {
    expect(sok).toContain('const RADII_KM = LOVENDE_RADIER_KM;');
    expect(sok).not.toMatch(/RADII_KM = \[/);
  });

  it('avgjørelsen tas på serverens rå liste, ikke på det som er igjen etter at hjørnene er kuttet', () => {
    expect(sok).toContain('const serverCells = (data.cells ?? []) as Spot[];');
    expect(sok).toContain('serverCellsEmpty: serverCells.length === 0,');
    // Treff innenfor radiusen avslutter søket FØR reglene spørres.
    expect(sok.indexOf('if (found.length > 0) {')).toBeLessThan(sok.indexOf('nesteSteg({'));
  });

  it('dekningen og den beste scoren i svaret blir lest', () => {
    expect(sok).toContain('coverage: data.coverage,');
    expect(sok).toContain('bestScore: data.bestScore,');
    expect(sok).toContain('skogSett = skogSett || harSkogdekning(data.coverage);');
  });

  it('neste radius er den reglene peker på — ikke alltid den neste i rekka', () => {
    expect(sok).toContain('i = nesteRadiusIndex(sluttSteg, i);');
    expect(sok).not.toMatch(/for \(let i = 0; i < RADII_KM\.length; i\+\+\)/);
  });

  it('«utvider søket» sies bare når det faktisk kommer et kall til', () => {
    expect(sok).toMatch(/if \(i !== null\) \{\s*setTopMsg\(t\('expandingSearch', \{ km: radiusKm \}\)\);/);
  });

  it('avslår og kvotefeil stopper søket som før', () => {
    expect(sok).toMatch(/if \(res\.status === 403\) \{\s*setTopMsg\(t\('requiresPremium'\)\);\s*return;/);
    expect(sok).toMatch(/if \(res\.status === 429\) \{[\s\S]{0,260}return;/);
  });
});

describe('«Lovende» — enhetens eksakte posisjon går ikke ut i forespørselen', () => {
  // Midt i boksen ligger utgangspunktet, og rutenett-ruta slår opp vær, skog og
  // høyde hos eksterne tjenester for det. Ruta fester selv midtpunktet
  // (src/app/api/prediction/grid/__tests__/oppslagspresisjon.test.ts); kartet
  // runder i tillegg FØR boksen regnes ut, så punktet heller ikke står i URL-en.
  it('utgangspunktet rundes før boksen regnes ut', () => {
    const avrunding = sok.indexOf('const { lat: originLat, lon: originLng } = roundForProviderLookup(');
    expect(avrunding).toBeGreaterThan(-1);
    expect(avrunding).toBeLessThan(sok.indexOf('const box = {'));
    // Ingen andre tilordninger av utgangspunktet — da kunne det rå punktet kommet inn igjen.
    expect(sok.match(/\boriginLat\b\s*=[^=]/g) ?? []).toHaveLength(0);
    expect(sok.match(/\boriginLng\b\s*=[^=]/g) ?? []).toHaveLength(0);
  });

  it('boksen, radiusen og avstandene bruker det samme avrundede punktet', () => {
    expect(sok).toContain('minLat: originLat - latDelta,');
    expect(sok).toContain('minLng: originLng - lngDelta,');
    expect(sok).toContain('filterWithinRadiusKm({ lat: originLat, lng: originLng }, serverCells, radiusKm)');
  });
});

describe('«Soppbilder på kartet» — samme regel for utsnittet som sendes', () => {
  const bilder = mellom('const generateSpeciesSpots = useCallback(async () => {', '/api/prediction/species-spots');

  it('utsnittet festes til oppslagspresisjonen før det går ut', () => {
    expect(bilder).toContain('const boks = festBoksTilOppslagspresisjon({');
    for (const kant of ['minLat', 'maxLat', 'minLng', 'maxLng']) {
      expect(bilder, kant).toContain(`${kant}: String(boks.${kant})`);
    }
    // Kartets egne, eksakte grenser brukes ikke direkte i forespørselen.
    expect(bilder).not.toMatch(/String\(b\.get(South|North|West|East)\(\)\)/);
  });
});

describe('«Lovende» — sluttmeldingen sier hva som mangler', () => {
  const slutt = mellom('if (spots.length === 0) {', 'setTopAccess(limited ?');

  it('skog, men svake forhold: den nye meldingen — med artsnavnet når en art er valgt', () => {
    expect(slutt).toContain("if (sluttSteg === 'stopp_forhold') {");
    expect(slutt).toContain("t('weakConditionsSpecies', { species: art })");
    expect(slutt).toContain("t('weakConditions')");
  });

  it('ellers den gamle meldingen om skog, med den største radiusen', () => {
    expect(slutt).toContain("t('littleForestData', { km: RADII_KM[RADII_KM.length - 1] })");
  });

  it('lagene tømmes i begge tilfeller', () => {
    expect(slutt.indexOf('clearTopSpots();')).toBeGreaterThan(-1);
    expect(slutt.indexOf('clearTopSpots();')).toBeLessThan(slutt.indexOf("if (sluttSteg === 'stopp_forhold') {"));
  });
});

describe('«Lovende» — etterpå står kartet der APPEN la det', () => {
  // Søket avslutter med å zoome kartet til boksen rundt de lovende områdene.
  // Senteret der har ingen pekt ut. Skrives det ikke ned som appens, leser
  // funnskjemaet flyttingen som brukerens egen: med fersk GPS må hvert pluss
  // etter «Lovende» velge mellom to posisjoner, og uten GPS lagres funnet
  // midt i boksen uten spørsmål. Regelen står i src/lib/map/funnposisjon.ts,
  // og punktet er prøvd mot ekte Leaflet i lovende-autosenter.test.ts.
  const slutten = mellom('setTopAccess(limited ?', '}, [filters.speciesId, renderTopSpots, clearTopSpots, t]);');

  it('senteret av boksen kartet zoomes til, skrives ned som appens', () => {
    const boks = slutten.indexOf('const utsnitt = bounds.pad(0.2);');
    const zoom = slutten.indexOf('map.fitBounds(utsnitt);');
    const skrevet = slutten.indexOf(
      'autoSenterRef.current = senterForBoks(utsnitt.getSouthWest(), utsnitt.getNorthEast());'
    );
    expect(boks).toBeGreaterThan(-1);
    expect(zoom).toBeGreaterThan(boks);
    // Rett etter, og av SAMME boks som kartet ble zoomet til.
    expect(skrevet).toBeGreaterThan(zoom);
    expect(slutten.slice(zoom, skrevet)).not.toMatch(/\bawait\b/);
  });

  it('målet regnes ut — det leses ikke av en «moveend» som kan høre til en annen flytting', () => {
    expect(slutten).not.toMatch(/\.once\(\s*'moveend'/);
    expect(slutten).not.toContain('map.getCenter()');
  });

  it('dette er det eneste stedet kartet zoomes til en boks', () => {
    // Kommer det et til, må det også si hvor appen la kartet.
    expect(KILDE.match(/\.fitBounds\(/g) ?? []).toHaveLength(1);
  });

  it('«Let etter denne arten» går gjennom samme funksjon, så det gjelder også ved åpning', () => {
    expect(KILDE).toContain('generateTopSpotsRef.current = generateTopSpots;');
    const apning = mellom('if (initialSpeciesRef.current) {', 'void init();');
    expect(apning.match(/generateTopSpotsRef\.current\(id/g) ?? []).toHaveLength(2);
  });

  it('pluss måler kartsenteret mot nettopp det senteret', () => {
    const pluss = mellom('const senter = map?.getCenter();', 'setShowAddSheet(true);');
    expect(pluss).toMatch(
      /flyttet: kartErFlyttet\(\s*\{ lat: senter\.lat, lng: senter\.lng \},\s*autoSenterRef\.current,\s*flyttetoleranseMeter\(senter\.lat, map\.getZoom\(\)\)\s*\)/
    );
    expect(KILDE).toContain('kartFlyttet={addSheetKart?.flyttet ?? false}');
  });
});

describe('«Lovende» — teksten lover ingenting', () => {
  const tekster = [
    ['nb', nb.MushroomMap.weakConditions, nb.MushroomMap.weakConditionsSpecies],
    ['sv', sv.MushroomMap.weakConditions, sv.MushroomMap.weakConditionsSpecies]
  ] as const;

  it('finnes på begge språk, og artsvarianten tar artsnavnet som parameter', () => {
    for (const [sprak, generell, art] of tekster) {
      expect(generell.length, sprak).toBeGreaterThan(40);
      expect(generell, sprak).not.toContain('{');
      expect(art, sprak).toContain('{species}');
    }
    // Ikke samme tekst på begge språk.
    expect(sv.MushroomMap.weakConditions).not.toBe(nb.MushroomMap.weakConditions);
  });

  it('sier at det er skog her — ikke at brukeren skal flytte seg nærmere skog', () => {
    expect(nb.MushroomMap.weakConditions).toMatch(/^Det er skog her/);
    expect(sv.MushroomMap.weakConditions).toMatch(/^Det finns skog här/);
    for (const [sprak, generell, art] of tekster) {
      for (const tekst of [generell, art]) {
        expect(tekst, sprak).not.toMatch(/nærmere skog|närmare skog/);
      }
    }
  });

  it('har ingen tall og ingen påstand om at det ikke finnes sopp', () => {
    for (const [sprak, generell, art] of tekster) {
      for (const tekst of [generell, art]) {
        expect(tekst, sprak).not.toMatch(/\d/);
        expect(tekst, sprak).not.toMatch(/ingen sopp|finnes ikke sopp|ingen svamp|finns ingen svamp/i);
      }
    }
  });
});
