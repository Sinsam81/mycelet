import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Hva som hentes når kartet flyttes.
 *
 * Hvert «moveend» startet fire hentinger uten opphold: prognosen (ny nøkkel
 * for hvert lille rykk, fordi punktet hadde seks desimaler), funnlaget,
 * flisene, og de registrerte funnene — opptil 6000 rader over seks
 * forespørsler, fulgt av at hver markør ble bygget opp igjen med ferdig
 * popup-tekst. På én strek dekning i skogkanten er det megabyte for å vise det
 * samme.
 *
 * Selve gjenbruksregelen er testet i src/lib/map/__tests__/utsnitt-gjenbruk.test.ts.
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

describe('moveend — hentingene venter til kartet står i ro', () => {
  const onMoveEnd = mellom('const onMoveEnd = () => {', 'const lastForUtsnitt = () => {');
  const lastForUtsnitt = mellom('const lastForUtsnitt = () => {', "map.on('moveend', onMoveEnd);");

  it('onMoveEnd starter ingen henting selv — bare tidtakeren', () => {
    expect(onMoveEnd).not.toContain('loadFindingsRef.current()');
    expect(onMoveEnd).not.toContain('loadPredictionTilesRef.current()');
    expect(onMoveEnd).not.toContain('loadOccurrencesRef.current()');
    expect(onMoveEnd).not.toContain('setPredictionCoords(');
    expect(onMoveEnd).toContain('clearTimeout(moveLoadTimerRef.current)');
    expect(onMoveEnd).toMatch(/setTimeout\(\(\) => \{[\s\S]*lastForUtsnitt\(\);[\s\S]*\}, FLYTT_RO_MS\)/);
  });

  it('lagbyttet (Kartverket ↔ OSM) og utsnittet skjer fortsatt med en gang', () => {
    // Uten dette sto et svensk utsnitt blankt i 300 ms ekstra for hver flytting.
    expect(onMoveEnd).toContain('baseKart.addTo(map)');
    expect(onMoveEnd).toContain('setViewport(');
    expect(onMoveEnd.indexOf('setViewport(')).toBeLessThan(onMoveEnd.indexOf('setTimeout('));
  });

  it('lasteren sjekker at kartet fortsatt finnes — tidtakeren kan fyre etter at siden er forlatt', () => {
    expect(lastForUtsnitt.indexOf('if (mapRef.current !== map) return;')).toBeGreaterThan(-1);
    expect(lastForUtsnitt.indexOf('if (mapRef.current !== map) return;')).toBeLessThan(
      lastForUtsnitt.indexOf('loadFindingsRef.current()')
    );
  });

  it('tidtakeren ryddes når kartet fjernes', () => {
    const opprydding = mellom('mounted = false;', 'eslint-disable-next-line react-hooks/exhaustive-deps');
    expect(opprydding).toContain('clearTimeout(moveLoadTimerRef.current)');
  });

  it('første lasting venter ikke ut roen', () => {
    const etterLytter = mellom("map.on('moveend', onMoveEnd);", '«Let etter denne arten»');
    expect(etterLytter).toContain('lastForUtsnitt();');
  });
});

describe('prognosepunktet — én presisjon, så nøkkelen gjenbrukes', () => {
  it('settes aldri med rå koordinater', () => {
    const kall = KILDE.match(/setPredictionCoords\([^)]*\)/g) ?? [];
    expect(kall.length).toBeGreaterThanOrEqual(3);
    for (const k of kall) expect(k, k).toContain('roundForProviderLookup(');
  });

  it('starter også avrundet (dyplenke og husket utsnitt)', () => {
    const start = mellom('const [predictionCoords, setPredictionCoords] = useState', 'const [tileHotspots');
    expect(start).toContain('roundForProviderLookup(lat, lng)');
  });
});

describe('registrerte funn — hentes og tegnes bare når noe er endret', () => {
  const loader = mellom('const loadOccurrences = useCallback(async () => {', 'const toggleOccurrences = useCallback');

  it('spør gjenbruksregelen før det hentes', () => {
    expect(loader.indexOf('kanGjenbrukeHenting(')).toBeGreaterThan(-1);
    expect(loader.indexOf('kanGjenbrukeHenting(')).toBeLessThan(loader.indexOf("'get_occurrences_in_bounds'"));
  });

  it('en polstret henting som ble avkuttet, hentes på nytt for akkurat det som vises', () => {
    expect(loader).toMatch(/result\.truncated && utsnitt !== visning[\s\S]{0,80}utsnitt = visning;/);
  });

  it('en feilet henting huskes ikke', () => {
    expect(loader).toContain('lastOccFetchRef.current = result.error ? null : henting;');
  });

  it('beholder vernet mot utdaterte svar, både etter hentingen og før tegningen', () => {
    // Ett vern, to steder: en nyere lasting, eller et kart som er byttet ut.
    expect(loader).toContain(
      'const utdatert = () => gen !== occLoadGenRef.current || occClusterRef.current !== cluster;'
    );
    const etterHenting = loader.indexOf('if (utdatert()) return;');
    const forTegning = loader.lastIndexOf('if (utdatert()) return;');
    expect(etterHenting).toBeGreaterThan(-1);
    expect(forTegning).toBeGreaterThan(etterHenting);
    // Etter hentingen: før svaret huskes. Før tegningen: etter importen, før laget tømmes.
    expect(etterHenting).toBeLessThan(loader.indexOf('lastOccFetchRef.current = result.error ? null : henting;'));
    expect(forTegning).toBeGreaterThan(loader.indexOf("await import('leaflet')"));
    expect(forTegning).toBeLessThan(loader.lastIndexOf('cluster.clearLayers();'));
  });

  it('generasjonen tas før grenen som bare tømmer laget, så også den gjør pågående hentinger ugyldige', () => {
    expect(loader.indexOf('const gen = ++occLoadGenRef.current;')).toBeGreaterThan(-1);
    expect(loader.indexOf('const gen = ++occLoadGenRef.current;')).toBeLessThan(
      loader.indexOf('if (!showOccurrencesRef.current) {')
    );
  });

  it('popupen bygges når den åpnes, ikke for hvert punkt på forhånd', () => {
    expect(loader).toContain('.bindPopup(() => byggPopup(o))');
  });

  it('forbeholdene i popupen står ordrett som før', () => {
    for (const nokkel of ['speciesEdibilityNote', 'historicalFindingNote', 'coordUncertainty', 'registeredFinding']) {
      expect(loader, nokkel).toContain(`t('${nokkel}'`);
    }
    expect(loader).toContain('Artsdatabanken/GBIF');
  });

  it('teller bare funnene som er i det som vises — hentingen kan være polstret', () => {
    expect(loader).toMatch(/setOccCount\(points\.filter\(\(o\) => ligger\(/);
  });

  it('nullstilles når laget slås av — og en henting som er underveis, får ikke fylle det igjen', () => {
    const toggle = mellom('const toggleOccurrences = useCallback', 'const setOccEdibilityFilter = useCallback');
    expect(toggle).toContain('lastOccFetchRef.current = null;');
    expect(toggle).toContain('lastOccDrawRef.current = null;');
    expect(toggle).toContain('occLoadGenRef.current++;');
  });
});
