import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Samlesidens delingskort. To ting kunne gå stille galt:
 *
 *   · alt-teksten til delingsbildet. Bildefilas `export const alt` sendes ikke
 *     ut når siden setter openGraph.images selv (som den må, for å versjonere
 *     bildet med rasterdatoen) — så den må stå i sidens egen bildeoppføring,
 *     på leserens språk.
 *   · versjoneringen (?d=rasterdato), som holder en deling i takt med siden.
 */

let sprak: 'nb' | 'sv' = 'nb';
let rasterdato: string | null = '2026-09-15';

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => sprak }));
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl');
  return {
    getTranslations: async ({ locale, namespace }: { locale: 'nb' | 'sv'; namespace: string }) =>
      createTranslator({ locale, messages: (locale === 'sv' ? sv : nb) as never, namespace: namespace as never })
  };
});
vi.mock('@/components/layout/PageWrapper', () => ({
  PageWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));
vi.mock('@/components/native/NativeOnly', () => ({ NativeOnly: () => null }));
vi.mock('@/components/bruk/TellFlate', () => ({ TellFlate: () => null }));
vi.mock('../hent-regioner', async () => {
  const ekte = await vi.importActual<typeof import('../hent-regioner')>('../hent-regioner');
  return { ...ekte, hentRegioner: async () => ({ tileDate: rasterdato, regions: [] }) };
});

import { generateMetadata } from '../page';

type Bilde = { url: string; width: number; height: number; alt?: string };
const bilder = async () => ((await generateMetadata()).openGraph as { images: Bilde[] }).images;

beforeEach(() => {
  sprak = 'nb';
  rasterdato = '2026-09-15';
});

describe('samlesidens delingsbilde', () => {
  it('har alt-tekst i sidens egen bildeoppføring, på leserens språk', async () => {
    expect((await bilder())[0].alt).toBe(nb.Soppforhold.ogImageAlt);
    sprak = 'sv';
    expect((await bilder())[0].alt).toBe(sv.Soppforhold.ogImageAlt);
  });

  it('alt-teksten finnes på begge språk, og den svenske er svensk', () => {
    expect(nb.Soppforhold.ogImageAlt).toContain('Norge og Sverige');
    expect(sv.Soppforhold.ogImageAlt).toContain('Sverige och Norge');
    expect(sv.Soppforhold.ogImageAlt).not.toMatch(/[æøÆØ]/);
    // Sann i alle bildets tilstander (tall, utenom sesongen, ingen tall ennå):
    // den lover ikke et tall bildet ikke alltid viser.
    for (const alt of [nb.Soppforhold.ogImageAlt, sv.Soppforhold.ogImageAlt]) {
      expect(alt).not.toMatch(/\d/);
    }
  });

  it('versjoneres fortsatt med rasterdatoen, og har fortsatt målene', async () => {
    expect((await bilder())[0]).toMatchObject({
      url: 'https://www.mycelet.com/soppforhold/opengraph-image?d=2026-09-15',
      width: 1200,
      height: 630
    });
    rasterdato = null;
    expect((await bilder())[0].url).toBe('https://www.mycelet.com/soppforhold/opengraph-image');
  });

  it('og:locale følger leseren, som resten av samlesiden', async () => {
    expect((await generateMetadata()).openGraph).toMatchObject({ locale: 'nb_NO' });
    sprak = 'sv';
    expect((await generateMetadata()).openGraph).toMatchObject({ locale: 'sv_SE' });
  });
});
