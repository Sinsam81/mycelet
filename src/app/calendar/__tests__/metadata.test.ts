import { beforeEach, describe, expect, it, vi } from 'vitest';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Kalenderen (/calendar) arvet forsidens tittel og beskrivelse og hadde ingen
 * kanonisk adresse. Bare generateMetadata testes her; resten av siden er
 * erstattet med tomme moduler, så testen ikke drar inn Supabase og kartlaget.
 */
const mock = vi.hoisted(() => ({ locale: 'nb' as 'nb' | 'sv' }));

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => mock.locale }));
vi.mock('next-intl/server', () => ({
  getLocale: async () => mock.locale,
  getTranslations: async (arg: { locale: 'nb' | 'sv'; namespace: 'Calendar' } | string) => {
    const locale = typeof arg === 'string' ? mock.locale : arg.locale;
    const katalog = (locale === 'sv' ? sv : nb).Calendar as Record<string, string>;
    return (key: string) => katalog[key];
  }
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({}) }));
vi.mock('@/components/layout/PageWrapper', () => ({ PageWrapper: () => null }));
vi.mock('@/components/calendar/SeasonNow', () => ({ SeasonNow: () => null }));
vi.mock('@/components/calendar/YearTable', () => ({ YearTable: () => null }));
vi.mock('@/components/safety/SafetyNote', () => ({ SafetyNote: () => null }));

const { generateMetadata } = await import('../page');

beforeEach(() => {
  mock.locale = 'nb';
});

describe('metadata for /calendar', () => {
  it('har egen tittel og beskrivelse på norsk — tittelen uten merkenavn, det legger malen på', async () => {
    const meta = await generateMetadata();
    expect(meta.title).toBe(nb.Calendar.metaTitle);
    expect(meta.description).toBe(nb.Calendar.metaDescription);
    expect(String(meta.title)).not.toMatch(/Mycelet/);
  });

  it('følger leserens språk', async () => {
    mock.locale = 'sv';
    const meta = await generateMetadata();
    expect(meta.title).toBe(sv.Calendar.metaTitle);
    expect(meta.description).toBe(sv.Calendar.metaDescription);
    expect(meta.openGraph).toMatchObject({
      title: sv.Calendar.metaTitle,
      description: sv.Calendar.metaDescription,
      locale: 'sv_SE'
    });
  });

  it('er kanonisk på /calendar, med samme adresse i og:url', async () => {
    const meta = await generateMetadata();
    expect(new URL(String(meta.metadataBase)).origin).toBe('https://www.mycelet.com');
    expect(meta.alternates?.canonical).toBe('/calendar');
    expect(meta.openGraph?.url).toBe('/calendar');
  });
});
