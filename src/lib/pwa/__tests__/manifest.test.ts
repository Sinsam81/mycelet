import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { manifestPathForLocale } from '../manifest';

function readManifest(path: string) {
  const url = new URL(`../../../../public${path}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

describe('manifestPathForLocale', () => {
  it('gir det svenske manifestet til svenske brukere', () => {
    expect(manifestPathForLocale('sv')).toBe('/manifest.sv.json');
  });

  it('gir det norske manifestet til alle andre', () => {
    expect(manifestPathForLocale('nb')).toBe('/manifest.json');
    expect(manifestPathForLocale('en')).toBe('/manifest.json');
  });
});

describe('manifestfilene', () => {
  it('setter riktig lang på hver variant', () => {
    expect(readManifest('/manifest.json').lang).toBe('nb');
    expect(readManifest('/manifest.sv.json').lang).toBe('sv');
  });

  it('kaller ikke produktet norsk på det svenske installasjonskortet', () => {
    const sv = readManifest('/manifest.sv.json');
    expect(sv.description).not.toMatch(/norsk/i);
    expect(sv.description.length).toBeGreaterThan(0);
  });

  it('har samme ikoner og skall i begge variantene', () => {
    const nb = readManifest('/manifest.json');
    const sv = readManifest('/manifest.sv.json');
    expect(sv.icons).toEqual(nb.icons);
    expect(sv.start_url).toBe(nb.start_url);
    expect(sv.scope).toBe(nb.scope);
    expect(sv.display).toBe(nb.display);
    expect(sv.theme_color).toBe(nb.theme_color);
    expect(sv.background_color).toBe(nb.background_color);
  });
});
