import { describe, expect, it } from 'vitest';
import { VisbarFeil, visbarTekst } from '../visbar-feil';

describe('visbarTekst', () => {
  it('viser meldingen til en VisbarFeil', () => {
    expect(visbarTekst(new VisbarFeil('Kunne ikke slette funnet'), 'reserve')).toBe('Kunne ikke slette funnet');
  });

  it('gir reserven for en vanlig feil — den kan være nettleserens engelske tekst', () => {
    expect(visbarTekst(new TypeError('Load failed'), 'reserve')).toBe('reserve');
    expect(visbarTekst(new Error('duplicate key value violates unique constraint'), 'reserve')).toBe('reserve');
  });

  it('gir reserven for en tom VisbarFeil og for alt som ikke er en feil', () => {
    expect(visbarTekst(new VisbarFeil('  '), 'reserve')).toBe('reserve');
    expect(visbarTekst('streng', 'reserve')).toBe('reserve');
    expect(visbarTekst(null, 'reserve')).toBe('reserve');
    expect(visbarTekst(undefined, 'reserve')).toBe('reserve');
  });

  it('leser merket, ikke klassen — en kopi av modulen i en annen React-rot teller også', () => {
    const kopi = Object.assign(new Error('Fra en annen kopi'), { visbar: true });
    expect(visbarTekst(kopi, 'reserve')).toBe('Fra en annen kopi');
  });
});
