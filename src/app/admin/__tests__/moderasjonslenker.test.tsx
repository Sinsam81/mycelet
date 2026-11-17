import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator } from 'next-intl';
import type { ReactNode } from 'react';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * /admin viste «Rapporter — venter» og «N innlegg er skjult av moderator» som
 * rene tall. Det fantes ingen vei fra tallet til stedet der det kan gjøres noe
 * med — og tallet telte bare `pending`, så en rapport som var markert som
 * gjennomgått forsvant fra tavla uten å være avsluttet.
 *
 * Nå lenker begge til /forum/moderation, og tallet er konsollens eget: samme
 * regel for «åpen», samme døgnfrist, samme setning.
 */

const NAA = new Date('2026-09-15T04:00:00Z');

type Svar = { data: unknown; count?: number | null; error: { code?: string; message?: string } | null };

interface Kall {
  tabell: string;
  metode: string;
  args: unknown[];
}

let sprak: 'nb' | 'sv' = 'nb';
let rapporterSvar: Svar = { data: [], count: 0, error: null };
let skjulteInnlegg = 0;
let kall: Kall[] = [];

function makeAdminClient() {
  return {
    auth: { admin: {} },
    from(tabell: string) {
      const filtre: Array<[string, unknown]> = [];
      // Åpne rapporter leses med `in` (hentAapneRapporter); «rapporter totalt»
      // er en ren telling mot samme tabell og skal ikke få samme svar.
      let medIn = false;
      const bygger: Record<string, unknown> = {};
      for (const metode of ['select', 'order', 'gte', 'eq', 'is', 'limit', 'in']) {
        bygger[metode] = (...args: unknown[]) => {
          kall.push({ tabell, metode, args });
          if (metode === 'eq') filtre.push([args[0] as string, args[1]]);
          if (metode === 'in') medIn = true;
          return bygger;
        };
      }
      bygger.then = (resolve: (v: Svar) => unknown, reject: (e: unknown) => unknown) => {
        const skjult = tabell === 'forum_posts' && filtre.some(([kolonne, verdi]) => kolonne === 'is_hidden' && verdi === true);
        const svar: Svar = tabell === 'reports' && medIn ? rapporterSvar : { data: [], count: skjult ? skjulteInnlegg : 0, error: null };
        return Promise.resolve(svar).then(resolve, reject);
      };
      return bygger;
    }
  };
}

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));
vi.mock('@/components/layout/PageWrapper', () => ({ PageWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: sprak, messages: (sprak === 'nb' ? nb : sv) as never, namespace: namespace as never })
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-admin' } } }) },
    from: () => {
      const bygger: Record<string, unknown> = {
        select: () => bygger,
        eq: () => bygger,
        maybeSingle: async () => ({ data: { role: 'admin' }, error: null })
      };
      return bygger;
    }
  })
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdminClient() }));
vi.mock('@/lib/supabase/alle-brukere', () => ({ hentAlleBrukere: async () => ({ brukere: [], avkortet: false }) }));

const { default: AdminDashboardPage } = await import('../page');

async function tegn(): Promise<string> {
  return renderToStaticMarkup(await AdminDashboardPage());
}

const timerSiden = (t: number) => new Date(NAA.getTime() - t * 3_600_000).toISOString();

/** Kortet med etiketten, med alt som står rundt — lenka eller boksen. */
function kortMed(html: string, etikett: string): string {
  const slutt = html.indexOf(etikett);
  expect(slutt, `fant ikke «${etikett}»`).toBeGreaterThan(-1);
  const start = Math.max(html.lastIndexOf('<a ', slutt), html.lastIndexOf('<div class="rounded-xl border', slutt));
  return html.slice(start, slutt + etikett.length);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NAA);
  sprak = 'nb';
  rapporterSvar = { data: [], count: 0, error: null };
  skjulteInnlegg = 0;
  kall = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('/admin: tallene om moderering lenker til moderasjonssiden', () => {
  it('kortet «Rapporter — venter» er en lenke til /forum/moderation, også når ingenting venter', async () => {
    const kort = kortMed(await tegn(), 'Rapporter — venter');
    expect(kort.startsWith('<a ')).toBe(true);
    expect(kort).toContain('href="/forum/moderation"');
    expect(kort).toContain('>0<');
    // Ingenting venter: ingen farge og ingen setning under.
    expect(kort).not.toContain('bg-amber-50');
    expect(kort).not.toContain('bg-red-50');
  });

  it('teller med konsollens regel: pending OG reviewed, ikke bare pending', async () => {
    await tegn();
    const iKall = kall.filter((k) => k.tabell === 'reports' && k.metode === 'in');
    expect(iKall).toHaveLength(1);
    expect(iKall[0].args).toEqual(['status', ['pending', 'reviewed']]);
    expect(kall.some((k) => k.tabell === 'reports' && k.metode === 'eq' && k.args[1] === 'pending')).toBe(false);
  });

  it('åpne innenfor fristen: gult kort, konsollens setning og lenke', async () => {
    rapporterSvar = { data: [{ created_at: timerSiden(5) }], count: 2, error: null };
    const html = await tegn();
    const kort = kortMed(html, 'Rapporter — venter');
    expect(kort).toContain('>2<');
    expect(kort).toContain('bg-amber-50');
    expect(html).toContain('2 åpne rapporter – den eldste er 5 t gammel.');
    expect(html).not.toContain('Meldinger skal behandles innen ett døgn.');
    expect(html).toMatch(/<a[^>]*href="\/forum\/moderation"[^>]*>Åpne moderasjonssiden<\/a>/);
  });

  it('over døgnfristen: rødt kort og «skal behandles innen ett døgn»', async () => {
    rapporterSvar = { data: [{ created_at: timerSiden(30) }], count: 1, error: null };
    const html = await tegn();
    const kort = kortMed(html, 'Rapporter — venter');
    expect(kort).toContain('bg-red-50');
    expect(html).toContain('1 åpen rapport – den eldste er 30 t gammel.');
    expect(html).toContain('Meldinger skal behandles innen ett døgn.');
  });

  it('feiler tellingen, står det «—» — aldri 0 åpne på en gjetning', async () => {
    rapporterSvar = { data: null, count: null, error: { message: 'connection reset' } };
    const html = await tegn();
    const kort = kortMed(html, 'Rapporter — venter');
    expect(kort).toContain('>—<');
    expect(kort).toContain('href="/forum/moderation"');
    expect(html).not.toContain('Åpne moderasjonssiden');
  });

  it('skjulte innlegg: setningen får en lenke dit de kan vises igjen', async () => {
    skjulteInnlegg = 3;
    const html = await tegn();
    expect(html).toContain('3 innlegg er skjult av moderator.');
    expect(html).toMatch(/<a[^>]*href="\/forum\/moderation"[^>]*>Se dem under «Alle» på moderasjonssiden<\/a>/);
  });

  it('uten skjulte innlegg står det ingen slik lenke', async () => {
    expect(await tegn()).not.toContain('Se dem under');
  });

  it('svensk: egne tekster, ikke norske', async () => {
    sprak = 'sv';
    skjulteInnlegg = 1;
    rapporterSvar = { data: [{ created_at: timerSiden(26) }], count: 3, error: null };
    const html = await tegn();
    expect(html).toContain('3 öppna rapporter – den äldsta är 26 tim gammal.');
    expect(html).toContain('Anmälningar ska behandlas inom ett dygn.');
    expect(html).toMatch(/<a[^>]*href="\/forum\/moderation"[^>]*>Öppna modereringssidan<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/forum\/moderation"[^>]*>Se dem under ”Alla” på modereringssidan<\/a>/);
    expect(html).not.toContain('moderasjonssiden');
  });
});

describe('tekstene finnes i begge språk', () => {
  it.each(['postsHiddenLink', 'openModeration'] as const)('Admin.%s', (nokkel) => {
    expect(nb.Admin[nokkel].length).toBeGreaterThan(0);
    expect(sv.Admin[nokkel].length).toBeGreaterThan(0);
    expect(sv.Admin[nokkel]).not.toBe(nb.Admin[nokkel]);
  });
});
