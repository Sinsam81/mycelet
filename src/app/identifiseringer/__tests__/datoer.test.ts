import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Datoen på hver identifisering er dagen i leserens tidssone, ikke serverens.
 *
 * Siden rendres på en server i UTC. En identifisering kl. 00.30 norsk tid
 * 15. oktober (22.30 UTC 14. oktober) sto som «14. okt.» her, mens /mine-steder
 * — som fikk den samme rettelsen først — viste 15. oktober for samme dag.
 */

// Serveren går i UTC, og det er DER feilen bodde. Uten denne linja leser
// testen maskinens egen sone — på en maskin i Oslo ga den gamle koden riktig
// dato ved en tilfeldighet. Hver testfil kjører i sin egen prosess; sonen
// settes likevel tilbake til slutt.
const OPPRINNELIG_SONE = process.env.TZ;
process.env.TZ = 'UTC';

const tilstand = {
  sprak: 'nb' as 'nb' | 'sv',
  rader: [] as unknown[]
};

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (nokkel: string) => nokkel,
  getLocale: async () => tilstand.sprak
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'bruker-1' } } }) },
    from() {
      const bygger: Record<string, unknown> = {};
      for (const metode of ['select', 'eq', 'order', 'limit']) bygger[metode] = () => bygger;
      bygger.then = (ok: (svar: unknown) => unknown, feil: (e: unknown) => unknown) =>
        Promise.resolve({ data: tilstand.rader, error: null }).then(ok, feil);
      return bygger;
    },
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }) }) }
  })
}));

const { default: IdentifiseringerPage } = await import('../page');

/** All tekst i et JSX-tre. Komponentene kjøres ikke; datoen står rett i sidens egen markup. */
function tekst(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((barn) => tekst(barn as ReactNode)).join(' ');
  if (isValidElement(node)) return tekst((node as ReactElement<{ children?: ReactNode }>).props.children);
  return '';
}

function rad(createdAt: string) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    created_at: createdAt,
    top_suggestion_name: 'Cantharellus cibarius',
    top_probability: 87,
    latitude: null,
    longitude: null,
    image_path: null,
    image_count: 1,
    finding_id: null,
    mushroom_species: null
  };
}

beforeEach(() => {
  tilstand.sprak = 'nb';
  tilstand.rader = [];
});

afterAll(() => {
  if (OPPRINNELIG_SONE === undefined) delete process.env.TZ;
  else process.env.TZ = OPPRINNELIG_SONE;
});

describe('datoen på identifiseringene', () => {
  it('kl. 00.30 norsk tid 15. oktober står som 15. oktober, ikke 14.', async () => {
    // 22:30 UTC 14. oktober = 00:30 i Oslo og Stockholm 15. oktober (sommertid).
    tilstand.rader = [rad('2026-10-14T22:30:00Z')];
    const side = tekst(await IdentifiseringerPage());
    expect(side).toContain('15. okt. 2026');
    expect(side).not.toContain('14. okt.');
  });

  it('på svensk også — i svensk form', async () => {
    tilstand.sprak = 'sv';
    tilstand.rader = [rad('2026-10-14T22:30:00Z')];
    const side = tekst(await IdentifiseringerPage());
    expect(side).toContain('15 okt. 2026');
    expect(side).not.toContain('14 okt.');
  });

  it('vintertid og årsskifte: kl. 00.30 1. januar er 1. januar 2027, ikke nyttårsaften 2026', async () => {
    // 23:30 UTC 31. desember = 00:30 1. januar i Oslo (én time foran om vinteren).
    tilstand.rader = [rad('2026-12-31T23:30:00Z')];
    const side = tekst(await IdentifiseringerPage());
    expect(side).toContain('1. jan. 2027');
    expect(side).not.toContain('31. des. 2026');
  });
});
