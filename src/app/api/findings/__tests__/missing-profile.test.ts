import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Siste skanse mot funn H9/H20: findings.user_id peker på profiles.id, så en
 * innlogget bruker uten profilrad fikk 23503 og bare «Kunne ikke lagre funnet»
 * — hver eneste gang, uten noen vei ut. Nettleseren reparerer normalt profilen
 * selv (profile-self-heal.ts), men serveren skal ikke miste et funn fordi den
 * koden ikke rakk å kjøre.
 */

const FOREIGN_KEY_VIOLATION = '23503';

/** Har brukeren profilrad? Settes per test. */
let harProfil = false;
let profilUpserts = 0;
let insertForsok = 0;
/** Skal reparasjonen av profilen selv feile? */
let reparasjonFeiler = false;
/** Radene ruten faktisk forsøkte å skrive. */
let insertPayloads: Record<string, unknown>[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: 'bruker-1', email: 'sopp@example.com', user_metadata: { username: 'kantarell' } } }
      })
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          upsert: () => {
            profilUpserts += 1;
            if (reparasjonFeiler) return Promise.resolve({ error: { code: '42501', message: 'nektet' } });
            harProfil = true;
            return Promise.resolve({ error: null });
          }
        };
      }
      return {
        insert: (values: Record<string, unknown>) => ({
          select: () => ({
            single: () => {
              insertForsok += 1;
              insertPayloads.push(values);
              if (!harProfil) {
                return Promise.resolve({
                  data: null,
                  error: {
                    code: FOREIGN_KEY_VIOLATION,
                    message: 'insert or update on table "findings" violates foreign key constraint'
                  }
                });
              }
              return Promise.resolve({ data: { id: 'funn-1' }, error: null });
            }
          })
        })
      };
    }
  })
}));

vi.mock('@/lib/weather', () => ({ fetchWeatherSummary: async () => null }));
vi.mock('@/lib/forest', () => ({ getForestProperties: async () => null }));

vi.mock('@/lib/log/request', () => ({
  createRequestLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn()
  })
}));

import { POST } from '../route';

function funnRequest() {
  return new NextRequest('http://localhost/api/findings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ latitude: 59.91, longitude: 10.75, visibility: 'public' })
  });
}

beforeEach(() => {
  harProfil = false;
  profilUpserts = 0;
  insertForsok = 0;
  reparasjonFeiler = false;
  insertPayloads = [];
});

describe('POST /api/findings for konto uten profilrad', () => {
  it('oppretter profilen og lagrer funnet i stedet for å feile', async () => {
    const response = await POST(funnRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, id: 'funn-1' });
    expect(profilUpserts).toBe(1);
    expect(insertForsok).toBe(2);
  });

  it('rører ikke profiles når brukeren allerede har en profil', async () => {
    harProfil = true;
    const response = await POST(funnRequest());

    expect(response.status).toBe(200);
    expect(profilUpserts).toBe(0);
    expect(insertForsok).toBe(1);
  });

  it('skriver alltid eieren på funnet — begge forsøkene', async () => {
    // findings.user_id er NOT NULL og eierstyrer hele raden. Faller den ut av
    // payloaden, feiler lagringen for ALLE, ikke bare de uten profil.
    await POST(funnRequest());

    expect(insertPayloads).toHaveLength(2);
    for (const payload of insertPayloads) {
      expect(payload.user_id).toBe('bruker-1');
    }
  });

  it('svarer 500 uten evig omkamp hvis selve reparasjonen feiler', async () => {
    reparasjonFeiler = true;
    const response = await POST(funnRequest());

    expect(response.status).toBe(500);
    expect(insertForsok).toBe(1);
  });
});
