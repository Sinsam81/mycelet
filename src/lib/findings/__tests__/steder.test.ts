import { describe, expect, it } from 'vitest';
import { DELING_KARANTENE_TIMER } from '../delingsendring';
import { groupFindings, speciesName, type FindingRow, type StedTekster } from '../steder';

/**
 * Stedene på /mine-steder: funn gruppert på navn eller på en rute på ca. 1 km,
 * med funnene bak hvert sted lagt ved — uten koordinater.
 */

/** Fast klokke — testene skal ikke avhenge av dagens dato. */
const NAA = Date.parse('2026-11-10T12:00:00.000Z');

const TEKSTER: StedTekster = {
  unknownSpecies: 'Ukjent art',
  nearPlace: (lat, lng) => `Sted nær ${lat}, ${lng}`,
  foundDate: (iso) => `dato:${iso.slice(0, 10)}`
};

let teller = 0;
function rad(over: Partial<FindingRow> = {}): FindingRow {
  teller += 1;
  return {
    id: `funn-${teller}`,
    location_name: null,
    latitude: 59.9712,
    longitude: 10.6634,
    found_at: '2026-09-12T10:00:00+00:00',
    image_url: null,
    visibility: 'private',
    is_zone_finding: false,
    zone_label: null,
    zone_precision_km: 5,
    notes: null,
    created_at: '2026-09-12T10:05:00+00:00',
    updated_at: '2026-09-12T10:05:00+00:00',
    species_name_override: null,
    mushroom_species: { norwegian_name: 'Kantarell', swedish_name: 'Kantarell' },
    ...over
  };
}

const grupper = (rader: FindingRow[], locale = 'nb') => groupFindings(rader, TEKSTER, locale, NAA);

describe('groupFindings — hva som er ett sted', () => {
  it('samler funn med samme stedsnavn, uten hensyn til store bokstaver og mellomrom', () => {
    const steder = grupper([
      rad({ location_name: 'Sørkedalen' }),
      rad({ location_name: '  sørkedalen ', latitude: 60.2, longitude: 10.1 }),
      rad({ location_name: 'Nordmarka' })
    ]);
    expect(steder).toHaveLength(2);
    expect(steder[0]).toMatchObject({ label: 'Sørkedalen', count: 2, unnamed: false });
    expect(steder[1]).toMatchObject({ label: 'Nordmarka', count: 1 });
  });

  it('samler funn uten navn i en rute på omtrent én kilometer', () => {
    const steder = grupper([
      rad({ latitude: 59.9712, longitude: 10.6634 }),
      rad({ latitude: 59.9731, longitude: 10.6649 }),
      rad({ latitude: 59.9912, longitude: 10.6634 })
    ]);
    expect(steder).toHaveLength(2);
    expect(steder[0]).toMatchObject({ count: 2, unnamed: true, label: 'Sted nær 59.971, 10.663' });
  });

  it('holder et navngitt og et navnløst funn på samme punkt fra hverandre', () => {
    expect(grupper([rad({ location_name: 'Hytta' }), rad()])).toHaveLength(2);
  });

  it('gir ingen steder når det ikke finnes funn', () => {
    expect(grupper([])).toEqual([]);
  });
});

/**
 * Nøkkelen holder kortet — og lista brukeren har åpnet i det — i live over
 * router.refresh(). Den fulgte før gjennomsnittsposisjonen, som flytter seg
 * hver gang et funn slettes.
 */
describe('groupFindings — stedets nøkkel', () => {
  it('står stille når et funn på stedet slettes, selv om gjennomsnittsposisjonen flytter seg', () => {
    const a = rad({ latitude: 59.9712, longitude: 10.6634 });
    const b = rad({ latitude: 59.9748, longitude: 10.6601 });

    const [foer] = grupper([a, b]);
    const [etter] = grupper([a]);
    expect(etter.key).toBe(foer.key);
    expect(etter.lat).not.toBe(foer.lat);
  });

  it('er lik for samme navn skrevet på to måter, og ulik for to steder', () => {
    const [sted] = grupper([rad({ location_name: 'Sørkedalen' })]);
    const [samme] = grupper([rad({ location_name: ' SØRKEDALEN' })]);
    const [annet] = grupper([rad({ location_name: 'Nordmarka' })]);
    expect(samme.key).toBe(sted.key);
    expect(annet.key).not.toBe(sted.key);
  });

  it('er unik per sted i én og samme liste', () => {
    const steder = grupper([
      rad({ location_name: 'Sørkedalen' }),
      rad({ location_name: 'Nordmarka' }),
      rad(),
      rad({ latitude: 61.1, longitude: 9.4 })
    ]);
    expect(new Set(steder.map((s) => s.key)).size).toBe(steder.length);
  });
});

describe('groupFindings — funnene bak kortet', () => {
  it('legger ved ett funn per rad, i rekkefølgen radene kom', () => {
    const [sted] = grupper([
      rad({ id: 'nyest', found_at: '2026-09-20T10:00:00+00:00', notes: 'Ved bekken' }),
      rad({ id: 'eldst', found_at: '2026-08-03T10:00:00+00:00', visibility: 'approximate' })
    ]);
    expect(sted.finds.map((f) => f.id)).toEqual(['nyest', 'eldst']);
    expect(sted.finds[0]).toMatchObject({ artsnavn: 'Kantarell', datoTekst: 'dato:2026-09-20', deling: 'private', notat: 'Ved bekken' });
    expect(sted.finds[1]).toMatchObject({ datoTekst: 'dato:2026-08-03', deling: 'approximate' });
  });

  /** Lista under et sted trenger ikke posisjonen — og det som ikke sendes, kan ikke lekke. */
  it('gir funnene ingen koordinater', () => {
    const [sted] = grupper([rad({ latitude: 59.9712, longitude: 10.6634 })]);
    expect(JSON.stringify(sted.finds)).not.toMatch(/59\.97|10\.66/);
    expect(Object.keys(sted.finds[0]).join(' ')).not.toMatch(/lat|lng|lon/i);
  });

  it('sier når et nylig endret funn tidligst kan deles åpnere', () => {
    const endret = new Date(NAA - 2 * 60 * 60 * 1000).toISOString();
    const [sted] = grupper([rad({ updated_at: endret }), rad()]);
    expect(sted.finds[0].aapnesTidligst).toBe(
      new Date(Date.parse(endret) + DELING_KARANTENE_TIMER * 60 * 60 * 1000).toISOString()
    );
    expect(sted.finds[1].aapnesTidligst).toBeNull();
  });
});

describe('groupFindings — det kortet viser', () => {
  it('teller arter på leserens språk', () => {
    const rader = [
      rad({ mushroom_species: { norwegian_name: 'Steinsopp', swedish_name: 'Karljohan' } }),
      rad({ mushroom_species: { norwegian_name: 'Steinsopp', swedish_name: 'Karljohan' } }),
      rad()
    ];
    expect([...grupper(rader)[0].species]).toEqual([
      ['Steinsopp', 2],
      ['Kantarell', 1]
    ]);
    expect([...grupper(rader, 'sv')[0].species.keys()]).toEqual(['Karljohan', 'Kantarell']);
    expect(grupper(rader, 'sv')[0].finds[0].artsnavn).toBe('Karljohan');
  });

  it('faller tilbake på brukerens eget artsnavn, og så på «ukjent art»', () => {
    const [sted] = grupper([
      rad({ mushroom_species: null, species_name_override: 'Rødgul piggsopp?' }),
      rad({ mushroom_species: null })
    ]);
    expect(sted.finds.map((f) => f.artsnavn)).toEqual(['Rødgul piggsopp?', 'Ukjent art']);
  });

  it('merker stedet som hemmelig bare når ALLE funnene er private', () => {
    expect(grupper([rad(), rad()])[0].allPrivate).toBe(true);
    expect(grupper([rad(), rad({ visibility: 'approximate' })])[0].allPrivate).toBe(false);
    expect(grupper([rad({ visibility: 'public' })])[0].allPrivate).toBe(false);
  });

  it('finner siste besøk, sesongene og det første bildet', () => {
    const [sted] = grupper([
      rad({ found_at: '2025-08-30T10:00:00+00:00' }),
      rad({ found_at: '2026-09-12T10:00:00+00:00', image_url: 'https://example.com/a.jpg' }),
      rad({ found_at: '2026-07-01T10:00:00+00:00', image_url: 'https://example.com/b.jpg' })
    ]);
    expect(sted.lastVisit).toBe('2026-09-12T10:00:00+00:00');
    expect([...sted.years].sort()).toEqual([2025, 2026]);
    expect(sted.thumb).toBe('https://example.com/a.jpg');
  });

  it('legger stedet midt mellom funnene', () => {
    const [sted] = grupper([
      rad({ location_name: 'Hytta', latitude: 60, longitude: 10 }),
      rad({ location_name: 'Hytta', latitude: 60.002, longitude: 10.004 })
    ]);
    expect(sted.lat).toBeCloseTo(60.001, 6);
    expect(sted.lng).toBeCloseTo(10.002, 6);
  });

  it('sorterer stedene på flest funn, og så på siste besøk', () => {
    const steder = grupper([
      rad({ location_name: 'Ett funn, nylig', found_at: '2026-10-01T10:00:00+00:00' }),
      rad({ location_name: 'To funn' }),
      rad({ location_name: 'To funn' }),
      rad({ location_name: 'Ett funn, gammelt', found_at: '2025-08-01T10:00:00+00:00' })
    ]);
    expect(steder.map((s) => s.label)).toEqual(['To funn', 'Ett funn, nylig', 'Ett funn, gammelt']);
  });
});

describe('speciesName', () => {
  it('tar også en art som kommer som en liste fra spørringen', () => {
    expect(
      speciesName(
        { mushroom_species: [{ norwegian_name: 'Traktkantarell', swedish_name: 'Trattkantarell' }], species_name_override: null },
        'Ukjent art',
        'sv'
      )
    ).toBe('Trattkantarell');
  });
});
