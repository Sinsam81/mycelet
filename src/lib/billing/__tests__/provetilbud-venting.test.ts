import { describe, expect, it } from 'vitest';
import { klarTilArk, nesteVenting, startVenting } from '../provetilbud-venting';

/**
 * Arket på forsiden skal aldri komme før introen er ferdig OG kortet har
 * data — uansett hvilken av dem som kommer først, og uansett om kortet
 * meldte seg selv eller fristen gikk ut.
 */
describe('provetilbud-venting', () => {
  it('starter med introen ferdig bare når lagringen sier det', () => {
    expect(startVenting('1')).toEqual({ introFerdig: true, kortKlar: false });
    expect(startVenting(null)).toEqual({ introFerdig: false, kortKlar: false });
    expect(startVenting('0')).toEqual({ introFerdig: false, kortKlar: false });
  });

  it('er ikke klar før begge er på plass — i hvilken som helst rekkefølge', () => {
    const a = nesteVenting(startVenting(null), 'kort-klar');
    expect(klarTilArk(a)).toBe(false);
    expect(klarTilArk(nesteVenting(a, 'intro-ferdig'))).toBe(true);

    const b = nesteVenting(startVenting(null), 'intro-ferdig');
    expect(klarTilArk(b)).toBe(false);
    expect(klarTilArk(nesteVenting(b, 'kort-klar'))).toBe(true);
  });

  it('fristen teller som kortet klart', () => {
    expect(klarTilArk(nesteVenting(startVenting('1'), 'kort-frist'))).toBe(true);
  });

  it('gjentatte hendelser gir samme objekt (ingen unødige rerender)', () => {
    const v = nesteVenting(startVenting('1'), 'kort-klar');
    expect(nesteVenting(v, 'kort-klar')).toBe(v);
    expect(nesteVenting(v, 'intro-ferdig')).toBe(v);
  });
});
