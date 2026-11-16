import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createTranslator } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Reserve-landingssiden (den som vises der mellomvaren ikke kjører — lokal
 * utvikling og `npm run qa`). Den hadde drevet fra den ekte, statiske siden:
 * norske ukedager og norsk App Store-lenke på svensk, og et svar som sa at
 * iOS-appen ventet på Apple.
 */

let sprak: 'nb' | 'sv' = 'nb';

vi.mock('next-intl/server', () => ({
  getLocale: async () => sprak,
  getTranslations: async (navnerom: 'Landing') =>
    createTranslator({ locale: sprak, messages: (sprak === 'nb' ? nb : sv) as typeof nb, namespace: navnerom })
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}));
// Toppen og bunnmenyen er klientkomponenter med egne tester; her er det innholdet som gjelder.
vi.mock('@/components/layout/PageWrapper', () => ({ PageWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/native/NonNativeOnly', () => ({ NonNativeOnly: ({ children }: { children: ReactNode }) => <>{children}</> }));

const { LandingPage } = await import('../LandingPage');

async function tegn(valgt: 'nb' | 'sv'): Promise<string> {
  sprak = valgt;
  return renderToStaticMarkup(await LandingPage());
}

/** Etikettene under søylene i telefonskissen (7 px-teksten), i rekkefølge. */
function ukedager(html: string): string[] {
  return [...html.matchAll(/<span class="text-\[7px\][^"]*">([^<]+)<\/span>/g)].map((m) => m[1]);
}

describe('LandingPage — telefonskissen følger språket', () => {
  it('norsk: som før', async () => {
    const html = await tegn('nb');
    expect(ukedager(html)).toEqual(['I dag', 'ons', 'tor', 'fre', 'lør', 'søn', 'man']);
    expect(html).toContain('av 100');
  });

  it('svensk: svenske ukedager — ikke «lør, søn, man»', async () => {
    const html = await tegn('sv');
    expect(ukedager(html)).toEqual(['I dag', 'ons', 'tors', 'fre', 'lör', 'sön', 'mån']);
    for (const norsk of ['lør', 'søn']) expect(html).not.toContain(`>${norsk}<`);
  });
});

describe('LandingPage — appen ligger i App Store', () => {
  it('norsk: lenker til den norske butikken, og sier at appen finnes', async () => {
    const html = await tegn('nb');
    expect(html).toContain('href="https://apps.apple.com/no/app/id6784672944"');
    expect(html).toContain('Finnes Mycelet som app?');
    expect(html).toContain('last ned Mycelet fra App Store');
  });

  it('svensk: lenker til den svenske butikken', async () => {
    const html = await tegn('sv');
    expect(html).toContain('href="https://apps.apple.com/se/app/id6784672944"');
    expect(html).not.toContain('apps.apple.com/no/');
    expect(html).toContain('Finns Mycelet som app?');
  });

  it.each(['nb', 'sv'] as const)('%s: ingen påstand om at appen venter på Apple', async (valgt) => {
    const html = await tegn(valgt);
    expect(html).not.toMatch(/til vurdering|för granskning|Når kommer iOS-appen|När kommer iOS-appen/);
  });
});
