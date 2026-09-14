import { describe, expect, it } from 'vitest';
import { INTRO_IKKE_KVALIFISERT, dagerFraIsoPeriode, lesProve, proveDagerFra } from '../iap-prove';

/**
 * «7 dager gratis» skal bare loves når App Store faktisk gir gratisuka.
 * Et løfte som ender i en belastning på dag én er en refusjon i vente.
 */
describe('lesProve', () => {
  const gratisUke = { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1, cycles: 1, period: 'P1W' };

  it('gratis uke i butikken → harProve med 7 dager', () => {
    expect(lesProve(gratisUke)).toEqual({ harProve: true, proveDager: 7 });
  });

  it('ingen introPrice → ingen gratisuke', () => {
    expect(lesProve(null)).toEqual({ harProve: false, proveDager: null });
    expect(lesProve(undefined)).toEqual({ harProve: false, proveDager: null });
  });

  it('introtilbud med pris er en rabatt, ikke en gratisuke', () => {
    expect(lesProve({ ...gratisUke, price: 29 })).toEqual({ harProve: false, proveDager: null });
  });

  it('Apple-ID som ikke kvalifiserer får ikke løftet, selv om tilbudet finnes', () => {
    expect(lesProve(gratisUke, INTRO_IKKE_KVALIFISERT)).toEqual({ harProve: false, proveDager: null });
  });

  it('ukjent kvalifisering (0) og kvalifisert (2) beholder løftet', () => {
    expect(lesProve(gratisUke, 0).harProve).toBe(true);
    expect(lesProve(gratisUke, 2).harProve).toBe(true);
    expect(lesProve(gratisUke, null).harProve).toBe(true);
  });

  it('kjenner ikke lengden når verken enhet eller ISO-periode kan leses', () => {
    expect(lesProve({ price: 0, periodUnit: 'FORTNIGHT', period: 'ukjent' })).toEqual({ harProve: true, proveDager: null });
  });
});

describe('proveDagerFra / dagerFraIsoPeriode', () => {
  it('regner dager fra enhet, og faller tilbake på ISO-perioden', () => {
    expect(proveDagerFra({ price: 0, periodUnit: 'DAY', periodNumberOfUnits: 3 })).toBe(3);
    expect(proveDagerFra({ price: 0, periodUnit: 'month', periodNumberOfUnits: 1 })).toBe(30);
    expect(proveDagerFra({ price: 0, period: 'P2W' })).toBe(14);
    expect(proveDagerFra({ price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1, cycles: 2 })).toBe(14);
  });

  it('ISO-perioder', () => {
    expect(dagerFraIsoPeriode('P1W')).toBe(7);
    expect(dagerFraIsoPeriode('p3d')).toBe(3);
    expect(dagerFraIsoPeriode('P1Y')).toBe(365);
    expect(dagerFraIsoPeriode('P1W2D')).toBeNull();
    expect(dagerFraIsoPeriode('')).toBeNull();
    expect(dagerFraIsoPeriode(null)).toBeNull();
  });
});
