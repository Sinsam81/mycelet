import { beforeEach, describe, expect, it, vi } from 'vitest';

const lager = new Map<string, string>();
vi.mock('@/lib/utils/safe-storage', () => ({
  readLocal: (k: string) => lager.get(k) ?? null,
  writeLocal: (k: string, v: string) => {
    lager.set(k, v);
  }
}));

import { lagreDelingsnivaStandard, lesDelingsnivaStandard, somSynlighet } from '../delingsniva';

describe('husket delingsnivå', () => {
  beforeEach(() => lager.clear());

  it('husker et gyldig valg og leser det tilbake', () => {
    lagreDelingsnivaStandard('private');
    expect(lesDelingsnivaStandard()).toBe('private');
  });

  it('avviser tull fra lagringen — en tuklet verdi blir null, aldri en synlighet', () => {
    lager.set('mycelet:delingsniva-v1', 'super-public');
    expect(lesDelingsnivaStandard()).toBeNull();
  });

  it('gir null uten lagret valg', () => {
    expect(lesDelingsnivaStandard()).toBeNull();
  });
});

describe('somSynlighet — AI-resultatsiden har ikke sone-funn', () => {
  it('mapper zone til approximate (sonens egen databasesynlighet)', () => {
    expect(somSynlighet('zone')).toBe('approximate');
  });

  it('beholder de tre rene verdiene og faller tilbake til dagens standard', () => {
    expect(somSynlighet('public')).toBe('public');
    expect(somSynlighet('private')).toBe('private');
    expect(somSynlighet('approximate')).toBe('approximate');
    expect(somSynlighet(null)).toBe('approximate');
  });
});
