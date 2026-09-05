import { describe, expect, it } from 'vitest';
import { erFasitModen, FASIT_MODEN_DAGER, FASIT_MODEN_ETTER_VARSEL_DAGER, FASIT_VINDU_DAGER } from '../fasit';

describe('erFasitModen', () => {
  it('modenhet teller fra slutten av etter-uken, ikke fra varseldagen', () => {
    expect(FASIT_MODEN_ETTER_VARSEL_DAGER).toBe(FASIT_MODEN_DAGER + FASIT_VINDU_DAGER);
  });

  it('14 dager etter varselet er IKKE modent — etter-uken er bare sju dager gammel', () => {
    expect(erFasitModen('2026-08-21', new Date('2026-09-04T12:00:00Z'))).toBe(false);
  });

  it('21 dager etter varselet er modent', () => {
    expect(erFasitModen('2026-08-14', new Date('2026-09-04T12:00:00Z'))).toBe(true);
    expect(erFasitModen('2026-08-15', new Date('2026-09-05T00:00:00Z'))).toBe(true);
  });

  it('dagen før grensen er umodent', () => {
    expect(erFasitModen('2026-08-15', new Date('2026-09-04T23:00:00Z'))).toBe(false);
  });
});
