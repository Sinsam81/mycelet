import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { MAKS_STEDER_PER_BRUKER, MAKS_VEIPUNKTER } from '@/lib/steder/veipunkt';

/**
 * Importruta er sikkerhetsgrensa for stedene.
 *
 * Klienten leser GPX-fila og siler den, men den samme JSON-en kan sendes rett
 * hit uten at noen fil har vært innom. Testene her holder derfor fast på at
 * ruta gjør hele jobben selv: validerer punktene, plukker ut nøyaktig de
 * feltene vi lagrer, luker duplikater mot ALT brukeren har, og respekterer
 * taket — uansett hva klienten påstår.
 */

let currentUser: { id: string } | null = null;
/** Radene som ligger i saved_places for brukeren i den aktuelle testen. */
let eksisterendeSteder: { latitude: number; longitude: number }[] = [];
/** Radene ruta forsøkte å sette inn. */
let innsatteRader: Record<string, unknown>[] = [];
/** Filtrene en delete/update ble kjørt med. */
let sisteFiltre: Record<string, unknown> = {};
let innsettingsfeil: { code: string; message: string } | null = null;

function thenable(result: unknown) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (kolonne: string, verdi: unknown) => {
      sisteFiltre[kolonne] = verdi;
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: () => ({
      select: () => thenable({ data: eksisterendeSteder, error: null }),
      insert: (rader: Record<string, unknown>[]) => {
        innsatteRader = rader;
        return thenable(
          innsettingsfeil
            ? { data: null, error: innsettingsfeil }
            : { data: rader.map((_, i) => ({ id: `ny-${i}` })), error: null }
        );
      },
      update: (verdier: Record<string, unknown>) => {
        sisteFiltre = { ...sisteFiltre, ...verdier };
        return thenable({ data: [{ id: 'oppdatert' }], error: null });
      },
      delete: () => thenable({ data: [{ id: 'slettet' }], error: null })
    })
  })
}));

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));

const { POST, PATCH, DELETE } = await import('../route');

let teller = 0;
function post(kropp: unknown) {
  teller += 1;
  // Unik bruker per kall: rate-limiteren nøkles på bruker-id, og fem importer
  // i timen er nettopp det ruta skal begrense.
  currentUser = { id: `bruker-${teller}` };
  return new NextRequest('https://mycelet.com/api/me/steder', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${teller}` },
    body: JSON.stringify(kropp)
  });
}

const punkt = (lat: number, lng: number, name = 'Kantarellskogen') => ({
  name,
  note: null,
  latitude: lat,
  longitude: lng,
  waypointTime: null
});

beforeEach(() => {
  eksisterendeSteder = [];
  innsatteRader = [];
  sisteFiltre = {};
  innsettingsfeil = null;
});

describe('POST /api/me/steder', () => {
  it('krever innlogging', async () => {
    const request = post({ punkter: [punkt(59.9, 10.7)] });
    currentUser = null;
    expect((await POST(request)).status).toBe(401);
  });

  it('lagrer punktene som gpx_import med felles batch-id', async () => {
    const res = await POST(post({ punkter: [punkt(59.9, 10.7), punkt(60.4, 5.3, 'Steinsoppbakken')], filnavn: 'mine.gpx' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.importert).toBe(2);
    expect(innsatteRader).toHaveLength(2);
    expect(innsatteRader[0].source).toBe('gpx_import');
    expect(innsatteRader[0].source_file).toBe('mine.gpx');
    expect(innsatteRader[0].import_batch_id).toBe(innsatteRader[1].import_batch_id);
    expect(body.batchId).toBe(innsatteRader[0].import_batch_id);
  });

  /**
   * Eieren settes av ruta fra økten, aldri av kroppen. Uten dette kunne en
   * innlogget bruker skrevet steder inn i en annens konto.
   */
  it('lar ikke kroppen bestemme hvem stedet tilhører', async () => {
    const request = post({
      punkter: [{ ...punkt(59.9, 10.7), user_id: 'noen-andre', source: 'manual', id: 'påtvunget' }]
    });
    const eier = currentUser!.id;
    await POST(request);

    expect(innsatteRader[0].user_id).toBe(eier);
    expect(innsatteRader[0].source).toBe('gpx_import');
    expect(innsatteRader[0].id).toBeUndefined();
  });

  it('forkaster ugyldige punkter og teller dem i svaret', async () => {
    const res = await POST(
      post({
        punkter: [punkt(59.9, 10.7), { name: 'Uten posisjon' }, { latitude: 999, longitude: 10.7, name: 'Utenfor' }]
      })
    );
    const body = await res.json();

    expect(body.importert).toBe(1);
    expect(body.avvist).toBe(2);
  });

  /**
   * Klienten siler mot stedene den tilfeldigvis hadde lastet. Ruta siler mot
   * ALT brukeren har — ellers gir to importer av samme fil to sett med nåler.
   */
  it('luker duplikater mot stedene som allerede ligger i basen', async () => {
    eksisterendeSteder = [{ latitude: 59.911491, longitude: 10.757933 }];
    const res = await POST(post({ punkter: [punkt(59.911591, 10.757933), punkt(60.4, 5.3)] }));
    const body = await res.json();

    expect(body.hoppetOver).toBe(1);
    expect(body.importert).toBe(1);
    expect(innsatteRader).toHaveLength(1);
  });

  it('svarer uten å skrive når alt i fila finnes fra før', async () => {
    eksisterendeSteder = [{ latitude: 59.9, longitude: 10.7 }];
    const res = await POST(post({ punkter: [punkt(59.9, 10.7)] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.importert).toBe(0);
    expect(body.batchId).toBeNull();
    expect(innsatteRader).toHaveLength(0);
  });

  it('avviser flere punkter enn taket per import', async () => {
    const res = await POST(
      post({ punkter: Array.from({ length: MAKS_VEIPUNKTER + 1 }, (_, i) => punkt(59 + i / 10000, 10.7)) })
    );
    expect(res.status).toBe(400);
    expect(innsatteRader).toHaveLength(0);
  });

  it('sier fra om plassen i stedet for å importere halve fila', async () => {
    eksisterendeSteder = Array.from({ length: MAKS_STEDER_PER_BRUKER - 1 }, (_, i) => ({
      latitude: 50 + i / 1000,
      longitude: 20
    }));
    const res = await POST(post({ punkter: [punkt(59.9, 10.7), punkt(60.4, 5.3)] }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.plass).toBe(1);
    expect(innsatteRader).toHaveLength(0);
  });

  /** Taket håndheves også av en trigger i basen (migrasjon 055). */
  it('oversetter takfeilen fra basen til 409, ikke 500', async () => {
    innsettingsfeil = { code: 'P0001', message: 'For mange lagrede steder for brukeren (maks 1000)' };
    const res = await POST(post({ punkter: [punkt(59.9, 10.7)] }));
    expect(res.status).toBe(409);
  });

  it('avviser en kropp uten punkter', async () => {
    expect((await POST(post({}))).status).toBe(400);
    expect((await POST(post({ punkter: [] }))).status).toBe(400);
    expect((await POST(post({ punkter: 'alle sammen' }))).status).toBe(400);
  });
});

describe('DELETE /api/me/steder', () => {
  function slett(query: string) {
    teller += 1;
    currentUser = { id: `bruker-${teller}` };
    return new NextRequest(`https://mycelet.com/api/me/steder${query}`, {
      method: 'DELETE',
      headers: { 'x-forwarded-for': `10.0.1.${teller}` }
    });
  }

  it('krever en gyldig id eller batch', async () => {
    expect((await DELETE(slett(''))).status).toBe(400);
    expect((await DELETE(slett('?id=slett-alt'))).status).toBe(400);
  });

  it('sletter alltid innenfor egen bruker', async () => {
    const request = slett('?batch=11111111-1111-4111-8111-111111111111');
    const eier = currentUser!.id;
    const res = await DELETE(request);

    expect(res.status).toBe(200);
    expect(sisteFiltre.user_id).toBe(eier);
    expect(sisteFiltre.import_batch_id).toBe('11111111-1111-4111-8111-111111111111');
  });
});

describe('PATCH /api/me/steder', () => {
  function endre(kropp: unknown) {
    teller += 1;
    currentUser = { id: `bruker-${teller}` };
    return new NextRequest('https://mycelet.com/api/me/steder', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.2.${teller}` },
      body: JSON.stringify(kropp)
    });
  }

  it('krever både gyldig id og et navn', async () => {
    expect((await PATCH(endre({ id: 'ikke-en-uuid', name: 'Nytt' }))).status).toBe(400);
    expect(
      (await PATCH(endre({ id: '11111111-1111-4111-8111-111111111111', name: '   ' }))).status
    ).toBe(400);
  });

  it('renser navnet og holder seg til eierens egne rader', async () => {
    const request = endre({ id: '11111111-1111-4111-8111-111111111111', name: '  Nytt   navn  ' });
    const eier = currentUser!.id;
    const res = await PATCH(request);
    const body = await res.json();

    expect(body.name).toBe('Nytt navn');
    expect(sisteFiltre.user_id).toBe(eier);
  });
});
