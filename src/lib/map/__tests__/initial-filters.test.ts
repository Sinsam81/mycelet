import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERIOD,
  OWN_FINDINGS_PERIOD,
  activeFilterCount,
  defaultPeriodFor,
  initialMapFilters,
  nextMapFilters,
  type MapFilterState
} from '../initial-filters';

const urort: MapFilterState = { speciesId: null, period: DEFAULT_PERIOD, onlyMine: false };

describe('initialMapFilters', () => {
  it('fellesskapslaget starter på «denne måneden», som før', () => {
    expect(initialMapFilters({ startWithOnlyMine: false, speciesId: null })).toEqual({
      speciesId: null,
      period: 'month',
      onlyMine: false
    });
  });

  it('/map?mine=1 starter på «alle» — lenken fra Mine steder lover egne funn synlige, ikke bare denne månedens', () => {
    // 10. november åpnet hvert sted til et kart uten en eneste egen markør,
    // selv om kortet nettopp sa «12 funn».
    expect(initialMapFilters({ startWithOnlyMine: true, speciesId: null })).toEqual({
      speciesId: null,
      period: 'all',
      onlyMine: true
    });
  });

  it('arten fra dyplenken eller det huskede utsnittet følger med', () => {
    expect(initialMapFilters({ startWithOnlyMine: false, speciesId: 7 }).speciesId).toBe(7);
    expect(initialMapFilters({ startWithOnlyMine: true, speciesId: 7 })).toMatchObject({ speciesId: 7, period: 'all' });
  });
});

describe('nextMapFilters — perioden følger «Kun mine funn» i det den slås av og på', () => {
  it('slås den PÅ, blir perioden «alle»', () => {
    expect(nextMapFilters(urort, { ...urort, onlyMine: true })).toEqual({ speciesId: null, period: 'all', onlyMine: true });
  });

  it('også når brukeren hadde valgt en smalere periode først — poenget er å se funnene sine', () => {
    const smal: MapFilterState = { speciesId: 3, period: '3months', onlyMine: false };
    expect(nextMapFilters(smal, { ...smal, onlyMine: true })).toEqual({ speciesId: 3, period: 'all', onlyMine: true });
  });

  it('et privat funn lagret fra kartet slår den på: funnet skal synes selv om det er backdatert', () => {
    // onSaved-banen i MushroomMap: setFilters((f) => ({ ...f, onlyMine: true })).
    const etterLagring = nextMapFilters(urort, { ...urort, onlyMine: true });
    expect(etterLagring.period).toBe(OWN_FINDINGS_PERIOD);
  });

  it('mens den står på, tvinges ingenting: brukeren kan snevre inn igjen', () => {
    const mine: MapFilterState = { speciesId: null, period: 'all', onlyMine: true };
    expect(nextMapFilters(mine, { ...mine, period: 'month' })).toEqual({ speciesId: null, period: 'month', onlyMine: true });
    expect(nextMapFilters(mine, { ...mine, speciesId: 5 })).toEqual({ speciesId: 5, period: 'all', onlyMine: true });
  });

  it('slås den AV mens perioden står på «alle», går kartet tilbake til fellesskapets standard', () => {
    const mine: MapFilterState = { speciesId: null, period: 'all', onlyMine: true };
    expect(nextMapFilters(mine, { ...mine, onlyMine: false })).toEqual(urort);
  });

  it('slås den AV etter at brukeren selv har valgt periode, står valget', () => {
    const mine: MapFilterState = { speciesId: null, period: 'year', onlyMine: true };
    expect(nextMapFilters(mine, { ...mine, onlyMine: false })).toEqual({ speciesId: null, period: 'year', onlyMine: false });
  });

  it('endringer som ikke rører avkrysningen, går urørt gjennom', () => {
    expect(nextMapFilters(urort, { ...urort, period: 'all' })).toEqual({ ...urort, period: 'all' });
    expect(nextMapFilters(urort, { ...urort, speciesId: 9 })).toEqual({ ...urort, speciesId: 9 });
  });
});

describe('activeFilterCount — tallet på filterknappen', () => {
  it('et urørt kart har ingen aktive filtre (standardperioden telte før som ett)', () => {
    expect(activeFilterCount(urort)).toBe(0);
  });

  it('«Kun mine funn» fra lenken teller som ett, ikke to', () => {
    expect(activeFilterCount(initialMapFilters({ startWithOnlyMine: true, speciesId: null }))).toBe(1);
  });

  it('art, avvikende periode og avkrysning teller hver for seg', () => {
    expect(activeFilterCount({ speciesId: 4, period: 'month', onlyMine: false })).toBe(1);
    expect(activeFilterCount({ speciesId: null, period: 'year', onlyMine: false })).toBe(1);
    expect(activeFilterCount({ speciesId: 4, period: 'month', onlyMine: true })).toBe(3);
  });

  it('standardperioden avhenger av modusen', () => {
    expect(defaultPeriodFor(false)).toBe('month');
    expect(defaultPeriodFor(true)).toBe('all');
  });
});
