import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Rekkefølgen i ruta, ikke innholdet i planen (det står i adopsjon*.test.ts).
 *
 * To kommentarer i route.ts kaller rekkefølgen bærende, og begge er lette å
 * miste i en opprydning:
 *
 *   GET: adopsjonen må skje FØR lesingen, ellers svarer ruta «følger ingenting»
 *        til en som har vært abonnent siden før kontoen fantes — og stripa i
 *        forsidekortet spør om det på nytt.
 *   PUT: adopsjonen må skje FØR «slå av de andre», ellers blir en nettopp
 *        adoptert rad for et ANNET område liggende som et andre aktivt
 *        abonnement. Ett område om gangen er det grensesnittet lover.
 *
 * Adopsjonen her bruker en ekte makrooppgave, så et manglende `await` i ruta
 * ville gitt en synlig feil rekkefølge og ikke bare en tilfeldig riktig en.
 */

const s = vi.hoisted(() => ({
  hendelser: [] as string[],
  bruker: null as { id: string; email: string; user_metadata: Record<string, unknown> } | null,
  abonnement: null as Record<string, unknown> | null,
  egenKilde: null as string | null,
  lesefeil: null as string | null,
  deaktiveringsfeil: null as string | null,
  upserts: [] as Array<{ rad: Record<string, unknown>; valg: Record<string, unknown> }>
}));

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock('@/lib/rate-limit/route', () => ({
  getClientKey: () => 'test',
  rateLimitResponse: () => new Response(null, { status: 429 })
}));
vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));
vi.mock('@/lib/alerts/adopsjon', () => ({
  adopterKontolosVarsler: vi.fn(async () => {
    // Én ekte makrooppgave: uten `await` i ruta hadde lesingen rukket forbi.
    await new Promise((r) => setTimeout(r, 0));
    s.hendelser.push('adopsjon');
    return { adopter: [], deaktiverKontolos: [], aktiverEgen: [] };
  })
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: s.bruker } }) },
    from: () => lagKjede()
  })
}));

import { GET, PUT } from '../route';
import { adopterKontolosVarsler } from '@/lib/alerts/adopsjon';

interface Kjede {
  _kolonner: string;
  select: (kolonner: string) => Kjede;
  update: (verdier: Record<string, unknown>) => Kjede;
  upsert: (rad: Record<string, unknown>, valg: Record<string, unknown>) => Promise<{ error: null }>;
  eq: () => Kjede;
  neq: () => Kjede;
  order: () => Kjede;
  limit: () => Kjede;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
  then: (ok: (v: unknown) => unknown, nei?: (e: unknown) => unknown) => Promise<unknown>;
}

function lagKjede(): Kjede {
  const kjede: Kjede = {
    _kolonner: '',
    select: (kolonner: string) => {
      kjede._kolonner = kolonner;
      return kjede;
    },
    update: () => kjede,
    upsert: async (rad, valg) => {
      s.hendelser.push('upsert');
      s.upserts.push({ rad, valg });
      return { error: null };
    },
    eq: () => kjede,
    neq: () => kjede,
    order: () => kjede,
    limit: () => kjede,
    maybeSingle: async () => {
      // PUT slår opp kilden på kontoens egen rad; GET leser abonnementet.
      if (kjede._kolonner === 'kilde') {
        s.hendelser.push('kilde');
        return { data: s.egenKilde ? { kilde: s.egenKilde } : null, error: null };
      }
      s.hendelser.push('les');
      return { data: s.abonnement, error: s.lesefeil ? { message: s.lesefeil } : null };
    },
    // Den eneste kjeden som ventes på uten maybeSingle er «slå av de andre».
    then: (ok, nei) => {
      s.hendelser.push('deaktiver');
      return Promise.resolve({
        error: s.deaktiveringsfeil ? { message: s.deaktiveringsfeil } : null
      }).then(ok, nei);
    }
  };
  return kjede;
}

const req = (body?: unknown) =>
  new NextRequest('http://localhost/api/me/soppvarsel', body === undefined ? undefined : { method: 'PUT', body: JSON.stringify(body) });

beforeEach(() => {
  s.hendelser = [];
  s.bruker = { id: 'u1', email: 'sopp@eksempel.no', user_metadata: {} };
  s.abonnement = null;
  s.egenKilde = null;
  s.lesefeil = null;
  s.deaktiveringsfeil = null;
  s.upserts = [];
  vi.mocked(adopterKontolosVarsler).mockClear();
});

describe('GET /api/me/soppvarsel', () => {
  it('adopterer kontoløse rader FØR abonnementet leses', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(s.hendelser).toEqual(['adopsjon', 'les']);
    expect(adopterKontolosVarsler).toHaveBeenCalledWith(
      expect.objectContaining({ brukerId: 'u1', brukerEpost: 'sopp@eksempel.no' })
    );
  });

  it('svarer 401 uten å adoptere noe når ingen er innlogget', async () => {
    s.bruker = null;
    expect((await GET(req())).status).toBe(401);
    expect(adopterKontolosVarsler).not.toHaveBeenCalled();
  });
});

describe('PUT /api/me/soppvarsel', () => {
  it('adopterer FØR de andre områdene slås av og før raden skrives', async () => {
    const res = await PUT(req({ region: 'Oslo', active: true, kilde: 'hjem-ett-trykk' }));
    expect(res.status).toBe(200);
    expect(s.hendelser.indexOf('adopsjon')).toBeLessThan(s.hendelser.indexOf('deaktiver'));
    expect(s.hendelser.indexOf('deaktiver')).toBeLessThan(s.hendelser.indexOf('upsert'));
    expect(s.upserts[0].rad).toMatchObject({ user_id: 'u1', region: 'Oslo', kilde: 'hjem-ett-trykk' });
  });

  it('adopterer ikke på et ukjent område — forespørselen avvises først', async () => {
    expect((await PUT(req({ region: 'Mordor', active: true }))).status).toBe(400);
    expect(adopterKontolosVarsler).not.toHaveBeenCalled();
    expect(s.hendelser).toEqual([]);
  });

  it('bare allistede kilder skrives på raden', async () => {
    await PUT(req({ region: 'Oslo', active: true, kilde: 'noe-annet' }));
    expect(s.upserts[0].rad.kilde).toBeUndefined();
  });
});
