import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../../../tailwind.config';

/**
 * Tailwind lager INGEN CSS for en fargeklasse som ikke finnes i paletten, og
 * sier ikke fra. `forest-950` ble brukt fire steder uten å være definert:
 * introens slør (`bg-forest-950/70`) var gjennomsiktig, og tre overskrifter
 * falt tilbake til brødtekstfargen. Denne testen finner neste skrivefeil før
 * den når en bruker.
 */

function kildefiler(mappe: string): string[] {
  return readdirSync(mappe, { withFileTypes: true }).flatMap((e) => {
    const sti = join(mappe, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : kildefiler(sti);
    return /\.(ts|tsx)$/.test(e.name) ? [sti] : [];
  });
}

const palett = (config.theme?.extend?.colors as { forest: Record<string, string> }).forest;

describe('forest-paletten', () => {
  it('har alle trinnene kildekoden bruker', () => {
    // Bare sifre: «forest-tile», «forest-data» og «forest-loving» er ikke farger.
    const brukt = new Map<string, string>();
    for (const fil of kildefiler('src')) {
      for (const treff of readFileSync(fil, 'utf8').matchAll(/\bforest-(\d{2,3})\b/g)) {
        if (!brukt.has(treff[1])) brukt.set(treff[1], fil);
      }
    }
    expect(brukt.size, 'fant ingen forest-klasser — leter testen på feil sted?').toBeGreaterThan(5);

    const mangler = [...brukt].filter(([trinn]) => !(trinn in palett)).map(([trinn, fil]) => `forest-${trinn} (${fil})`);
    expect(mangler, 'brukt i koden, men ikke definert i tailwind.config.ts').toEqual([]);
  });

  it('blir mørkere for hvert trinn', () => {
    const lyshet = (hex: string) => [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);
    const trinn = Object.keys(palett)
      .map(Number)
      .sort((a, b) => a - b);
    for (let i = 1; i < trinn.length; i++) {
      expect(lyshet(palett[trinn[i]]), `forest-${trinn[i]} skal være mørkere enn forest-${trinn[i - 1]}`).toBeLessThan(
        lyshet(palett[trinn[i - 1]])
      );
    }
  });
});
