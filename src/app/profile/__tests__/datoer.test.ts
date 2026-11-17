import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Datoene på profilen er dagene i leserens tidssone, ikke serverens.
 *
 * Profilen rendres på en server i UTC. Et funn eller et foruminnlegg fra
 * kl. 00.30 norsk tid fikk gårsdagens dato, og en konto opprettet 1. desember
 * kl. 00.30 var «medlem siden november». /mine-steder fikk samme rettelse først.
 */

// Serveren går i UTC, og det er DER feilen bodde. Uten denne linja leser
// testen maskinens egen sone — på en maskin i Oslo ga den gamle koden riktig
// dato ved en tilfeldighet. Hver testfil kjører i sin egen prosess; sonen
// settes likevel tilbake til slutt.
const OPPRINNELIG_SONE = process.env.TZ;
process.env.TZ = 'UTC';

interface Svar {
  data: unknown;
  error: { message: string } | null;
}

const tilstand = {
  sprak: 'nb' as 'nb' | 'sv',
  bruker: { id: 'bruker-1', email: 'x@example.com', created_at: '2026-03-08T10:23:00Z' },
  svar: {} as Record<string, Svar>
};

// Oversetteren svarer med nøkkelen — og verdiene den fikk, så «medlem siden»
// kan leses av («memberSince{"date":"desember 2026"}»).
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (nokkel: string, verdier?: Record<string, unknown>) =>
    verdier ? `${nokkel}${JSON.stringify(verdier)}` : nokkel,
  getLocale: async () => tilstand.sprak
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: tilstand.bruker } }) },
    rpc: async () => ({ data: [], error: null }),
    from(tabell: string) {
      const bygger: Record<string, unknown> = {};
      for (const metode of ['select', 'eq', 'is', 'order', 'limit', 'maybeSingle']) bygger[metode] = () => bygger;
      bygger.then = (ok: (svar: Svar) => unknown, feil: (e: unknown) => unknown) =>
        Promise.resolve(tilstand.svar[tabell] ?? { data: null, error: null }).then(ok, feil);
      return bygger;
    }
  })
}));

vi.mock('@/lib/log', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

const { default: ProfilePage } = await import('../page');

/** All tekst i et JSX-tre. Komponentene kjøres ikke; datoene står rett i sidens egen markup. */
function tekst(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((barn) => tekst(barn as ReactNode)).join(' ');
  if (isValidElement(node)) return tekst((node as ReactElement<{ children?: ReactNode }>).props.children);
  return '';
}

// 22:30 UTC 14. oktober = 00:30 i Oslo og Stockholm 15. oktober (sommertid).
const LIKE_OVER_MIDNATT = '2026-10-14T22:30:00Z';

beforeEach(() => {
  tilstand.sprak = 'nb';
  tilstand.bruker = { id: 'bruker-1', email: 'x@example.com', created_at: '2026-03-08T10:23:00Z' };
  tilstand.svar = {
    findings: {
      data: [{ id: 'f1', found_at: LIKE_OVER_MIDNATT, location_name: 'Nordmarka', notes: null, mushroom_species: null }],
      error: null
    },
    forum_posts: {
      data: [
        { id: 'p1', title: 'Kantarell?', category: 'find', created_at: LIKE_OVER_MIDNATT, comments_count: 0, likes_count: 0 }
      ],
      error: null
    }
  };
});

afterAll(() => {
  if (OPPRINNELIG_SONE === undefined) delete process.env.TZ;
  else process.env.TZ = OPPRINNELIG_SONE;
});

describe('datoene på profilen', () => {
  it('funnet og innlegget fra kl. 00.30 norsk tid 15. oktober står som 15. oktober', async () => {
    const side = tekst(await ProfilePage());
    // Både funnlista og innleggslista: samme dato to ganger, aldri 14.
    expect(side.match(/15\.10\.2026/g)).toHaveLength(2);
    expect(side).not.toContain('14.10.2026');
  });

  it('på svensk også — i svensk form', async () => {
    tilstand.sprak = 'sv';
    const side = tekst(await ProfilePage());
    expect(side.match(/2026-10-15/g)).toHaveLength(2);
    expect(side).not.toContain('2026-10-14');
  });

  it('en konto fra 1. desember kl. 00.30 er medlem siden desember, ikke november', async () => {
    // 23:30 UTC 30. november = 00:30 1. desember i Oslo (vintertid).
    tilstand.bruker = { ...tilstand.bruker, created_at: '2026-11-30T23:30:00Z' };
    expect(tekst(await ProfilePage())).toContain('memberSince{"date":"desember 2026"}');
    tilstand.sprak = 'sv';
    expect(tekst(await ProfilePage())).toContain('memberSince{"date":"december 2026"}');
  });
});
