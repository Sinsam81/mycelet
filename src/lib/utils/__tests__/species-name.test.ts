import { describe, expect, it } from 'vitest';
import { compareSpeciesByDisplayName, getJoinedSpeciesName, getSpeciesDisplayName } from '@/lib/utils/species-name';

describe('getSpeciesDisplayName', () => {
  it('uses the curated Swedish name for the Swedish locale', () => {
    expect(
      getSpeciesDisplayName({ norwegian_name: 'Hvit fluesopp', swedish_name: 'Vit flugsvamp' }, 'sv')
    ).toBe('Vit flugsvamp');
  });

  it('falls back to Norwegian when a Swedish name is missing', () => {
    expect(getSpeciesDisplayName({ norwegian_name: 'Kantarell', swedish_name: null }, 'sv')).toBe('Kantarell');
  });

  it('keeps Norwegian as the primary name in Norwegian', () => {
    expect(
      getSpeciesDisplayName({ norwegian_name: 'Hvit fluesopp', swedish_name: 'Vit flugsvamp' }, 'nb')
    ).toBe('Hvit fluesopp');
  });
});

describe('compareSpeciesByDisplayName', () => {
  it('sorts by the visible localized name', () => {
    const rows = [
      { norwegian_name: 'Rød fluesopp', swedish_name: 'Röd flugsvamp' },
      { norwegian_name: 'Hvit fluesopp', swedish_name: 'Vit flugsvamp' }
    ];

    expect([...rows].sort((a, b) => compareSpeciesByDisplayName(a, b, 'sv'))[0]?.swedish_name).toBe(
      'Röd flugsvamp'
    );
  });
});

describe('getJoinedSpeciesName — artsnavn fra en Supabase-join', () => {
  // Feilen den finnes for: forum, profil og Mine steder leste `norwegian_name`
  // rått fra relasjonen, så svenske brukere så norske artsnavn på tre av
  // appens mest brukte flater. Hvert kallsted måtte ellers håndtert at
  // PostgREST returnerer relasjonen som objekt, som array eller som null.
  const kantarell = { norwegian_name: 'Steinsopp', swedish_name: 'Karljohanssvamp' };

  it('objekt-form', () => {
    expect(getJoinedSpeciesName(kantarell, 'sv')).toBe('Karljohanssvamp');
  });

  it('array-form — PostgREST gir denne når joinet skrives litt annerledes', () => {
    expect(getJoinedSpeciesName([kantarell], 'sv')).toBe('Karljohanssvamp');
  });

  it('norsk leser får norsk', () => {
    expect(getJoinedSpeciesName(kantarell, 'nb')).toBe('Steinsopp');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['tom array', []]
  ])('%s gir TOM streng, ikke en fallback-tekst', (_navn, input) => {
    // Tom streng er med vilje: kallstedet skal kunne falle videre på
    // species_name_override — brukerens eget navn på funnet — før det lander
    // på «ukjent art».
    expect(getJoinedSpeciesName(input as never, 'sv')).toBe('');
  });

  it('faller tilbake til norsk når svensk navn mangler', () => {
    expect(getJoinedSpeciesName({ norwegian_name: 'Rødskrubb', swedish_name: null }, 'sv')).toBe('Rødskrubb');
  });

  it('tåler en rad uten navn i det hele tatt', () => {
    expect(getJoinedSpeciesName({}, 'sv')).toBe('');
  });

  it('lar species_name_override vinne når arten mangler — mønsteret kallstedene bruker', () => {
    const navn = getJoinedSpeciesName(null, 'sv') || 'Min egen sopp' || 'Ukjent art';
    expect(navn).toBe('Min egen sopp');
  });
});
