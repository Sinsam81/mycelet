import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * DEN VIKTIGSTE TESTEN FOR HISTORIKKEN.
 *
 * En historikkrad lagrer forslagene slik de var. Den lagrede JSON-en må ALDRI
 * brukes som fasit for forvekslingsarter eller artsnavn — hydreringen skal
 * kjøre sikkerhetsberikelsen på nytt mot databasen.
 *
 * Hvorfor: vi kuraterer forvekslingsdata løpende (migrasjonene 048/049/050 la
 * data på 14 matsopper). Stolte hydreringen på den frosne JSON-en, ville en
 * rad fra i fjor vist «ingen farlige forvekslingsarter» for en art vi siden har
 * ført en DØDELIG tvilling inn på — og brukeren ville sett den rene skjermen
 * mens de sto med soppen i hånda.
 *
 * Samme mekanikk gjelder språk: frossen JSON ville servert norske artsnavn til
 * en svensk bruker, inkludert navnet på den giftige tvillingen.
 */

let historyRow: Record<string, unknown> | null = null;
let speciesRow: Record<string, unknown> | null = null;
let lookAlikeRows: unknown[] = [];

const KANTARELL = {
  id: 1,
  norwegian_name: 'Kantarell',
  swedish_name: 'Kantarell',
  edibility: 'edible',
  primary_image_url: null,
  season_start: 7,
  season_end: 10,
  peak_season_start: 8,
  peak_season_end: 9
};

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'sv' }));

vi.mock('@/lib/log/request', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: () => logger
  };
  return { createRequestLogger: () => logger };
});

vi.mock('@/lib/supabase/server', () => {
  const table = (name: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      ilike: () => builder,
      in: () => builder,
      limit: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () =>
        Promise.resolve({
          data: name === 'identifications' ? historyRow : name === 'mushroom_species' ? speciesRow : null,
          error: null
        }),
      then: (resolve: (v: unknown) => unknown) => {
        if (name === 'look_alikes') return Promise.resolve({ data: lookAlikeRows, error: null }).then(resolve);
        return Promise.resolve({ data: [], error: null }).then(resolve);
      }
    };
    return builder;
  };
  return {
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'bruker-1' } } }) },
      from: table,
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: { signedUrl: 'https://x/signert' }, error: null })
        })
      }
    })
  };
});

const { GET } = await import('../route');

function request() {
  return new NextRequest('https://mycelet.com/api/identifications/rad-1');
}
const params = Promise.resolve({ id: 'rad-1' });

beforeEach(() => {
  speciesRow = KANTARELL;
  lookAlikeRows = [];
  historyRow = {
    id: 'rad-1',
    created_at: '2025-09-15T10:00:00Z',
    top_suggestion_name: 'Cantharellus cibarius',
    top_probability: 87,
    // Slik raden ble lagret DEN GANGEN: ingen forvekslingsarter, norsk navn.
    suggestions: [
      {
        name: 'Cantharellus cibarius',
        commonNames: ['Kantarell'],
        probability: 87,
        edibility: 'edible',
        description: null,
        taxonomy: null,
        similarImages: ['https://kindwise/1.jpg'],
        speciesId: 1,
        norwegianName: 'Kantarell',
        dangerousLookAlikes: [],
        lookAlikeData: 'none_recorded'
      }
    ],
    safety_data_incomplete: false,
    latitude: 59.9,
    longitude: 10.7,
    image_path: 'bruker-1/rad-1.jpg',
    image_count: 3,
    finding_id: null,
    saved_at: null
  };
});

describe('hydrering fra historikken', () => {
  it('viser en forvekslingsart som ble ført inn ETTER at raden ble lagret', async () => {
    // Raden ble lagret med lookAlikeData: 'none_recorded'. Siden har vi
    // registrert en dødelig tvilling. Den MÅ dukke opp nå.
    lookAlikeRows = [
      {
        species_id: 1,
        danger_level: 'critical',
        similarity_description: 'Lik farge',
        difference_description: 'Skiver mot årer',
        la: {
          id: 99,
          norwegian_name: 'Grønn fluesopp',
          swedish_name: 'Lömsk flugsvamp',
          primary_image_url: null,
          edibility: 'deadly'
        }
      }
    ];

    const res = await GET(request(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.suggestions[0].lookAlikeData).toBe('present');
    expect(body.suggestions[0].dangerousLookAlikes).toHaveLength(1);
  });

  it('løser artsnavnet på LESERENS språk, ikke det som ble frosset', async () => {
    // Locale-mocken er 'sv'. Den lagrede JSON-en sa «Kantarell» (norsk) og
    // ville servert norske navn — inkludert på den giftige tvillingen.
    lookAlikeRows = [
      {
        species_id: 1,
        danger_level: 'critical',
        similarity_description: null,
        difference_description: null,
        la: {
          id: 99,
          norwegian_name: 'Grønn fluesopp',
          swedish_name: 'Lömsk flugsvamp',
          primary_image_url: null,
          edibility: 'deadly'
        }
      }
    ];

    const body = await (await GET(request(), { params })).json();
    expect(body.suggestions[0].dangerousLookAlikes[0].name).toBe('Lömsk flugsvamp');
  });

  it('sesongen gjelder måneden identifiseringen BLE GJORT', async () => {
    // Raden er fra 15. september; kantarellsesongen er juli-oktober. Svaret
    // skal si «i sesong» uansett hvilken måned det er når man ser på den —
    // «i sesong nå» på en gammel rad er svar på et spørsmål ingen stilte.
    const body = await (await GET(request(), { params })).json();
    expect(body.suggestions[0].inSeason).toBe(true);
  });

  it('tar med posisjon, bildelenke og lagringsstatus', async () => {
    const body = await (await GET(request(), { params })).json();
    expect(body.location).toEqual({ latitude: 59.9, longitude: 10.7 });
    expect(body.originalImageDataUrl).toBe('https://x/signert');
    expect(body.savedFindingId).toBeNull();
    expect(body.imageCount).toBe(3);
  });

  it('en rad som ikke finnes gir 404, ikke en tom skjerm', async () => {
    historyRow = null;
    const res = await GET(request(), { params });
    expect(res.status).toBe(404);
  });
});
