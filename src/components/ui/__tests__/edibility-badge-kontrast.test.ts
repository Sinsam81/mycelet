import { describe, expect, it } from 'vitest';
import colors from 'tailwindcss/colors';
import { edibilityBadgeClasses } from '../EdibilityBadge';

/**
 * Merket er 12 px tekst og ofte den eneste sikkerhetsinformasjonen på skjermen
 * (artslista, kalenderen, AI-resultatet). «Spiselig — giftig rå» sto i hvitt på
 * amber-500: 2,15:1, mot WCAG AAs 4,5:1. Denne testen regner kontrasten ut av
 * de faktiske Tailwind-fargene, så et fargebytte ikke kan senke den igjen.
 */

function hex(token: string): string {
  if (token === 'white') return '#ffffff';
  if (token === 'black') return '#000000';
  const [navn, trinn] = token.split('-');
  const farge = (colors as unknown as Record<string, Record<string, string>>)[navn]?.[trinn];
  if (!farge) throw new Error(`Ukjent Tailwind-farge: ${token}`);
  return farge;
}

function luminans(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function kontrast(a: string, b: string): number {
  const [lys, mork] = [luminans(a), luminans(b)].sort((x, y) => y - x);
  return (lys + 0.05) / (mork + 0.05);
}

describe('spiselighetsmerkets kontrast', () => {
  it('regner riktig på kjente par', () => {
    expect(kontrast('#ffffff', '#000000')).toBeCloseTo(21, 1);
    // Det gamle, for svake paret — holder regnestykket ærlig.
    expect(kontrast(hex('amber-500'), '#ffffff')).toBeLessThan(2.5);
  });

  for (const [klasse, classes] of Object.entries(edibilityBadgeClasses)) {
    it(`${klasse} har minst 4,5:1 mellom tekst og flate`, () => {
      const bg = classes.match(/\bbg-([a-z]+(?:-\d+)?)\b/)?.[1];
      const tekst = classes.match(/\btext-([a-z]+(?:-\d+)?)\b/)?.[1];
      expect(bg, 'mangler bg-klasse').toBeTruthy();
      expect(tekst, 'mangler text-klasse').toBeTruthy();
      expect(kontrast(hex(bg!), hex(tekst!))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('holder giftig og dødelig på rødt, atskilt fra de andre klassene', () => {
    expect(edibilityBadgeClasses.toxic).toContain('bg-red-');
    expect(edibilityBadgeClasses.deadly).toContain('bg-red-');
    for (const k of ['edible', 'conditionally_edible', 'inedible', 'unknown'] as const) {
      expect(edibilityBadgeClasses[k]).not.toContain('bg-red-');
    }
  });
});
