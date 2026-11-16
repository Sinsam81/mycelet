import { describe, expect, it } from 'vitest';
import type { ResolvingMetadata } from 'next';
import { resolveTitle } from 'next/dist/lib/metadata/resolvers/resolve-title';
import { IKKE_INDEKSER, medMal, privatSide, utdrag } from '@/lib/seo/side-titler';

const foreldre = (template: string | null) =>
  Promise.resolve({ title: { absolute: 'x', template } }) as unknown as ResolvingMetadata;

describe('privatSide', () => {
  it('gir egen tittel og ber søkemotorene holde siden utenfor', () => {
    expect(privatSide('Min profil')).toEqual({ title: 'Min profil', robots: { index: false, follow: false } });
    expect(IKKE_INDEKSER).toEqual({ index: false, follow: false });
  });

  it('tittelen får rot-layoutens «— Mycelet» bak seg', () => {
    expect(resolveTitle(privatSide('Min profil').title ?? null, '%s — Mycelet').absolute).toBe('Min profil — Mycelet');
  });
});

describe('medMal', () => {
  it('gir layoutens tittel som { default, template } så sidene under beholder «— Mycelet»', async () => {
    const meta = await medMal({ title: 'Forum', description: 'd' }, 'Forum', foreldre('%s — Mycelet'));
    expect(meta.title).toEqual({ default: 'Forum', template: '%s — Mycelet' });
    expect(meta.description).toBe('d');
    const layout = resolveTitle(meta.title ?? null, '%s — Mycelet');
    expect(layout.absolute).toBe('Forum — Mycelet');
    // En underside med egen tittel får fortsatt malen.
    expect(resolveTitle('Nytt innlegg', layout.template).absolute).toBe('Nytt innlegg — Mycelet');
  });

  it('uten mal hos foreldrene står metadataene uendret', async () => {
    const side = { title: 'Forum' };
    expect(await medMal(side, 'Forum', foreldre(null))).toBe(side);
  });
});

describe('utdrag', () => {
  it('slår sammen mellomrom og lar korte tekster stå hele', () => {
    expect(utdrag('  Fant  kantareller\n\ni dag. ')).toBe('Fant kantareller i dag.');
  });

  it('tom tekst gir null, så kallstedet kan falle tilbake', () => {
    expect(utdrag('')).toBeNull();
    expect(utdrag('   ')).toBeNull();
    expect(utdrag(null)).toBeNull();
  });

  it('kutter lange tekster ved en ordgrense, med «…» og innenfor grensen', () => {
    const lang = 'Steinsopp under gran, '.repeat(20);
    const kort = utdrag(lang, 60)!;
    expect(kort.length).toBeLessThanOrEqual(60);
    expect(kort.endsWith('…')).toBe(true);
    expect(kort).not.toMatch(/[ ,]…$/);
    expect(lang.startsWith(kort.slice(0, -1))).toBe(true);
  });

  it('et langt ord uten mellomrom kuttes likevel', () => {
    expect(utdrag('a'.repeat(300), 50)!.length).toBe(50);
  });
});
