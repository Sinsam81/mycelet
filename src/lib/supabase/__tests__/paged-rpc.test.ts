import { describe, it, expect } from 'vitest';
import { fetchRpcPaged, POSTGREST_MAX_ROWS } from '../paged-rpc';
import type { PagedRpcClient } from '../paged-rpc';

/**
 * En falsk PostgREST som oppfører seg som den ekte gjør i produksjon:
 *
 *   • `.range(from, to)` blir til offset/limit i URL-en og virker som ventet,
 *   • MEN hvert svar kuttes hardt ved db-max-rows (1000 rader),
 *   • og funksjonens egen p_limit gjelder FØR taket.
 *
 * Det er nettopp denne kombinasjonen som gjorde at `p_limit: 3000` stille
 * returnerte 1000 rader.
 */
function fakePostgrest(table: Row[], opts: { maxRows?: number } = {}) {
  const maxRows = opts.maxRows ?? POSTGREST_MAX_ROWS;
  const calls: { from: number; to: number }[] = [];

  const client: PagedRpcClient = {
    rpc(_fn: string, args: Record<string, unknown> = {}) {
      const pLimit = typeof args.p_limit === 'number' ? args.p_limit : table.length;
      // Funksjonskroppen: LIMIT p_limit, ingen ORDER BY → tabellrekkefølge.
      const body = table.slice(0, pLimit);
      return {
        range(from: number, to: number) {
          calls.push({ from, to });
          const requested = body.slice(from, to + 1);
          // Taket. Dette er hele problemet.
          return Promise.resolve({ data: requested.slice(0, maxRows), error: null });
        }
      };
    }
  };

  return { client, calls };
}

interface Row {
  latitude: number;
  longitude: number;
  species_id: number;
}

/**
 * Bygger en tabell som ligner produksjonsdataene: GBIF-importen la radene inn
 * artsvis, så de første tusen radene tilhører nesten bare én art.
 */
function speciesGroupedTable(perSpecies: number, speciesCount: number): Row[] {
  const rows: Row[] = [];
  for (let s = 1; s <= speciesCount; s++) {
    for (let i = 0; i < perSpecies; i++) {
      rows.push({ latitude: 59 + i / 100000, longitude: 10 + i / 100000, species_id: s });
    }
  }
  return rows;
}

describe('fetchRpcPaged', () => {
  it('henter forbi 1000-taket når kallstedet har bedt om mer', async () => {
    const table = speciesGroupedTable(1200, 5); // 6000 rader
    const { client } = fakePostgrest(table);

    const res = await fetchRpcPaged<Row>(
      client,
      'get_occurrences_in_bounds',
      { p_limit: 3000 },
      { limit: 3000 }
    );

    expect(res.error).toBeNull();
    // Uten paginering ville dette vært 1000 — det var feilen.
    expect(res.rows).toHaveLength(3000);
    expect(res.truncated).toBe(true);
  });

  it('mister ikke artsmangfoldet slik det avkortede kallet gjorde', async () => {
    // 1200 rader per art betyr at de første 1000 radene er ÉN art. Det er
    // nøyaktig det produksjonsmålingen viste: «hele NO+SE → 2 arter av ~70».
    const table = speciesGroupedTable(1200, 5);
    const { client } = fakePostgrest(table);

    const res = await fetchRpcPaged<Row>(
      client,
      'get_occurrences_in_bounds',
      { p_limit: 3000 },
      { limit: 3000 }
    );

    const species = new Set(res.rows.map((r) => r.species_id));
    // Det gamle ett-kalls-svaret inneholdt bare art 1.
    expect(species.size).toBeGreaterThan(2);
    expect(species).toContain(3);
  });

  it('sier fra når svaret er et utvalg, og når det er komplett', async () => {
    const dense = fakePostgrest(speciesGroupedTable(1000, 6)); // 6000 rader
    const denseRes = await fetchRpcPaged<Row>(
      dense.client,
      'get_occurrences_in_bounds',
      { p_limit: 3000 },
      { limit: 3000 }
    );
    expect(denseRes.truncated).toBe(true);

    const sparse = fakePostgrest(speciesGroupedTable(60, 4)); // 240 rader
    const sparseRes = await fetchRpcPaged<Row>(
      sparse.client,
      'get_occurrences_in_bounds',
      { p_limit: 3000 },
      { limit: 3000 }
    );
    expect(sparseRes.rows).toHaveLength(240);
    expect(sparseRes.truncated).toBe(false);
  });

  it('bruker bare ett kall når området er tynt', async () => {
    const { client, calls } = fakePostgrest(speciesGroupedTable(50, 4)); // 200 rader
    await fetchRpcPaged<Row>(client, 'get_occurrences_in_bounds', { p_limit: 3000 }, { limit: 3000 });
    expect(calls).toHaveLength(1);
  });

  it('henter akkurat så mange sider som budsjettet krever', async () => {
    const { client, calls } = fakePostgrest(speciesGroupedTable(1000, 8)); // 8000 rader
    const res = await fetchRpcPaged<Row>(
      client,
      'get_occurrences_in_bounds',
      { p_limit: 4000 },
      { limit: 4000 }
    );
    expect(res.rows).toHaveLength(4000);
    expect(calls).toHaveLength(4);
    expect(calls[3]).toEqual({ from: 3000, to: 3999 });
  });

  it('respekterer funksjonens egen p_limit uten å påstå at det finnes mer', async () => {
    // p_limit 3000 mot en tabell på 8000: funksjonen gir 3000, vi henter 3000.
    const { client } = fakePostgrest(speciesGroupedTable(1000, 8));
    const res = await fetchRpcPaged<Row>(
      client,
      'get_occurrences_in_bounds',
      { p_limit: 3000 },
      { limit: 3000 }
    );
    expect(res.rows).toHaveLength(3000);
    expect(res.truncated).toBe(true);
  });

  it('gir feilen videre i stedet for et halvt datasett', async () => {
    const failing: PagedRpcClient = {
      rpc() {
        return {
          range: () => Promise.resolve({ data: null, error: { message: 'boom' } })
        };
      }
    };
    const res = await fetchRpcPaged<Row>(failing, 'get_occurrences_in_bounds', {}, { limit: 3000 });
    expect(res.error).toEqual({ message: 'boom' });
    expect(res.rows).toEqual([]);
    // Et tomt resultat som skyldes feil skal ikke se ut som «komplett og tomt»
    // for kallstedet — derfor er error satt, og den MÅ sjekkes.
    expect(res.truncated).toBe(false);
  });

  it('feiler synlig når en senere side feiler', async () => {
    let n = 0;
    const flaky: PagedRpcClient = {
      rpc() {
        return {
          range: () => {
            n += 1;
            if (n === 1) {
              return Promise.resolve({
                data: speciesGroupedTable(1000, 1),
                error: null
              });
            }
            return Promise.resolve({ data: null, error: { message: 'side 2 feilet' } });
          }
        };
      }
    };
    const res = await fetchRpcPaged<Row>(flaky, 'get_occurrences_in_bounds', {}, { limit: 3000 });
    expect(res.error).toEqual({ message: 'side 2 feilet' });
    expect(res.rows).toEqual([]);
  });
});
