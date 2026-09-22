import { describe, expect, it } from 'vitest';
import { formaterFornyelsesdag, fornyelsesTekst, fornyelsesdag } from '../fornyelse';

/**
 * Datoen arket og prissiden lover er den ene tingen som må stemme til
 * punkt og prikke: «fornyes ca. 22. september 2027» er et løfte om når
 * pengene trekkes neste gang.
 */
describe('fornyelsesdag', () => {
  it('sesongpasset fornyes om ett år, Premium om én måned', () => {
    expect(fornyelsesdag('2026-09-22', 'season_pass')).toBe('2027-09-22');
    expect(fornyelsesdag('2026-09-22', 'premium')).toBe('2026-10-22');
  });

  it('en måned fram over nyttår', () => {
    expect(fornyelsesdag('2026-12-15', 'premium')).toBe('2027-01-15');
    expect(fornyelsesdag('2026-12-31', 'premium')).toBe('2027-01-31');
  });

  it('skuddag: 29. februar ett år fram blir 28. februar', () => {
    expect(fornyelsesdag('2028-02-29', 'season_pass')).toBe('2029-02-28');
    expect(fornyelsesdag('2027-02-28', 'season_pass')).toBe('2028-02-28');
  });

  it('månedslengder: 31. januar én måned fram er siste dag i februar', () => {
    expect(fornyelsesdag('2027-01-31', 'premium')).toBe('2027-02-28');
    expect(fornyelsesdag('2028-01-31', 'premium')).toBe('2028-02-29');
    expect(fornyelsesdag('2026-10-31', 'premium')).toBe('2026-11-30');
    expect(fornyelsesdag('2026-08-31', 'premium')).toBe('2026-09-30');
  });

  it('ugyldig inndata gis tilbake uendret i stedet for å kaste midt i et salg', () => {
    expect(fornyelsesdag('i dag', 'season_pass')).toBe('i dag');
  });
});

describe('formaterFornyelsesdag', () => {
  it('norsk: «ca. 22. september 2027»', () => {
    expect(formaterFornyelsesdag('2027-09-22', 'nb')).toBe('ca. 22. september 2027');
  });

  it('svensk: «ca. 22 september 2027» — uten punktum etter dagen', () => {
    expect(formaterFornyelsesdag('2027-09-22', 'sv')).toBe('ca. 22 september 2027');
  });

  it('samme dag uansett tidssone — datoen formateres som en dag, ikke et tidspunkt', () => {
    expect(formaterFornyelsesdag('2027-01-01', 'nb')).toBe('ca. 1. januar 2027');
    expect(formaterFornyelsesdag('2027-01-01', 'sv')).toBe('ca. 1 januari 2027');
  });
});

describe('fornyelsesTekst', () => {
  it('regner fra Oslo-datoen «i dag» — også når UTC fortsatt er dagen før', () => {
    // 23:30 UTC 22. sep = 01:30 23. sep i Oslo: passet kjøpt «i dag» fornyes 23. sep 2027.
    const naa = new Date('2026-09-22T23:30:00Z');
    expect(fornyelsesTekst('season_pass', 'nb', naa)).toBe('ca. 23. september 2027');
    expect(fornyelsesTekst('premium', 'sv', naa)).toBe('ca. 23 oktober 2026');
  });
});
