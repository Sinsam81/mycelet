import { describe, expect, it } from 'vitest';
import { filtrerArtsliste, type ArtslisteFiltre } from '@/lib/species/artsliste';
import { baseSeasonMask, isMonthInMask } from '@/lib/utils/season-region';
import { compareSpeciesByDisplayName } from '@/lib/utils/species-name';
import { ARTSKATALOG } from './artskatalog-fixture';

/**
 * Filtrene i artsbiblioteket, på hele den ekte katalogen. Måneden sendes inn,
 * så ingen av testene avhenger av dagens dato.
 */

const INGEN: ArtslisteFiltre = { query: '', edibility: 'all', inSeasonNow: false, habitat: '' };
const SEPTEMBER = 9;

const navn = (filtre: Partial<ArtslisteFiltre>, maaned = SEPTEMBER, locale = 'nb') =>
  filtrerArtsliste(ARTSKATALOG, { ...INGEN, ...filtre }, locale, maaned).map((art) =>
    locale === 'sv' ? art.swedish_name : art.norwegian_name
  );

describe('uten filtre', () => {
  it('gir hele katalogen, sortert etter navnet leseren ser', () => {
    for (const locale of ['nb', 'sv']) {
      const alle = filtrerArtsliste(ARTSKATALOG, INGEN, locale, SEPTEMBER);
      expect(alle).toEqual([...ARTSKATALOG].sort((a, b) => compareSpeciesByDisplayName(a, b, locale)));
    }
  });
});

describe('spiselighet', () => {
  it('«dødelig» gir de seks dødelige artene og ingen andre', () => {
    expect(navn({ edibility: 'deadly' })).toEqual([
      'Butt giftslørsopp',
      'Flatklokkehatt',
      'Grønn fluesopp',
      'Hvit fluesopp',
      'Sandmorkel',
      'Spiss giftslørsopp'
    ]);
  });

  it('hver verdi i nedtrekkslista gir bare arter med den verdien', () => {
    for (const edibility of ['edible', 'conditionally_edible', 'inedible', 'toxic', 'deadly'] as const) {
      const treff = filtrerArtsliste(ARTSKATALOG, { ...INGEN, edibility }, 'nb', SEPTEMBER);
      expect(treff.length, edibility).toBeGreaterThan(0);
      expect(treff.every((art) => art.edibility === edibility), edibility).toBe(true);
    }
  });
});

describe('«kun i sesong nå»', () => {
  it('følger måneden som sendes inn — desember er de fire vinterartene', () => {
    expect(navn({ inSeasonNow: true }, 12)).toEqual(['Blå ridderhatt', 'Judasøre', 'Vintersopp', 'Østerssopp']);
  });

  it('bruker samme vindu som kalenderen (baseSeasonMask), for alle tolv måneder', () => {
    for (let maaned = 1; maaned <= 12; maaned++) {
      const iBiblioteket = filtrerArtsliste(ARTSKATALOG, { ...INGEN, inSeasonNow: true }, 'nb', maaned);
      const iKalenderen = ARTSKATALOG.filter((art) => isMonthInMask(baseSeasonMask(art), maaned));
      expect(new Set(iBiblioteket), `måned ${maaned}`).toEqual(new Set(iKalenderen));
    }
  });

  it('piggsopp er med i august — katalogmånedene alene (sep–nov) ville utelatt den', () => {
    expect(navn({ inSeasonNow: true }, 8)).toContain('Piggsopp');
  });

  it('en måned som ikke finnes gir ingen arter, ikke alle', () => {
    expect(navn({ inSeasonNow: true }, Number.NaN)).toEqual([]);
    expect(navn({ inSeasonNow: true }, 13)).toEqual([]);
  });

  it('avslått filter bryr seg ikke om måneden', () => {
    expect(navn({}, Number.NaN)).toHaveLength(ARTSKATALOG.length);
  });
});

describe('habitat', () => {
  it('svensk skrivemåte treffer de norske verdiene i basen', () => {
    const norsk = navn({ habitat: 'barskog' });
    expect(norsk.length).toBeGreaterThan(20);
    expect(navn({ habitat: 'barrskog' })).toEqual(norsk);
  });
});

describe('filtre sammen', () => {
  it('søk innenfor en spiselighetsklasse', () => {
    expect(navn({ query: 'fluesopp', edibility: 'deadly' })).toEqual(['Grønn fluesopp', 'Hvit fluesopp']);
  });

  it('søkets rangering overlever de andre filtrene', () => {
    // Uten spiselighetsfilteret ligger Falsk kantarell (uspiselig) mellom disse.
    expect(navn({ query: 'kantarell', edibility: 'edible' })).toEqual(['Kantarell', 'Blek kantarell', 'Traktkantarell']);
  });

  it('søk på svensk navn fra norsk side, avgrenset til sesongen', () => {
    // «Murkla» er morkel på svensk. I april er alle fire i sesong, i september ingen.
    expect(navn({ query: 'murkla', inSeasonNow: true }, 4)).toEqual([
      'Sandmorkel',
      'Spiss morkel',
      'Stankmorkel',
      'Vanlig morkel'
    ]);
    expect(navn({ query: 'murkla', inSeasonNow: true }, 9)).toEqual([]);
  });

  it('flertallsformen virker sammen med de andre filtrene', () => {
    expect(navn({ query: 'fluesopper', edibility: 'deadly' })).toEqual(['Grønn fluesopp', 'Hvit fluesopp']);
    expect(navn({ query: 'kantareller', edibility: 'edible' })).toEqual(['Kantarell', 'Blek kantarell', 'Traktkantarell']);
  });

  it('«morkler» finner morklene i april — og sandmorkel er den dødelige av dem', () => {
    // Flertallsformen mister e-en («morkel» → «morkler») og ga null treff i
    // biblioteket, nettopp i månedene kalenderen peker dit for morkler.
    expect(navn({ query: 'morkler', inSeasonNow: true }, 4)).toEqual([
      'Spiss morkel',
      'Vanlig morkel',
      'Sandmorkel',
      'Stankmorkel'
    ]);
    expect(navn({ query: 'morklene', edibility: 'deadly' }, 4)).toEqual(['Sandmorkel']);
    expect(navn({ query: 'morkler', inSeasonNow: true }, 9)).toEqual([]);
  });

  it('hva søket betyr avhenger ikke av de andre filtrene', () => {
    // «riska» treffer seks arter som det står. Ingen av dem er dødelige, og da
    // er svaret tomt — søket skal ikke prøves på nytt som «risk» bare fordi
    // filteret tok treffene.
    expect(navn({ query: 'riska' })).toHaveLength(6);
    expect(navn({ query: 'riska', edibility: 'deadly' })).toEqual([]);
    for (const edibility of ['edible', 'conditionally_edible', 'inedible', 'toxic', 'deadly'] as const) {
      for (const query of ['kantareller', 'fluesoppene', 'murklor', 'morkler', 'kremler', 'sopp', 'gift']) {
        const alene = filtrerArtsliste(ARTSKATALOG, { ...INGEN, query }, 'nb', SEPTEMBER);
        const medFilter = filtrerArtsliste(ARTSKATALOG, { ...INGEN, query, edibility }, 'nb', SEPTEMBER);
        expect(medFilter, `${query} + ${edibility}`).toEqual(alene.filter((art) => art.edibility === edibility));
      }
    }
  });

  it('svensk leser får svensk rekkefølge', () => {
    expect(navn({ query: 'flugsvamp', edibility: 'toxic' }, SEPTEMBER, 'sv')).toEqual([
      'Brun flugsvamp',
      'Röd flugsvamp',
      'Panterflugsvamp'
    ]);
  });
});
