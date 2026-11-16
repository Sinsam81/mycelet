import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Kildevakt: kartets slettehandling og søkefeltet. MushroomMap.tsx lastes ikke
 * av noen test (Leaflet + DOM), så koblingen låses her. Reglene selv er prøvd
 * i src/lib/map/__tests__/funn-svar.test.ts, visbar-feil.test.ts og
 * src/lib/api/__tests__ (postgrest-filter).
 */
const KILDE = readFileSync(new URL('../MushroomMap.tsx', import.meta.url), 'utf8');

function mellom(start: string, slutt: string): string {
  const fra = KILDE.indexOf(start);
  expect(fra, `fant ikke «${start}»`).toBeGreaterThan(-1);
  const til = KILDE.indexOf(slutt, fra + start.length);
  expect(til).toBeGreaterThan(fra);
  return KILDE.slice(fra, til);
}

describe('slettingen fra popupen', () => {
  const sletting = mellom('const handleDeleteFinding = useCallback(', '[restoreFinding, t]');

  it('et fetch som kaster (uten dekning) blir katalogens tekst', () => {
    expect(sletting).toMatch(/try \{\s*res = await fetch\(`\/api\/findings\/\$\{findingId\}`, \{ method: 'DELETE' \}\);\s*\} catch \{\s*throw new VisbarFeil\(t\('findingDeleteFailed'\)\);/);
  });

  it('viser bare rutas egen tekst, og aldri body.error eller body.details rått', () => {
    expect(sletting).toContain("throw new VisbarFeil(serverFeiltekst(body, { medDetaljer: true, status: res.status }) ?? t('findingDeleteFailed'));");
    expect(sletting).not.toContain('body?.details');
    expect(sletting).not.toContain('body?.error');
    expect(sletting).not.toContain('new Error(');
  });
});

describe('søkefeltet', () => {
  it('sender søketeksten gjennom inneholderMonster, aldri rått inn i or-filteret', () => {
    expect(KILDE).not.toMatch(/ilike\.%\$\{/);
    expect(KILDE).toContain('const monster = inneholderMonster(value);');
  });
});
