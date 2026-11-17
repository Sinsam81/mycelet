import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Rutene som avgjør sesong eller måned skal lese Oslo-måneden, ikke
 * UTC-serverens. `new Date().getMonth()` på en UTC-server svarte for feil
 * måned i en til to timer etter midnatt ved hvert månedsskifte — 1. juni
 * kl. 00.30 var fortsatt mai, og mai er utenom sesongen.
 *
 * Grensene selv er testet i oslo-dag.test.ts; /api/identify er i tillegg
 * testet gjennom handleren med falske klokker. Denne vakten holder de andre
 * rutene på helperen. Leser rutene som tekst, som de andre vaktene.
 */
const RUTER = [
  'src/app/api/prediction/route.ts',
  'src/app/api/prediction/species-spots/route.ts',
  'src/app/api/prediction/grid/route.ts',
  'src/app/api/identify/route.ts',
  'src/app/api/identifications/[id]/route.ts'
];

function utenKommentarer(kilde: string): string {
  return kilde.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('måned fra Oslo i rutene', () => {
  for (const rute of RUTER) {
    it(`${rute} leser ikke måneden fra serverklokka`, () => {
      const kilde = utenKommentarer(readFileSync(join(process.cwd(), rute), 'utf8'));
      expect(kilde).not.toMatch(/\.getMonth\(\)/);
      expect(kilde).not.toMatch(/\.getUTCMonth\(\)/);
      expect(kilde).toContain("from '@/lib/api/oslo-dag'");
    });
  }

  it('prediksjonsrutene slår opp fenologien på Oslo-dagen', () => {
    for (const rute of ['src/app/api/prediction/route.ts', 'src/app/api/prediction/species-spots/route.ts', 'src/app/api/prediction/grid/route.ts']) {
      const kilde = utenKommentarer(readFileSync(join(process.cwd(), rute), 'utf8'));
      expect(kilde).not.toMatch(/dayOfYearOf\(new Date\(\)\)/);
      expect(kilde).toContain('osloDagIAaret(');
    }
  });
});
