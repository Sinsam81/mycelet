import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { visArtslinje, type SoppforholdRegion } from '@/app/soppforhold/hent-regioner';

/**
 * `leadingInSeason` avgjør om /soppforhold får skrive «særlig piggsopp som er i
 * sesong her nå» (visArtslinje). Feltet ble først regnet på katalogmånedene
 * alene (`season_start`/`season_end`), som season-region.ts selv dokumenterer
 * som for smale — og som rasteret ikke bruker fra april til november, da det
 * scorer på fenologikurven.
 *
 * Følgen, slik den så ut i slutten av august: Bergen på 85 med piggsopp på
 * topp (katalog sep–nov, kalendervindu jul–nov) fikk `leadingInSeason: false`.
 * Samlesiden falt tilbake til innledningen uten art, og områdesiden droppet
 * artssetningen rett over dommen «Nå er det piggsopp 🍄».
 *
 * Testen går gjennom HELE ruta, ikke bare hjelperen: feltet er verdiløst hvis
 * ruta ikke ber om kolonnene, eller regner på dagens måned i stedet for
 * rasterdatoens.
 */

/** Ekte rader: id-ene matcher season-window-data.ts, månedene er migrasjon 009. */
const ARTER: Array<Record<string, unknown> & { id: number }> = [
  { id: 1, norwegian_name: 'Kantarell', swedish_name: 'Kantarell', edibility: 'edible', season_start: 7, season_end: 9 },
  { id: 4, norwegian_name: 'Svart trompetsopp', swedish_name: 'Svart trumpetsvamp', edibility: 'edible', season_start: 9, season_end: 10 },
  { id: 7, norwegian_name: 'Piggsopp', swedish_name: 'Blek taggsvamp', edibility: 'edible', season_start: 9, season_end: 11 }
];

interface Flis {
  score: number;
  species_id: number | null;
  center_lat: number;
  center_lng: number;
  metadata: { region: string };
}

let rasterdato = '2026-08-20';
let fliser: Flis[] = [];

/** Én rute i Bergen med `ledende` på topp, og en svakere rute ved siden av. */
function bergen(ledende: number, score: number): Flis[] {
  return [
    { score, species_id: ledende, center_lat: 60.3, center_lng: 5.2, metadata: { region: 'Bergen' } },
    // Samme rute, svakere art: skal kollapses bort, ikke bli «ledende».
    { score: score - 20, species_id: 1, center_lat: 60.3, center_lng: 5.2, metadata: { region: 'Bergen' } },
    { score: score - 30, species_id: 1, center_lat: 60.37, center_lng: 5.27, metadata: { region: 'Bergen' } }
  ];
}

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: { tile_date: rasterdato }, error: null }),
        range: async () => ({ data: fliser, error: null })
      };
      return builder;
    }
  })
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => {
      let kolonner: string[] = [];
      const builder = {
        select: (liste: string) => {
          kolonner = liste.split(',').map((k) => k.trim());
          return builder;
        },
        // PostgREST svarer bare med kolonnene det ble bedt om. Speiles her, så
        // en rute som glemmer å be om sesongmånedene får `undefined` — ikke en
        // test som består på data ruta aldri ville fått.
        in: async (_kolonne: string, ider: number[]) => ({
          data: ARTER.filter((a) => ider.includes(a.id)).map((a) =>
            Object.fromEntries(kolonner.map((k) => [k, a[k]]))
          ),
          error: null
        })
      };
      return builder;
    }
  })
}));

const { GET } = await import('../route');

let n = 0;
async function hentBergen(): Promise<SoppforholdRegion> {
  n += 1;
  const res = await GET(
    new NextRequest('https://mycelet.com/api/prediction/regions', {
      headers: { 'x-forwarded-for': `10.9.0.${n}` }
    })
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { tileDate: string; regions: SoppforholdRegion[] };
  expect(body.tileDate).toBe(rasterdato);
  const region = body.regions.find((r) => r.name === 'Bergen');
  if (!region) throw new Error('Bergen mangler i svaret');
  return region;
}

beforeEach(() => {
  rasterdato = '2026-08-20';
  fliser = bergen(7, 85);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('leadingInSeason i /api/prediction/regions', () => {
  it('piggsopp på topp i august er i sesong — katalogen sier sep–nov, kalenderen jul–nov', async () => {
    const region = await hentBergen();
    expect(region).toMatchObject({ score: 85, leadingSpecies: 'Piggsopp', leadingInSeason: true });
    // Dommen navngir arten; da kan ikke feltet ved siden av si «utenfor sesong».
    expect(region.verdict).toBe('Nå er det piggsopp 🍄');
    // …og siden får skrive artssetningen.
    expect(visArtslinje(region)).toBe(true);
  });

  it('svart trompetsopp i august og kantarell i juni og oktober er også i sesong', async () => {
    fliser = bergen(4, 82);
    expect((await hentBergen()).leadingInSeason).toBe(true);

    fliser = bergen(1, 75);
    rasterdato = '2026-06-20';
    expect((await hentBergen()).leadingInSeason).toBe(true);
    rasterdato = '2026-10-10';
    expect((await hentBergen()).leadingInSeason).toBe(true);
  });

  it('kantarell på topp i januar er utenfor sesong, og artssetningen forsvinner', async () => {
    rasterdato = '2027-01-15';
    fliser = bergen(1, 70);
    const region = await hentBergen();
    expect(region).toMatchObject({ leadingSpecies: 'Kantarell', leadingInSeason: false });
    expect(visArtslinje(region)).toBe(false);
  });

  it('bruker rasterdatoens måned, ikke dagens', async () => {
    // Klokka står i januar; rasteret er fra august (vinduet før nattens cron,
    // eller en kjøring som har stått). Feltet skal følge tallene det står ved.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-01-15T11:00:00Z'));
    expect((await hentBergen()).leadingInSeason).toBe(true);

    // Og motsatt: august på klokka, januar i rasteret.
    vi.setSystemTime(new Date('2026-08-20T11:00:00Z'));
    rasterdato = '2027-01-15';
    fliser = bergen(1, 70);
    expect((await hentBergen()).leadingInSeason).toBe(false);
  });

  it('er ukjent (null), ikke «utenfor», når arten mangler i basen', async () => {
    fliser = bergen(999, 85);
    const region = await hentBergen();
    expect(region.leadingSpecies).toBeNull();
    expect(region.leadingInSeason).toBeNull();
  });
});
