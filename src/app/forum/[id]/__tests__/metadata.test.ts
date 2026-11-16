import { beforeEach, describe, expect, it, vi } from 'vitest';
import nb from '../../../../../messages/nb.json';
import sv from '../../../../../messages/sv.json';

/**
 * Trådens fanetittel er innleggets egen tittel — bare når leseren kan åpne
 * innlegget. Oppslaget går gjennom leserens økt (RLS skjuler skjulte innlegg og
 * blokkerte forfattere); alt som ikke gir et innlegg, gir en generisk tittel.
 */

type Sprak = 'nb' | 'sv';
const mock = vi.hoisted(() => ({
  locale: 'nb' as 'nb' | 'sv',
  svar: { data: null as null | { title: string; content: string }, error: null as null | { message: string } },
  kast: false,
  filtre: [] as Array<[string, unknown]>,
  kall: 0
}));

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => mock.locale }));
vi.mock('next-intl/server', () => ({
  getTranslations: async (arg: { locale: Sprak; namespace: string }) => {
    const k = (arg.locale === 'sv' ? sv : nb) as unknown as Record<string, Record<string, string>>;
    return (key: string) => k[arg.namespace][key];
  }
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => {
    mock.kall += 1;
    if (mock.kast) throw new Error('mangler miljø');
    const q = {
      select: () => q,
      eq: (kolonne: string, verdi: unknown) => {
        mock.filtre.push([kolonne, verdi]);
        return q;
      },
      maybeSingle: async () => mock.svar
    };
    return { from: () => q };
  }
}));

const { generateMetadata } = await import('../layout');
const ID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const meta = (id = ID) => generateMetadata({ params: Promise.resolve({ id }) });

beforeEach(() => {
  mock.locale = 'nb';
  mock.svar = { data: null, error: null };
  mock.kast = false;
  mock.filtre = [];
  mock.kall = 0;
});

describe('fanetittelen til en forumtråd', () => {
  it('lesbart innlegg: egen tittel, utdrag som beskrivelse, kanonisk på tråden', async () => {
    mock.svar = { data: { title: '  Kantareller i Nordmarka  ', content: 'Fant  en kurv\ni går.' }, error: null };
    const m = await meta();
    expect(m.title).toBe('Kantareller i Nordmarka');
    expect(m.description).toBe('Fant en kurv i går.');
    expect(m.alternates?.canonical).toBe(`/forum/${ID}`);
    expect(m.robots).toBeUndefined();
    expect(mock.filtre).toEqual([
      ['id', ID],
      ['is_hidden', false]
    ]);
  });

  it('innlegg uten tekst får forumets beskrivelse', async () => {
    mock.locale = 'sv';
    mock.svar = { data: { title: 'Trattkantareller', content: '   ' }, error: null };
    expect((await meta()).description).toBe(sv.Forum.metaDescription);
  });

  it('skjult, slettet eller blokkert (ingen rad): generisk tittel og noindex — aldri innleggets', async () => {
    const m = await meta();
    expect(m.title).toBe(nb.ForumThread.metaTitleFallback);
    expect(m.robots).toEqual({ index: false, follow: false });
  });

  it('en feil fra databasen lekker ingenting', async () => {
    mock.svar = { data: { title: 'Hemmelig', content: '' }, error: { message: 'boom' } };
    expect((await meta()).title).toBe(nb.ForumThread.metaTitleFallback);
    mock.kast = true;
    expect((await meta()).title).toBe(nb.ForumThread.metaTitleFallback);
  });

  it('en id som ikke er en UUID slås ikke opp', async () => {
    mock.locale = 'sv';
    expect((await meta('../../etc')).title).toBe(sv.ForumThread.metaTitleFallback);
    expect(mock.kall).toBe(0);
  });
});
