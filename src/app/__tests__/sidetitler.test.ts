import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Metadata, ResolvingMetadata } from 'next';
import { isValidElement, createElement } from 'react';
import nb from '../../../messages/nb.json';
import sv from '../../../messages/sv.json';

/**
 * Femten sider viste bare rot-layoutens «Mycelet — soppkart, soppvarsel og
 * AI-soppidentifikasjon» i fanen. Her: at hver side har sin egen tittel på
 * leserens språk, at de offentlige har beskrivelse og canonical, og at de
 * private har noindex. Sidene selv erstattes ikke — bare modulene de drar inn
 * og som ikke trengs for generateMetadata.
 */

type Sprak = 'nb' | 'sv';
const mock = vi.hoisted(() => ({ locale: 'nb' as 'nb' | 'sv' }));
const katalog = (locale: Sprak) => (locale === 'sv' ? sv : nb) as unknown as Record<string, Record<string, string>>;

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => mock.locale }));
vi.mock('next-intl/server', () => ({
  getLocale: async () => mock.locale,
  getTranslations: async (arg: { locale: Sprak; namespace: string } | string) => {
    const locale = typeof arg === 'string' ? mock.locale : arg.locale;
    const ns = typeof arg === 'string' ? arg : arg.namespace;
    return (key: string) => katalog(locale)[ns][key];
  }
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({}) }));
vi.mock('@/components/map/MushroomMapLazy', () => ({ MushroomMap: () => null }));
vi.mock('@/app/forum/moderation/ModerationConsole', () => ({ ModerationConsole: () => null }));

const foreldre = Promise.resolve({ title: { absolute: 'x', template: '%s — Mycelet' } }) as unknown as ResolvingMetadata;
type Gen = (props: unknown, parent: ResolvingMetadata) => Promise<Metadata>;
const hent = async (modul: Promise<{ generateMetadata: Gen }>) => (await modul).generateMetadata;

const tittelTekst = (meta: Metadata) =>
  typeof meta.title === 'string' ? meta.title : (meta.title as { default: string }).default;

beforeEach(() => {
  mock.locale = 'nb';
});

const offentlige: Array<[string, () => Promise<{ generateMetadata: Gen }>, string, string, string, string | null]> = [
  ['/pricing', () => import('../pricing/layout'), 'Pricing', 'metaTitle', 'metaDescription', '/pricing'],
  ['/auth/login', () => import('../auth/login/layout'), 'AuthLogin', 'metaTitle', 'metaDescription', '/auth/login'],
  ['/auth/register', () => import('../auth/register/layout'), 'AuthRegister', 'title', 'metaDescription', '/auth/register'],
  // Disse to ligger rundt flere ruter: canonical er «adressen som ble bedt om».
  ['/identify', () => import('../identify/layout'), 'Identify', 'metaTitle', 'metaDescription', './'],
  ['/forum', () => import('../forum/layout'), 'Forum', 'metaTitle', 'metaDescription', './']
];

describe.each(offentlige)('offentlig side %s', (_sti, last, ns, tittelNokkel, beskrivelseNokkel, canonical) => {
  it.each(['nb', 'sv'] as const)('%s: egen tittel, beskrivelse og canonical — og ingen noindex', async (locale) => {
    mock.locale = locale;
    const meta = await (await hent(last()))({}, foreldre);
    expect(tittelTekst(meta)).toBe(katalog(locale)[ns][tittelNokkel]);
    expect(tittelTekst(meta)).toBeTruthy();
    expect(meta.description).toBe(katalog(locale)[ns][beskrivelseNokkel]);
    expect(meta.alternates?.canonical).toBe(canonical);
    expect(meta.robots).toBeUndefined();
    expect(meta.openGraph).toMatchObject({ locale: locale === 'sv' ? 'sv_SE' : 'nb_NO' });
  });
});

describe('layouter rundt flere ruter', () => {
  it.each([
    ['/identify', () => import('../identify/layout')],
    ['/forum', () => import('../forum/layout')]
  ])('%s gir malen videre, så sidene under beholder «— Mycelet»', async (_sti, last) => {
    const meta = await (await hent(last()))({}, foreldre);
    expect(meta.title).toMatchObject({ template: '%s — Mycelet' });
  });
});

const private_: Array<[string, () => Promise<{ generateMetadata: Gen }>, string, string]> = [
  ['/identify/result', () => import('../identify/result/layout'), 'IdentifyResult', 'metaTitle'],
  ['/forum/new', () => import('../forum/new/layout'), 'ForumNew', 'newPost'],
  ['/forum/reports', () => import('../forum/reports/layout'), 'ForumReports', 'title'],
  ['/forum/moderation', () => import('../forum/moderation/page'), 'ForumModeration', 'title'],
  ['/auth/forgot', () => import('../auth/forgot/layout'), 'AuthForgot', 'title'],
  ['/auth/reset', () => import('../auth/reset/layout'), 'AuthReset', 'title'],
  ['/auth/bekreftet-app', () => import('../auth/bekreftet-app/page'), 'AuthBekreftetApp', 'title'],
  ['/profile', () => import('../profile/page'), 'Profile', 'myProfile'],
  ['/map', () => import('../map/page'), 'MapPage', 'title'],
  ['/mine-steder', () => import('../mine-steder/page'), 'MineSteder', 'metaTitle'],
  ['/identifiseringer', () => import('../identifiseringer/page'), 'Identifiseringer', 'metaTitle'],
  ['/admin/prediction', () => import('../admin/prediction/page'), 'AdminPrediction', 'title'],
  ['/admin/forum-trust', () => import('../admin/forum-trust/layout'), 'AdminForumTrust', 'title']
];

describe.each(private_)('privat side %s', (_sti, last, ns, nokkel) => {
  it.each(['nb', 'sv'] as const)('%s: egen tittel og noindex', async (locale) => {
    mock.locale = locale;
    const meta = await (await hent(last()))({}, foreldre);
    expect(meta.title).toBe(katalog(locale)[ns][nokkel]);
    expect(meta.title).toBeTruthy();
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});

describe('admin', () => {
  it('hele området er noindex, også sidene som bare setter tittel', async () => {
    const { metadata } = await import('../admin/layout');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

describe('ingen tittel bærer merkenavnet selv — malen legger det på', () => {
  it.each(['nb', 'sv'] as const)('%s', (locale) => {
    const k = katalog(locale);
    for (const [ns, nokkel] of [
      ['Pricing', 'metaTitle'],
      ['AuthLogin', 'metaTitle'],
      ['Identify', 'metaTitle'],
      ['IdentifyResult', 'metaTitle'],
      ['Forum', 'metaTitle'],
      ['ForumThread', 'metaTitleFallback']
    ]) {
      expect(k[ns][nokkel]).not.toMatch(/Mycelet/);
    }
    for (const [ns, nokkel] of [
      ['Pricing', 'metaDescription'],
      ['Identify', 'metaDescription'],
      ['Forum', 'metaDescription'],
      ['AuthLogin', 'metaDescription'],
      ['AuthRegister', 'metaDescription']
    ]) {
      expect(k[ns][nokkel].length).toBeLessThanOrEqual(160);
      expect(k[ns][nokkel]).toMatch(/[.!?]$/);
    }
  });

  it('AI-beskrivelsen lover ingen spiselighetsdom', () => {
    expect(nb.Identify.metaDescription).toMatch(/aldri en dom om spiselighet/);
    expect(sv.Identify.metaDescription).toMatch(/aldrig ett besked om ätlighet/);
  });
});

describe('layoutene rører ikke rendringen', () => {
  it.each([
    () => import('../pricing/layout'),
    () => import('../auth/login/layout'),
    () => import('../auth/register/layout'),
    () => import('../auth/forgot/layout'),
    () => import('../auth/reset/layout'),
    () => import('../identify/layout'),
    () => import('../identify/result/layout'),
    () => import('../forum/layout'),
    () => import('../forum/new/layout'),
    () => import('../forum/reports/layout'),
    () => import('../forum/[id]/layout'),
    () => import('../admin/layout'),
    () => import('../admin/forum-trust/layout')
  ])('layout %# gir barna tilbake uendret — Suspense og useSearchParams ligger fortsatt i siden', async (last) => {
    const Layout = (await last()).default as (props: { children: unknown }) => unknown;
    const barn = createElement('main', null, 'side');
    const ut = Layout({ children: barn });
    expect(ut).toBe(barn);
    expect(isValidElement(ut)).toBe(true);
  });
});
