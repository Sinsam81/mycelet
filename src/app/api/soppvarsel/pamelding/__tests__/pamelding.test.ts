import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Dobbel opt-in er garantien migrasjon 057 er bygget på: ingen e-post før
 * den nyeste bekreftelseslenka er klikket. To hull i påmeldingsruta brøt
 * den, begge funnet i den eksterne gjennomgangen 2026-09-05:
 *   · reaktivering av en avmeldt rad beholdt gammel confirmed_at → cron så
 *     raden som bekreftet med én gang
 *   · oppslaget brukte ilike med brukerinput → «%@%.%%» traff andres rader
 * Testene her låser begge.
 */

let eksisterende: Record<string, unknown> | null = null;
let sisteUpdate: Record<string, unknown> | null = null;
let sisteInsert: Record<string, unknown> | null = null;
const filtre: Array<[string, string, unknown]> = [];
let sendteEposter: Array<{ til: string; tekst: string }> = [];

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock('@/lib/rate-limit/route', () => ({ getClientKey: () => 'test', rateLimitResponse: () => new Response(null, { status: 429 }) }));
vi.mock('@/lib/email/send', () => ({
  sendEpost: async (args: { til: string; tekst: string }) => {
    sendteEposter.push(args);
    return { ok: true };
  }
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      // Bevisst UTEN ilike: kaller ruta den igjen, smeller testen.
      const builder: Record<string, unknown> = {
        select: () => builder,
        is: (k: string, v: unknown) => (filtre.push(['is', k, v]), builder),
        eq: (k: string, v: unknown) => (filtre.push(['eq', k, v]), builder),
        maybeSingle: async () => ({ data: eksisterende, error: null }),
        update: (payload: Record<string, unknown>) => {
          sisteUpdate = payload;
          return { eq: async () => ({ error: null }) };
        },
        insert: (payload: Record<string, unknown>) => {
          sisteInsert = payload;
          return { select: () => ({ single: async () => ({ data: { confirm_token: 'ny-rad-token' }, error: null }) }) };
        }
      };
      return builder;
    }
  })
}));

import { POST } from '../route';

function post(body: Record<string, unknown>, cookie?: string) {
  return POST(
    new NextRequest('http://localhost/api/soppvarsel/pamelding', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    })
  );
}

beforeEach(() => {
  eksisterende = null;
  sisteUpdate = null;
  sisteInsert = null;
  filtre.length = 0;
  sendteEposter = [];
});

describe('påmelding — dobbel opt-in holder', () => {
  it('avmeldt + bekreftet rad reaktiveres som NYTT samtykke: confirmed_at nullstilles og tokenet roteres', async () => {
    eksisterende = { id: 'rad-1', confirmed_at: '2026-08-01T00:00:00Z', active: false };
    const res = await post({ email: 'noen@example.com', region: 'Oslo' });
    expect((await res.json()).status).toBe('sendt');
    expect(sisteUpdate).toMatchObject({ active: true, confirmed_at: null });
    expect(typeof sisteUpdate?.confirm_token).toBe('string');
    expect(sisteUpdate?.confirm_token).toMatch(/^[0-9a-f-]{36}$/);
    // Bekreftelses-e-posten bærer det NYE tokenet, ikke et gammelt.
    expect(sendteEposter).toHaveLength(1);
    expect(sendteEposter[0].tekst).toContain(String(sisteUpdate?.confirm_token));
  });

  it('aktiv + bekreftet rad: stille suksess, ingen e-post, ingen endring', async () => {
    eksisterende = { id: 'rad-1', confirmed_at: '2026-08-01T00:00:00Z', active: true };
    const res = await post({ email: 'noen@example.com', region: 'Oslo' });
    expect((await res.json()).status).toBe('sendt');
    expect(sisteUpdate).toBeNull();
    expect(sendteEposter).toHaveLength(0);
  });

  it('slår opp med eq på lowercase — aldri ilike med brukerinput', async () => {
    await post({ email: 'Noen@Example.com', region: 'Oslo' });
    expect(filtre).toContainEqual(['eq', 'email', 'noen@example.com']);
    expect(filtre.find(([op]) => op === 'ilike')).toBeUndefined();
  });

  it('jokertegn i adressen er harmløse: eq matcher bare den bokstavelige strengen', async () => {
    // «%@%.%%» passerer det løse e-postmønsteret med vilje (ekte adresser er
    // rare). Med ilike traff den alle rader i regionen; med eq finnes ingen rad
    // med den bokstavelige adressen, så det blir en ny, ufarlig rad.
    eksisterende = null;
    const res = await post({ email: '%@%.%%', region: 'Oslo' });
    expect((await res.json()).status).toBe('sendt');
    expect(filtre).toContainEqual(['eq', 'email', '%@%.%%']);
  });

  it('lagrer hvor påmeldingen kom fra — samme cookie som kontoregistreringen', async () => {
    await post({ email: 'ny@example.com', region: 'Bergen' }, 'mycelet_kilde=bergen-snf/host-2026');
    expect(sisteInsert).toMatchObject({ kilde: 'bergen-snf/host-2026', region: 'Bergen' });
  });

  it('uten cookie er kilden null — «ukjent», ikke gjettet', async () => {
    await post({ email: 'ny@example.com', region: 'Bergen' });
    expect(sisteInsert).toMatchObject({ kilde: null });
  });

  it('reaktivering beholder første kilde, fyller bare inn når den mangler', async () => {
    eksisterende = { id: 'rad-1', confirmed_at: null, active: false, kilde: 'sok:google.no' };
    await post({ email: 'noen@example.com', region: 'Oslo' }, 'mycelet_kilde=partner-x');
    expect(sisteUpdate).not.toHaveProperty('kilde');
    eksisterende = { id: 'rad-2', confirmed_at: null, active: false, kilde: null };
    await post({ email: 'noen@example.com', region: 'Oslo' }, 'mycelet_kilde=partner-x');
    expect(sisteUpdate).toMatchObject({ kilde: 'partner-x' });
  });
});
