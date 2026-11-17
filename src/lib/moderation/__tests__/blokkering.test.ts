import { describe, expect, it } from 'vitest';
import { utenBlokkerte } from '../blokkering';

describe('utenBlokkerte', () => {
  const funn = [
    { id: '1', user_id: 'anna' },
    { id: '2', user_id: 'bjorn' },
    { id: '3', user_id: 'anna' },
    { id: '4', user_id: null }
  ];

  it('tar ut alt fra blokkerte brukere og beholder rekkefølgen', () => {
    expect(utenBlokkerte(funn, ['anna']).map((f) => f.id)).toEqual(['2', '4']);
    expect(utenBlokkerte(funn, new Set(['bjorn'])).map((f) => f.id)).toEqual(['1', '3', '4']);
  });

  it('tom blokkeringsliste endrer ingenting, og innlista muteres ikke', () => {
    const ut = utenBlokkerte(funn, []);
    expect(ut).toEqual(funn);
    expect(ut).not.toBe(funn);
  });

  it('rader uten eier blir stående', () => {
    expect(utenBlokkerte([{ id: 'x' }, { id: 'y', user_id: null }], ['anna'])).toHaveLength(2);
  });
});
