import { afterEach, describe, expect, it, vi } from 'vitest';
import { hentKobledeFunn, KOBLET_FUNN_KOLONNER } from '../koblede-funn';
import { getJoinedSpeciesName } from '@/lib/utils/species-name';

/**
 * Koblet funn skal leses gjennom maskeringslaget (public_findings), aldri fra
 * `findings` — den tabellen er eier-lesbar, så embedet ga null til alle andre
 * enn forfatteren — og aldri med koordinater eller fritekst.
 */

interface Kall {
  table: string;
  columns: string;
  ids: unknown[];
}

function falskKlient(svar: Record<string, { data?: unknown[]; error?: { message: string } | null }>) {
  const kall: Kall[] = [];
  const klient = {
    from: (table: string) => ({
      select: (columns: string) => ({
        in: async (_kolonne: string, ids: unknown[]) => {
          kall.push({ table, columns, ids });
          const res = svar[table] ?? { data: [] };
          return { data: res.data ?? null, error: res.error ?? null };
        }
      })
    })
  };
  return { klient: klient as never, kall };
}

const funnRad = {
  id: 'f1',
  species_id: 7,
  norwegian_name: 'Kantarell',
  is_zone_finding: true,
  zone_label: 'Nordmarka',
  zone_precision_km: 5
};

afterEach(() => vi.restoreAllMocks());

describe('hentKobledeFunn', () => {
  it('gjør ingen kall når ingen innlegg har et koblet funn', async () => {
    const { klient, kall } = falskKlient({});
    const ut = await hentKobledeFunn(klient, [{ id: 'p1', finding_id: null }, { id: 'p2' }]);
    expect(kall).toHaveLength(0);
    expect(ut).toEqual([
      { id: 'p1', finding_id: null, finding: null },
      { id: 'p2', finding: null }
    ]);
  });

  it('leser public_findings, aldri findings, og aldri koordinater eller fritekst', async () => {
    const { klient, kall } = falskKlient({
      public_findings: { data: [funnRad] },
      mushroom_species: { data: [{ id: 7, norwegian_name: 'Kantarell', swedish_name: 'Kantarell' }] }
    });
    await hentKobledeFunn(klient, [{ id: 'p1', finding_id: 'f1' }]);

    expect(kall.map((k) => k.table)).toEqual(['public_findings', 'mushroom_species']);
    expect(kall.some((k) => k.table === 'findings')).toBe(false);
    for (const forbudt of ['latitude', 'longitude', 'display_lat', 'display_lng', 'notes', 'location_name', 'user_id', 'username']) {
      expect(KOBLET_FUNN_KOLONNER).not.toContain(forbudt);
      expect(kall[0].columns).not.toContain(forbudt);
    }
  });

  it('bygger samme form som det gamle embedet, så kortene er uendret', async () => {
    const { klient } = falskKlient({
      public_findings: { data: [funnRad] },
      mushroom_species: { data: [{ id: 7, norwegian_name: 'Kantarell', swedish_name: 'Gul kantarell' }] }
    });
    const [post] = await hentKobledeFunn(klient, [{ id: 'p1', finding_id: 'f1' }]);
    expect(post.finding).toEqual({
      id: 'f1',
      species_id: 7,
      species_name_override: null,
      is_zone_finding: true,
      zone_label: 'Nordmarka',
      zone_precision_km: 5,
      mushroom_species: { norwegian_name: 'Kantarell', swedish_name: 'Gul kantarell' }
    });
  });

  it('gir svensk artsnavn til svenske lesere', async () => {
    const { klient } = falskKlient({
      public_findings: { data: [{ ...funnRad, norwegian_name: 'Steinsopp' }] },
      mushroom_species: { data: [{ id: 7, norwegian_name: 'Steinsopp', swedish_name: 'Karljohan' }] }
    });
    const [post] = await hentKobledeFunn(klient, [{ id: 'p1', finding_id: 'f1' }]);
    expect(getJoinedSpeciesName(post.finding?.mushroom_species, 'sv')).toBe('Karljohan');
    expect(getJoinedSpeciesName(post.finding?.mushroom_species, 'nb')).toBe('Steinsopp');
  });

  it('spør én gang om hvert funn og hver art, også når flere innlegg deler dem', async () => {
    const { klient, kall } = falskKlient({
      public_findings: { data: [funnRad, { ...funnRad, id: 'f2' }] },
      mushroom_species: { data: [] }
    });
    await hentKobledeFunn(klient, [
      { id: 'p1', finding_id: 'f1' },
      { id: 'p2', finding_id: 'f1' },
      { id: 'p3', finding_id: 'f2' }
    ]);
    expect(kall[0].ids).toEqual(['f1', 'f2']);
    expect(kall[1].ids).toEqual([7]);
  });

  it('et privat eller slettet funn (ikke i viewet) gir ingen kobling', async () => {
    const { klient } = falskKlient({ public_findings: { data: [] } });
    const [post] = await hentKobledeFunn(klient, [{ id: 'p1', finding_id: 'privat' }]);
    expect(post.finding).toBeNull();
  });

  it('funn uten art fra artslista får ingen art — fritekstnavnet hentes ikke', async () => {
    const { klient, kall } = falskKlient({
      public_findings: { data: [{ ...funnRad, species_id: null, norwegian_name: null }] }
    });
    const [post] = await hentKobledeFunn(klient, [{ id: 'p1', finding_id: 'f1' }]);
    expect(post.finding?.mushroom_species).toBeNull();
    expect(post.finding?.species_name_override).toBeNull();
    expect(kall).toHaveLength(1);
  });

  it('faller tilbake på det norske navnet fra viewet når artsoppslaget feiler', async () => {
    const { klient } = falskKlient({
      public_findings: { data: [funnRad] },
      mushroom_species: { error: { message: 'nede' } }
    });
    const [post] = await hentKobledeFunn(klient, [{ id: 'p1', finding_id: 'f1' }]);
    expect(post.finding?.mushroom_species).toEqual({ norwegian_name: 'Kantarell', swedish_name: null });
  });

  it('feiler viewet, vises innleggene uten funnlinje i stedet for at lista dør', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { klient } = falskKlient({ public_findings: { error: { message: 'permission denied' } } });
    const ut = await hentKobledeFunn(klient, [{ id: 'p1', finding_id: 'f1' }]);
    expect(ut).toEqual([{ id: 'p1', finding_id: 'f1', finding: null }]);
    expect(warn).toHaveBeenCalled();
  });
});
