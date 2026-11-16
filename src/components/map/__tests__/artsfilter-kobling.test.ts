import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Artsfilteret har ÉN tilstand, og alt som viser eller endrer den, henger på
 * den: brikken, filterarket, søketeksten, de tre kartlagene og de lovende
 * områdene.
 *
 * Reglene er testet for seg (src/lib/map/__tests__/artsfilter-navn.test.ts og
 * MapFilters.test.tsx). MushroomMap.tsx lastes ikke av noen test (Leaflet +
 * DOM), så koblingen låses med en kildevakt — samme grep som de andre
 * kartlagene.
 */
const KART = readFileSync(new URL('../MushroomMap.tsx', import.meta.url), 'utf8');
const ARK = readFileSync(new URL('../MapFilters.tsx', import.meta.url), 'utf8');

function mellom(kilde: string, start: string, slutt: string): string {
  const fra = kilde.indexOf(start);
  expect(fra, `fant ikke «${start}»`).toBeGreaterThan(-1);
  const til = kilde.indexOf(slutt, fra + start.length);
  expect(til, `fant ikke «${slutt}» etter «${start}»`).toBeGreaterThan(fra);
  return kilde.slice(fra, til);
}

describe('filterarket og artsfilteret', () => {
  const bruk = mellom(KART, '<MapFilters', '/>');

  it('arket får navnet kartet viser, og nullstiller samme vei som brikken', () => {
    expect(bruk).toContain('speciesName={selectedSpeciesName}');
    expect(bruk).toContain('onClearSpecies={clearSpeciesSearch}');
  });

  it('arket kan ikke lenger flytte kartet eller velge art på egen hånd', () => {
    expect(bruk).not.toContain('onSelectPlace');
    expect(KART).not.toContain('onSelectPlace');
    // Ingen søk i arket: verken mot artstabellen eller stedssøket.
    expect(ARK).not.toContain('searchPlaces');
    expect(ARK).not.toContain('mushroom_species');
    expect(ARK).not.toContain('createClient');
    // Og arket setter aldri speciesId selv.
    expect(ARK).not.toMatch(/speciesId:\s*(item\.id|null)/);
  });

  it('nullstillingen tømmer brikken, søketeksten, filteret og de lovende områdene sammen', () => {
    const nullstill = mellom(KART, 'const clearSpeciesSearch = useCallback(() => {', '}, [clearTopSpots, setFilters]);');
    expect(nullstill).toContain('speciesId: null');
    expect(nullstill).toContain('setSelectedSpeciesName(null);');
    expect(nullstill).toContain("setSpeciesSearch('');");
    expect(nullstill).toContain('clearTopSpots();');
  });
});

describe('et artsfilter uten navn rettes når artslista er lastet', () => {
  const retting = mellom(KART, 'const retting = rettArtsfilter({', 'clearSpeciesSearch]);');

  it('spør regelen med gjeldende filter, navn og artsliste', () => {
    expect(retting).toContain('speciesId: filters.speciesId');
    expect(retting).toContain('speciesName: selectedSpeciesName');
    expect(retting).toContain('navn: speciesNamesRef.current');
  });

  it('setter navnet uten å skrive over søketeksten, og fjerner en ukjent art helt', () => {
    expect(retting).toContain('setSelectedSpeciesName(retting.navn);');
    expect(retting).toContain('setSpeciesSearch((tekst) => tekst || retting.navn);');
    expect(retting).toMatch(/retting\.type === 'fjern_art'\) \{\s*clearSpeciesSearch\(\);/);
  });

  it('kjører på nytt når artslista kommer inn (den ligger i en ref)', () => {
    expect(retting).toContain('[filters.speciesId, selectedSpeciesName, speciesNamesVersion,');
  });
});

describe('alle tre lagene følger artsfilteret med en gang', () => {
  it('funnlaget, flisene og de registrerte funnene lastes når lasteren deres endres', () => {
    for (const laster of ['loadFindings', 'loadPredictionTiles', 'loadOccurrences']) {
      expect(KART, laster).toMatch(
        new RegExp(`useEffect\\(\\(\\) => \\{\\s*void ${laster}\\(\\);\\s*\\}, \\[${laster}\\]\\);`)
      );
    }
  });

  it('alle tre lasterne avhenger av artsfilteret', () => {
    expect(mellom(KART, 'const loadPredictionTiles = useCallback(async () => {', 'const bindSpotFeedback')).toContain(
      '}, [filters.speciesId, supabase]);'
    );
    expect(mellom(KART, 'const loadOccurrences = useCallback(async () => {', 'const toggleOccurrences')).toContain(
      '}, [filters.speciesId, supabase, t]);'
    );
    // Lista står over flere linjer, så den leses som en liste og ikke som en
    // streng. Hele settet er låst: alt her må ha stabil identitet, ellers
    // henter kartet funn på nytt ved hver gjengivelse (se deleteFinding).
    const funnDeps = mellom(KART, 'const loadFindings = useCallback(async () => {', 'loadFindingsRef.current = loadFindings;')
      .match(/\}, \[([^\]]*)\]\);\s*useEffect\(\(\) => \{\s*$/)?.[1]
      .split(',')
      .map((navn) => navn.trim())
      .filter(Boolean);
    expect(funnDeps).toContain('filters');
    expect([...(funnDeps ?? [])].sort()).toEqual(
      [
        'blockFindingAuthor',
        'blokkerte',
        'currentUserId',
        'currentUsername',
        'deleteFinding',
        'filters',
        'locale',
        'messages',
        'reportFinding',
        'supabase'
      ].sort()
    );
  });
});
