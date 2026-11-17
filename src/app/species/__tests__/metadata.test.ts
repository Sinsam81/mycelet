import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvingMetadata } from 'next';
import { SAMME_ADRESSE } from '@/lib/seo/side-metadata';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Artsbiblioteket (/species) hadde forsidens tittel i søketreff og delinger.
 * Metadataene kommer nå fra en layout, fordi siden er en klientkomponent — og
 * layouten ligger dermed også rundt de 80 artssidene. Testene holder på at
 * biblioteket får sine egne metadata på riktig språk, og på de to tingene som
 * hindrer at artssidene arver noe de ikke skal ha.
 */
const mock = vi.hoisted(() => ({ locale: 'nb' as 'nb' | 'sv' }));

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => mock.locale }));
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: 'nb' | 'sv'; namespace: 'Species' }) => {
    const katalog = (locale === 'sv' ? sv : nb)[namespace] as Record<string, string>;
    return (key: string) => katalog[key];
  }
}));

const { generateMetadata } = await import('../layout');

/** Det rot-layouten har løst når denne layouten spør: tittel med mal. */
const ROT = Promise.resolve({
  title: { absolute: 'Mycelet — soppkart', template: '%s — Mycelet' }
}) as unknown as ResolvingMetadata;
const ROT_UTEN_MAL = Promise.resolve({ title: { absolute: 'Mycelet', template: null } }) as unknown as ResolvingMetadata;

beforeEach(() => {
  mock.locale = 'nb';
});

describe('metadata for /species', () => {
  it('har egen tittel og beskrivelse på norsk', async () => {
    const meta = await generateMetadata({}, ROT);
    expect(meta.title).toMatchObject({ default: nb.Species.metaTitle });
    expect(meta.description).toBe(nb.Species.metaDescription);
    expect(meta.openGraph).toMatchObject({
      title: nb.Species.metaTitle,
      description: nb.Species.metaDescription,
      locale: 'nb_NO',
      siteName: 'Mycelet'
    });
  });

  it('følger leserens språk — svensk tittel, beskrivelse og og:locale', async () => {
    mock.locale = 'sv';
    const meta = await generateMetadata({}, ROT);
    expect(meta.title).toMatchObject({ default: sv.Species.metaTitle });
    expect(meta.description).toBe(sv.Species.metaDescription);
    expect(meta.openGraph).toMatchObject({ title: sv.Species.metaTitle, locale: 'sv_SE' });
  });
});

describe('layouten ligger også rundt /species/[id]', () => {
  it('gir rot-layoutens tittelmal videre, så artssidene beholder «— Mycelet»', async () => {
    const meta = await generateMetadata({}, ROT);
    // En ren streng her ville nullstilt malen for artssidene (se
    // src/lib/seo/__tests__/side-metadata.test.ts for Nexts oppførsel).
    expect(meta.title).toEqual({ default: nb.Species.metaTitle, template: '%s — Mycelet' });
  });

  it('finner ikke på en mal når rot-layouten ikke har noen', async () => {
    const meta = await generateMetadata({}, ROT_UTEN_MAL);
    expect(meta.title).toBe(nb.Species.metaTitle);
  });

  it('peker canonical og og:url på adressen som ble bedt om — aldri fast på biblioteket', async () => {
    // Artssidens eget oppslag svarer {} når det feiler, og arver da disse.
    const meta = await generateMetadata({}, ROT);
    expect(meta.alternates?.canonical).toBe(SAMME_ADRESSE);
    expect(meta.openGraph?.url).toBe(SAMME_ADRESSE);
    expect(JSON.stringify(meta)).not.toContain('/species');
  });
});
