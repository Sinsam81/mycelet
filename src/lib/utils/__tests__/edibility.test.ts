import { describe, it, expect } from 'vitest';
import { normalizeEdibility, isDangerousEdibility } from '@/lib/utils/edibility';

describe('normalizeEdibility', () => {
  it('passes through the five known catalog values', () => {
    for (const v of ['edible', 'conditionally_edible', 'inedible', 'toxic', 'deadly'] as const) {
      expect(normalizeEdibility(v)).toBe(v);
    }
  });

  it('maps missing / unmapped / unknown values to "unknown" (never silently "inedible")', () => {
    expect(normalizeEdibility(undefined)).toBe('unknown');
    expect(normalizeEdibility(null)).toBe('unknown');
    expect(normalizeEdibility('')).toBe('unknown');
    expect(normalizeEdibility('unknown')).toBe('unknown');
    expect(normalizeEdibility('poisonous')).toBe('unknown'); // raw Kindwise value, not our key
    expect(normalizeEdibility('whatever')).toBe('unknown');
  });
});

describe('isDangerousEdibility (the safety gate for the AI identify flow)', () => {
  it('treats toxic, deadly AND unknown/missing as dangerous', () => {
    expect(isDangerousEdibility('toxic')).toBe(true);
    expect(isDangerousEdibility('deadly')).toBe(true);
    expect(isDangerousEdibility('unknown')).toBe(true);
    expect(isDangerousEdibility(undefined)).toBe(true);
    expect(isDangerousEdibility(null)).toBe(true);
    expect(isDangerousEdibility('mystery-species')).toBe(true);
  });

  it('does NOT escalate known non-poisonous values', () => {
    expect(isDangerousEdibility('edible')).toBe(false);
    expect(isDangerousEdibility('conditionally_edible')).toBe(false);
    expect(isDangerousEdibility('inedible')).toBe(false);
  });
});
