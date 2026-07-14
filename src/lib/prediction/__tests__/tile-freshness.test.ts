import { describe, expect, it } from 'vitest';
import { assessTileFreshness } from '../tile-freshness';

describe('assessTileFreshness', () => {
  it('is fresh only when every configured region has tiles for the expected date', () => {
    const result = assessTileFreshness(
      [
        { region: 'Oslo', tileDate: '2026-07-14', updatedAt: '2026-07-14T01:00:00Z' },
        { region: 'Bergen', tileDate: '2026-07-14', updatedAt: '2026-07-14T01:01:00Z' }
      ],
      '2026-07-14'
    );

    expect(result.fresh).toBe(true);
    expect(result.regions.every((region) => region.fresh)).toBe(true);
  });

  it('reports missing, stale, and failed regions without hiding the cause', () => {
    const result = assessTileFreshness(
      [
        { region: 'Oslo', tileDate: '2026-07-13', updatedAt: '2026-07-13T01:00:00Z' },
        { region: 'Bergen', tileDate: null, updatedAt: null },
        { region: 'Innlandet', tileDate: null, updatedAt: null, error: 'database unavailable' }
      ],
      '2026-07-14'
    );

    expect(result.fresh).toBe(false);
    expect(result.regions).toEqual([
      expect.objectContaining({ region: 'Oslo', fresh: false }),
      expect.objectContaining({ region: 'Bergen', fresh: false }),
      expect.objectContaining({ region: 'Innlandet', fresh: false, error: 'database unavailable' })
    ]);
  });

  it('does not treat an empty configuration as healthy', () => {
    expect(assessTileFreshness([], '2026-07-14').fresh).toBe(false);
  });
});
