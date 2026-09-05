import { describe, expect, it } from 'vitest';
import { bruksdagNokkel, erFlate, isoUke, osloDag } from '../bruksdag';

describe('osloDag', () => {
  it('bruker Oslo-dato, ikke UTC — 23:30Z i september er neste dag i Norge', () => {
    expect(osloDag(new Date('2026-09-05T23:30:00Z'))).toBe('2026-09-06');
    expect(osloDag(new Date('2026-09-05T21:59:00Z'))).toBe('2026-09-05');
  });

  it('vintertid: 23:30Z er fortsatt neste dag (CET = +1)', () => {
    expect(osloDag(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
});

describe('isoUke', () => {
  it('gir ISO-uke med år', () => {
    expect(isoUke('2026-09-06')).toBe('2026-W36'); // søndag i uke 36
    expect(isoUke('2026-09-07')).toBe('2026-W37'); // mandag → ny uke
  });

  it('håndterer årsskiftet etter ISO-reglene', () => {
    expect(isoUke('2027-01-01')).toBe('2026-W53');
    expect(isoUke('2026-01-01')).toBe('2026-W01');
  });
});

describe('erFlate', () => {
  it('godtar bare de tre flatene', () => {
    expect(erFlate('hjem')).toBe(true);
    expect(erFlate('kart')).toBe(true);
    expect(erFlate('omrade')).toBe(true);
    expect(erFlate('profil')).toBe(false);
    expect(erFlate(null)).toBe(false);
  });
});

describe('bruksdagNokkel', () => {
  it('er stabil per flate, område og dag', () => {
    expect(bruksdagNokkel('omrade', 'bergen', '2026-09-06')).toBe('mycelet:bruksdag:omrade:bergen:2026-09-06');
  });
});
