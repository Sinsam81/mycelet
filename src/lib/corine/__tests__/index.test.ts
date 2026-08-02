import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCorineForest } from '@/lib/corine';

/**
 * CORINE-adapteren er Sveriges eneste skogskilde (Norge bruker SR16), så et
 * feiltolket svar herfra betyr «ingen skog» i et skogsområde — og da hopper
 * rutenettet over cella og brukeren får «fant ingen lovende steder».
 */
function mockIdentify(results: Array<Record<string, string>>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ results: results.map((attributes) => ({ attributes })) })
    })) as unknown as typeof fetch
  );
}

const RISVEDEN = { lat: 57.98, lon: 12.28 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getCorineForest', () => {
  it('picks the forest class even when a non-forest class comes first', async () => {
    // Ekte svar fra EEA for Risveden (57.98/12.28) med kodens egen
    // tolerance=2: åker først, barskog etterpå — samme punkt.
    mockIdentify([{ Code_18: '211' }, { Code_18: '312' }, { Code_18: '313' }]);

    const result = await getCorineForest(RISVEDEN);

    expect(result?.forestType).toBe('bar');
    expect(result?.source).toBe('corine');
  });

  it('still reports no forest signal when no hit is a forest class', async () => {
    mockIdentify([{ Code_18: '211' }, { Code_18: '512' }]);

    expect(await getCorineForest(RISVEDEN)).toBeNull();
  });

  it('reads the plain single-hit case unchanged', async () => {
    mockIdentify([{ Code_18: '311' }]);

    expect((await getCorineForest(RISVEDEN))?.forestType).toBe('lauv');
  });

  it('returns null when the response has no land-cover code at all', async () => {
    mockIdentify([{}]);

    expect(await getCorineForest(RISVEDEN)).toBeNull();
  });
});
