import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { ARTSKATALOG } from '@/lib/species/__tests__/artskatalog-fixture';
import nb from '../../../../messages/nb.json';

/**
 * Kalendersiden leste måneden to steder: serverens klokke (UTC på Vercel) for
 * årstabellen, og enhetens klokke i «I sesong nå». Rundt et månedsskifte kunne
 * de to panelene vise hver sin måned. Nå regnes den ut ÉN gang, i Oslo-tid, og
 * sendes til begge.
 *
 * Og når oppslaget feiler, skal siden si nettopp det — ikke «ingen arter er i
 * sesong» over en tom tabell.
 */
const mock = vi.hoisted(() => ({
  svar: { data: [] as unknown, error: null as unknown }
}));

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'nb',
  getTranslations: async () => (key: string) => (nb.Calendar as Record<string, string>)[key]
}));
vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from: () => ({ select: () => Promise.resolve(mock.svar) }) })
}));
vi.mock('@/components/layout/PageWrapper', () => ({
  PageWrapper: ({ children }: { children: ReactNode }) => <main>{children}</main>
}));
vi.mock('@/lib/hooks/useGeolocation', () => ({
  getCurrentPositionIfGranted: async () => null,
  getCurrentPositionOnce: async () => {
    throw new Error('ingen posisjon i testen');
  },
  isGeolocationAvailable: () => false
}));
vi.mock('@/lib/map/husket-posisjon', () => ({
  lesHusketPosisjon: () => null,
  lagreHusketPosisjon: () => {}
}));

const { default: CalendarPage } = await import('../page');

async function side(): Promise<string> {
  const innhold = await CalendarPage();
  return renderToString(
    <NextIntlClientProvider locale="nb" timeZone="Europe/Oslo" messages={nb}>
      {innhold}
    </NextIntlClientProvider>
  );
}

/** Månedskolonnen årstabellen har uthevet, lest fra overskriftsraden. */
function uthevetManed(html: string): string[] {
  const hode = html.slice(html.indexOf('<thead'), html.indexOf('</thead>'));
  return [...hode.matchAll(/<th class="[^"]*font-semibold text-forest-800[^"]*">([^<]+)<\/th>/g)].map((treff) => treff[1]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  mock.svar.data = [...ARTSKATALOG];
  mock.svar.error = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('én måned for hele siden, i Oslo-tid', () => {
  it('31. oktober 23:30 UTC er november i Oslo — i begge panelene', async () => {
    vi.setSystemTime(new Date('2026-10-31T23:30:00Z'));
    const html = await side();
    expect(html).toContain(nb.SeasonNow.inSeasonNowHeading.replace('{month}', 'november'));
    expect(html).not.toContain(nb.SeasonNow.inSeasonNowHeading.replace('{month}', 'oktober'));
    expect(uthevetManed(html)).toEqual([nb.Calendar.monthNov]);
  });

  it('midt i måneden er de to også enige', async () => {
    vi.setSystemTime(new Date('2026-12-15T12:00:00Z'));
    const html = await side();
    expect(html).toContain(nb.SeasonNow.inSeasonNowHeading.replace('{month}', 'desember'));
    expect(uthevetManed(html)).toEqual([nb.Calendar.monthDec]);
    // Vinteren har noe å vise: de fire artene i sesong, og hva som kommer.
    expect(html).toContain(nb.SeasonNow.nextUpHeading.replace('{month}', 'april'));
  });

  it('forbeholdet står over panelene — før det første artskortet', async () => {
    vi.setSystemTime(new Date('2026-12-15T12:00:00Z'));
    const html = await side();
    const note = html.indexOf(nb.SafetyNote.readSafety);
    const forstePanel = html.indexOf('<article');
    expect(note).toBeGreaterThan(-1);
    expect(forstePanel).toBeGreaterThan(-1);
    expect(note).toBeLessThan(forstePanel);
  });
});

describe('når artene ikke kan hentes', () => {
  it('viser feilen — ikke «ingen arter i sesong» og en tom årstabell', async () => {
    vi.setSystemTime(new Date('2026-12-15T12:00:00Z'));
    mock.svar.data = null;
    mock.svar.error = { message: 'nede' };
    const html = await side();
    expect(html).toContain(nb.Calendar.loadError);
    expect(html).not.toContain(nb.SeasonNow.noneInSeason);
    expect(html).not.toContain('<table');
    expect(html).not.toContain(nb.SeasonNow.inSeasonNowHeading.replace('{month}', 'desember'));
    // Forbeholdet og overskriften står fortsatt.
    expect(html).toContain(nb.Calendar.title);
  });
});
