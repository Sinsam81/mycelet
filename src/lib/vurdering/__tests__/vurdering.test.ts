import { describe, expect, it } from 'vitest';
import { burdeSporre, merkSomHandtert, VURDERING_LAGRINGSNOKKEL, VURDERING_URL } from '../vurdering';

/**
 * Reglene som gjør forespørselen forsvarlig: kun i appskallet, aldri mer enn
 * én gang noensinne (uansett utfall, inkludert ignorert), og aldri når
 * lagringen ikke kan huske at vi spurte.
 */

function lager(innhold: Record<string, string> = {}) {
  return {
    getItem: (k: string) => (k in innhold ? innhold[k] : null),
    setItem: (k: string, v: string) => {
      innhold[k] = v;
    },
    _innhold: innhold
  };
}

describe('burdeSporre', () => {
  it('spør i appskallet når det aldri er spurt før', () => {
    expect(burdeSporre(true, lager())).toBe(true);
  });

  it('spør ALDRI på nett — en nettleserbruker kan ikke vurdere i App Store', () => {
    expect(burdeSporre(false, lager())).toBe(false);
  });

  it('spør aldri igjen, uansett hva som skjedde sist', () => {
    for (const utfall of ['vist', 'vurderte', 'avslo']) {
      expect(burdeSporre(true, lager({ [VURDERING_LAGRINGSNOKKEL]: utfall }))).toBe(false);
    }
  });

  it('spør ikke når lagringen er utilgjengelig — vi kan ikke love å huske det', () => {
    const odelagt = { getItem: () => { throw new Error('privat modus'); } };
    expect(burdeSporre(true, odelagt)).toBe(false);
  });
});

describe('merkSomHandtert', () => {
  it('skriver utfallet, og en ødelagt lagring kaster aldri', () => {
    const l = lager();
    merkSomHandtert('vist', l);
    expect(l._innhold[VURDERING_LAGRINGSNOKKEL]).toBe('vist');
    merkSomHandtert('vurderte', l);
    expect(l._innhold[VURDERING_LAGRINGSNOKKEL]).toBe('vurderte');
    expect(() =>
      merkSomHandtert('avslo', { setItem: () => { throw new Error('fullt'); } })
    ).not.toThrow();
  });
});

describe('VURDERING_URL', () => {
  it('peker på riktig app uten landkode (Apple ruter selv) med skriv-vurdering-handling', () => {
    expect(VURDERING_URL).toContain('id6784672944');
    expect(VURDERING_URL).toContain('action=write-review');
    expect(VURDERING_URL).not.toMatch(/apple\.com\/(no|se)\//);
  });
});
