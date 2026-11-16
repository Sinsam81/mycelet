import { describe, expect, it } from 'vitest';
import { AAPNE_RAPPORTSTATUSER } from '@/lib/moderation/moderering';
import { hentAapneRapporter } from '../aapne-rapporter';

/**
 * Tallet dagsrapporten og /admin viser for «åpne rapporter». Tre ting må
 * holde: samme regel for «åpen» som moderasjonskonsollen, aldri en gjettet
 * null når spørringen ikke svarte, og ingenting annet enn tidsstempelet lest
 * ut av tabellen (ikke hva som er meldt, ikke hvem som meldte).
 */

interface Kall {
  metode: string;
  args: unknown[];
}

type Svar = { data: unknown; count: number | null; error: { code?: string; message?: string } | null };

function db(svar: Svar | (() => never)) {
  const kall: Kall[] = [];
  const tabeller: string[] = [];
  const bygger: Record<string, unknown> = {};
  for (const metode of ['select', 'in', 'order', 'limit']) {
    bygger[metode] = (...args: unknown[]) => {
      kall.push({ metode, args });
      return bygger;
    };
  }
  bygger.then = (resolve: (v: Svar) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve()
      .then(() => (typeof svar === 'function' ? svar() : svar))
      .then(resolve, reject);
  return {
    kall,
    tabeller,
    klient: {
      from(tabell: string) {
        tabeller.push(tabell);
        return bygger;
      }
    } as never
  };
}

describe('hentAapneRapporter', () => {
  it('svarer med antallet og tidsstempelet til den eldste', async () => {
    const d = db({ data: [{ created_at: '2026-09-01T06:30:00Z' }], count: 3, error: null });
    expect(await hentAapneRapporter(d.klient)).toEqual({
      ok: true,
      aapne: { antall: 3, eldsteOpprettet: '2026-09-01T06:30:00Z' }
    });
  });

  it('bruker konsollens regel for «åpen» (pending og reviewed), eldste først, én rad', async () => {
    const d = db({ data: [], count: 0, error: null });
    await hentAapneRapporter(d.klient);
    expect(d.tabeller).toEqual(['reports']);
    expect(d.kall.find((k) => k.metode === 'in')?.args).toEqual(['status', [...AAPNE_RAPPORTSTATUSER]]);
    expect([...AAPNE_RAPPORTSTATUSER]).toEqual(['pending', 'reviewed']);
    expect(d.kall.find((k) => k.metode === 'order')?.args).toEqual(['created_at', { ascending: true }]);
    expect(d.kall.find((k) => k.metode === 'limit')?.args).toEqual([1]);
  });

  it('leser bare tidsstempelet — aldri melderen, begrunnelsen eller hva som er meldt', async () => {
    const d = db({ data: [], count: 0, error: null });
    await hentAapneRapporter(d.klient);
    expect(d.kall.find((k) => k.metode === 'select')?.args).toEqual(['created_at', { count: 'exact' }]);
  });

  it('ingen åpne: 0 og ingen eldste', async () => {
    const d = db({ data: [], count: 0, error: null });
    expect(await hentAapneRapporter(d.klient)).toEqual({ ok: true, aapne: { antall: 0, eldsteOpprettet: null } });
  });

  it('en feil er ikke «0 åpne»', async () => {
    const d = db({ data: null, count: null, error: { message: 'connection reset' } });
    expect(await hentAapneRapporter(d.klient)).toEqual({ ok: false, feil: 'connection reset', mangler: false });
  });

  it('kjenner igjen en tabell som mangler', async () => {
    const d = db({ data: null, count: null, error: { code: 'PGRST205', message: "Could not find the table 'public.reports'" } });
    expect(await hentAapneRapporter(d.klient)).toMatchObject({ ok: false, mangler: true });
  });

  it('et svar uten telling er ikke målt — heller «ikke målt» enn en gjettet null', async () => {
    const d = db({ data: [], count: null, error: null });
    expect(await hentAapneRapporter(d.klient)).toEqual({ ok: false, feil: 'svaret manglet telling', mangler: false });
  });

  it('kaster ikke videre — dagsrapporten skal gå ut selv om lesingen feiler', async () => {
    const d = db(() => {
      throw new Error('fetch failed');
    });
    expect(await hentAapneRapporter(d.klient)).toEqual({ ok: false, feil: 'fetch failed', mangler: false });
  });

  it('et tidsstempel som ikke er tekst gir ingen eldste, men antallet står', async () => {
    const d = db({ data: [{ created_at: null }], count: 2, error: null });
    expect(await hentAapneRapporter(d.klient)).toEqual({ ok: true, aapne: { antall: 2, eldsteOpprettet: null } });
  });
});
