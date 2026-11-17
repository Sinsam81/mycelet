import { describe, expect, it } from 'vitest';
import { Hentefeil, skalProveIgjen } from '../hentefeil';

describe('skalProveIgjen', () => {
  it('nettverksfeil og 5xx: så mange nye forsøk som kortet tillater, ikke flere', () => {
    for (const feil of [new TypeError('Failed to fetch'), new Hentefeil('Prognosen', 500), new Hentefeil('Prognosen', 504)]) {
      expect(skalProveIgjen(0, feil, 1)).toBe(true);
      expect(skalProveIgjen(1, feil, 1)).toBe(false);
      expect(skalProveIgjen(1, feil, 2)).toBe(true);
      expect(skalProveIgjen(2, feil, 2)).toBe(false);
    }
  });

  it('4xx: aldri — ruta har sagt nei, og et forsøk til gjør bare køen lengre', () => {
    for (const status of [400, 401, 404, 429]) {
      expect(skalProveIgjen(0, new Hentefeil('Prognosen', status), 2)).toBe(false);
    }
  });

  it('null nye forsøk betyr ingen', () => {
    expect(skalProveIgjen(0, new TypeError('Failed to fetch'), 0)).toBe(false);
  });

  it('feilen bærer statusen og sier hva som svarte', () => {
    const feil = new Hentefeil('Områdelista', 503);
    expect(feil.status).toBe(503);
    expect(feil.message).toBe('Områdelista svarte 503');
    expect(feil).toBeInstanceOf(Error);
  });
});
