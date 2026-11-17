import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FunnKallFeil, endreFunn, gjenopprettFunn, lesLagreSvar, slettFunn, utdatertGrunn } from '../funn-kall';

/**
 * Nettleserens kall mot /api/findings/:id. fetch er mocket: et ekte kall ville
 * endret et ekte funn i den eneste databasen som finnes.
 */

const ID = '11111111-2222-3333-4444-555555555555';
const fetchMock = vi.fn();

const svar = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body)
});

/** Kaller og gir feilen tilbake, så testene kan se på den. */
async function feilFra(kall: Promise<void>): Promise<FunnKallFeil> {
  try {
    await kall;
  } catch (error) {
    if (error instanceof FunnKallFeil) return error;
    throw error;
  }
  throw new Error('forventet at kallet feilet');
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(svar(200, { ok: true }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('kallene', () => {
  it('endrer med PATCH og bare feltene som er sendt', async () => {
    await endreFunn(ID, { notes: 'Ved bekken' }, 'reserve');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/findings/${ID}`);
    expect(init.method).toBe('PATCH');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ notes: 'Ved bekken' });
  });

  it('sletter med DELETE og gjenoppretter med POST til /restore', async () => {
    await slettFunn(ID, 'reserve');
    await gjenopprettFunn(ID, 'reserve');
    expect(fetchMock.mock.calls.map(([url, init]) => [url, (init as RequestInit).method])).toEqual([
      [`/api/findings/${ID}`, 'DELETE'],
      [`/api/findings/${ID}/restore`, 'POST']
    ]);
  });

  /** Id-en kommer fra sidens data, men skal aldri kunne bli en annen sti. */
  it('lar ikke en rar id bli en annen sti', async () => {
    await slettFunn('../me/delete', 'reserve');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/findings/..%2Fme%2Fdelete');
  });
});

describe('feilene', () => {
  it('bærer serverens tekst og kode', async () => {
    fetchMock.mockResolvedValue(svar(404, { error: 'Fant ikke funnet', code: 'not_found' }));
    const feil = await feilFra(endreFunn(ID, { notes: null }, 'reserve'));
    expect(feil.message).toBe('Fant ikke funnet');
    expect(feil.code).toBe('not_found');
  });

  /** Når en migrasjon mangler, er det `details` som sier hva som IKKE skjedde. */
  it('lar `details` vinne over `error`', async () => {
    fetchMock.mockResolvedValue(
      svar(503, { error: 'Funksjonen er ikke slått på ennå', details: 'Funnet ditt er trygt og IKKE slettet.', code: 'feature_not_enabled' })
    );
    expect((await feilFra(slettFunn(ID, 'reserve'))).message).toBe('Funnet ditt er trygt og IKKE slettet.');
  });

  it('bruker reserveteksten når svaret ikke lar seg lese, er tomt eller ikke er tekst', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: () => Promise.reject(new Error('ikke JSON')) });
    expect((await feilFra(slettFunn(ID, 'Kunne ikke slette funnet'))).message).toBe('Kunne ikke slette funnet');

    fetchMock.mockResolvedValue(svar(500, { error: '   ' }));
    expect((await feilFra(slettFunn(ID, 'reserve'))).message).toBe('reserve');

    fetchMock.mockResolvedValue(svar(500, { error: { nested: true }, code: 42 }));
    const feil = await feilFra(slettFunn(ID, 'reserve'));
    expect(feil.message).toBe('reserve');
    expect(feil.code).toBeNull();
  });

  it('bruker reserveteksten når nettet faller ut', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const feil = await feilFra(gjenopprettFunn(ID, 'Kunne ikke angre slettingen'));
    expect(feil.message).toBe('Kunne ikke angre slettingen');
    expect(feil.code).toBeNull();
  });
});

describe('utdatertGrunn', () => {
  it('kjenner igjen et funn som er borte, og en karantene siden ikke visste om', () => {
    expect(utdatertGrunn(new FunnKallFeil('x', 'not_found'))).toBe('borte');
    expect(utdatertGrunn(new FunnKallFeil('x', 'sharing_cooldown'))).toBe('karantene');
  });

  it('er null for alt annet', () => {
    expect(utdatertGrunn(new FunnKallFeil('x', 'update_failed'))).toBeNull();
    expect(utdatertGrunn(new FunnKallFeil('x'))).toBeNull();
    expect(utdatertGrunn(new Error('not_found'))).toBeNull();
    expect(utdatertGrunn(null)).toBeNull();
  });
});

describe('lesLagreSvar', () => {
  it('leser id og beskjeden sonevakta legger på', () => {
    expect(
      lesLagreSvar({ ok: true, id: 'funn-1', notice: { code: 'zone_saved_private', message: 'Lagret som privat.' } })
    ).toEqual({ id: 'funn-1', notice: { code: 'zone_saved_private', message: 'Lagret som privat.' } });
  });

  it('gir ingen beskjed når svaret ikke har en', () => {
    expect(lesLagreSvar({ ok: true, id: 'funn-1' })).toEqual({ id: 'funn-1', notice: null });
  });

  it('tåler et svar som ikke lot seg lese, og en beskjed uten tekst', () => {
    expect(lesLagreSvar(null)).toEqual({ id: null, notice: null });
    expect(lesLagreSvar('tekst')).toEqual({ id: null, notice: null });
    expect(lesLagreSvar({ id: 7, notice: { code: 'x', message: '  ' } })).toEqual({ id: null, notice: null });
  });
});
