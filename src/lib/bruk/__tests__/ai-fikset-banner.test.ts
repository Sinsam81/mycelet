import { describe, expect, it } from 'vitest';
import { AI_FIKSET_BANNER_TIL, skalViseAiFiksetBanner } from '../ai-fikset-banner';

describe('skalViseAiFiksetBanner', () => {
  it('vises til og med sluttdagen', () => {
    expect(skalViseAiFiksetBanner('2026-09-29', null)).toBe(true);
    expect(skalViseAiFiksetBanner(AI_FIKSET_BANNER_TIL, null)).toBe(true);
  });

  it('forsvinner dagen etter — et banner som står i månedsvis blir tapet', () => {
    expect(skalViseAiFiksetBanner('2026-10-21', null)).toBe(false);
    expect(skalViseAiFiksetBanner('2027-09-29', null)).toBe(false);
  });

  it('kommer aldri tilbake for den som lukket det', () => {
    expect(skalViseAiFiksetBanner('2026-09-29', '1')).toBe(false);
  });

  it('en ukjent lagret verdi teller som ikke lukket', () => {
    expect(skalViseAiFiksetBanner('2026-09-29', 'x')).toBe(true);
  });

  it('sluttdagen ligger etter rettelsen (29. sep 2026) og innen en måned', () => {
    expect(AI_FIKSET_BANNER_TIL > '2026-09-29').toBe(true);
    expect(AI_FIKSET_BANNER_TIL <= '2026-10-29').toBe(true);
  });
});
