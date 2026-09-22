import { describe, expect, it } from 'vitest';
import { formaterFornyelsesdag, fornyelsesTekst, fornyelsesdag, forsteBelastningsTekst, forsteBelastningsdag } from '../fornyelse';

/**
 * Datoene arket og prissiden lover er den ene tingen som må stemme til
 * punkt og prikke: «fra ca. 29. september 2026 koster passet 249 kr» er et
 * løfte om når pengene trekkes første gang, og «fornyes ca. 29. september
 * 2027» om når de trekkes neste gang.
 */
describe('forsteBelastningsdag', () => {
  it('kjøpsdagen pluss prøvedagene — uten prøve er det kjøpsdagen', () => {
    expect(forsteBelastningsdag('2026-09-22', 7)).toBe('2026-09-29');
    expect(forsteBelastningsdag('2026-09-22')).toBe('2026-09-22');
    expect(forsteBelastningsdag('2026-09-22', 0)).toBe('2026-09-22');
  });

  it('over månedsskifte og nyttår', () => {
    expect(forsteBelastningsdag('2026-09-27', 7)).toBe('2026-10-04');
    expect(forsteBelastningsdag('2026-12-28', 7)).toBe('2027-01-04');
    expect(forsteBelastningsdag('2028-02-25', 7)).toBe('2028-03-03');
  });

  it('negative eller ugyldige prøvedager regnes som ingen', () => {
    expect(forsteBelastningsdag('2026-09-22', -3)).toBe('2026-09-22');
    expect(forsteBelastningsdag('2026-09-22', Number.NaN)).toBe('2026-09-22');
    expect(forsteBelastningsdag('i dag', 7)).toBe('i dag');
  });
});

describe('fornyelsesdag', () => {
  it('sesongpasset fornyes om ett år, Premium om én måned', () => {
    expect(fornyelsesdag('2026-09-22', 'season_pass')).toBe('2027-09-22');
    expect(fornyelsesdag('2026-09-22', 'premium')).toBe('2026-10-22');
  });

  it('med gratisuke regnes året og måneden fra første belastning, ikke fra kjøpsdagen', () => {
    // Stripe fakturerer ved trial_end (22. sep + 7 = 29. sep) og det betalte året løper derfra.
    expect(fornyelsesdag('2026-09-22', 'season_pass', 7)).toBe('2027-09-29');
    expect(fornyelsesdag('2026-09-22', 'premium', 7)).toBe('2026-10-29');
    // Prøveuka krysser månedsskiftet: 27. sep + 7 = 4. okt → 4. nov / 4. okt 2027.
    expect(fornyelsesdag('2026-09-27', 'premium', 7)).toBe('2026-11-04');
    expect(fornyelsesdag('2026-09-27', 'season_pass', 7)).toBe('2027-10-04');
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
    expect(fornyelsesdag('i dag', 'season_pass', 7)).toBe('i dag');
  });
});

describe('formaterFornyelsesdag', () => {
  it('norsk: «ca. 22. september 2027»', () => {
    expect(formaterFornyelsesdag('2027-09-22', 'nb')).toBe('ca. 22. september 2027');
  });

  it('svensk: «ca 22 september 2027» — «ca» uten punktum, og uten punktum etter dagen', () => {
    expect(formaterFornyelsesdag('2027-09-22', 'sv')).toBe('ca 22 september 2027');
  });

  it('samme dag uansett tidssone — datoen formateres som en dag, ikke et tidspunkt', () => {
    expect(formaterFornyelsesdag('2027-01-01', 'nb')).toBe('ca. 1. januar 2027');
    expect(formaterFornyelsesdag('2027-01-01', 'sv')).toBe('ca 1 januari 2027');
  });
});

describe('fornyelsesTekst og forsteBelastningsTekst', () => {
  it('regner fra Oslo-datoen «i dag» — også når UTC fortsatt er dagen før', () => {
    // 23:30 UTC 22. sep = 01:30 23. sep i Oslo: passet kjøpt «i dag» fornyes 23. sep 2027.
    const naa = new Date('2026-09-22T23:30:00Z');
    expect(fornyelsesTekst('season_pass', 'nb', 0, naa)).toBe('ca. 23. september 2027');
    expect(fornyelsesTekst('premium', 'sv', 0, naa)).toBe('ca 23 oktober 2026');
  });

  it('med gratisuke: første belastning om sju dager, fornyelsen ett år / én måned etter den', () => {
    const naa = new Date('2026-09-22T12:00:00Z');
    expect(forsteBelastningsTekst(7, 'nb', naa)).toBe('ca. 29. september 2026');
    expect(forsteBelastningsTekst(7, 'sv', naa)).toBe('ca 29 september 2026');
    expect(fornyelsesTekst('season_pass', 'nb', 7, naa)).toBe('ca. 29. september 2027');
    expect(fornyelsesTekst('premium', 'nb', 7, naa)).toBe('ca. 29. oktober 2026');
  });
});
