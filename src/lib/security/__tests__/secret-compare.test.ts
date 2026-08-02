import { describe, expect, it } from 'vitest';
import { bearerSecretMatches, secretsMatch } from '../secret-compare';

describe('secretsMatch', () => {
  it('godtar identiske hemmeligheter', () => {
    expect(secretsMatch('cron-hemmelighet', 'cron-hemmelighet')).toBe(true);
  });

  it('avviser feil hemmelighet, også når bare siste tegn skiller', () => {
    expect(secretsMatch('cron-hemmelighet', 'cron-hemmelighex')).toBe(false);
  });

  it('avviser når hemmeligheten har ulik lengde (uten å kaste)', () => {
    expect(secretsMatch('kort', 'en mye lengre hemmelighet')).toBe(false);
    expect(secretsMatch('en mye lengre hemmelighet', 'kort')).toBe(false);
  });

  it('feiler lukket når ingen hemmelighet er konfigurert', () => {
    expect(secretsMatch('hva som helst', undefined)).toBe(false);
    expect(secretsMatch('hva som helst', '')).toBe(false);
    expect(secretsMatch('hva som helst', null)).toBe(false);
  });

  it('avviser manglende header uten å kaste', () => {
    expect(secretsMatch(null, 'hemmelighet')).toBe(false);
    expect(secretsMatch(undefined, 'hemmelighet')).toBe(false);
  });
});

describe('bearerSecretMatches', () => {
  it('godtar riktig Bearer-header', () => {
    expect(bearerSecretMatches('Bearer abc123', 'abc123')).toBe(true);
  });

  it('avviser riktig hemmelighet uten Bearer-prefiks', () => {
    expect(bearerSecretMatches('abc123', 'abc123')).toBe(false);
  });

  it('avviser feil hemmelighet og manglende header', () => {
    expect(bearerSecretMatches('Bearer feil', 'abc123')).toBe(false);
    expect(bearerSecretMatches(null, 'abc123')).toBe(false);
  });

  it('feiler lukket uten konfigurert hemmelighet', () => {
    expect(bearerSecretMatches('Bearer ', undefined)).toBe(false);
  });
});
