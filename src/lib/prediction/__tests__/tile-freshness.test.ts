import { describe, expect, it } from 'vitest';
import { assessTileFreshness, previousDate, withinCronGraceWindow } from '../tile-freshness';

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

/**
 * `tile_date` og cron-planen står begge i UTC. Cron-en kjører 01:15 UTC, så
 * mellom midnatt og da finnes det per definisjon ingen fliser for dagens dato.
 * Uten et vindu meldte ruta 503 «degraded» hver eneste natt — en falsk alarm på
 * ~76 minutter i døgnet, som ville gjort ekte alarmer verdiløse.
 */
describe('vinduet før nattens flisjobb', () => {
  it('regner gårsdagen ut riktig, også over månedsskiftet', () => {
    expect(previousDate('2026-08-01')).toBe('2026-07-31');
    expect(previousDate('2026-01-01')).toBe('2025-12-31');
    expect(previousDate('2026-03-01')).toBe('2026-02-28');
  });

  it('er inne i vinduet før cron-en rekker å kjøre', () => {
    expect(withinCronGraceWindow(new Date('2026-08-02T00:05:00Z'))).toBe(true);
    expect(withinCronGraceWindow(new Date('2026-08-02T01:14:00Z'))).toBe(true);
  });

  it('er ute av vinduet resten av døgnet', () => {
    expect(withinCronGraceWindow(new Date('2026-08-02T02:00:00Z'))).toBe(false);
    expect(withinCronGraceWindow(new Date('2026-08-02T12:00:00Z'))).toBe(false);
    expect(withinCronGraceWindow(new Date('2026-08-02T23:59:00Z'))).toBe(false);
  });

  it('melder IKKE degradert i vinduet når gårsdagens fliser finnes', () => {
    const result = assessTileFreshness(
      [
        { region: 'Oslo', tileDate: '2026-08-01', updatedAt: '2026-08-01T01:15:44Z' },
        { region: 'Bergen', tileDate: '2026-08-01', updatedAt: '2026-08-01T01:15:55Z' }
      ],
      '2026-08-02',
      previousDate('2026-08-02')
    );
    expect(result.fresh).toBe(true);
  });

  it('melder degradert utenfor vinduet med samme data', () => {
    const result = assessTileFreshness(
      [{ region: 'Oslo', tileDate: '2026-08-01', updatedAt: '2026-08-01T01:15:44Z' }],
      '2026-08-02',
      null
    );
    expect(result.fresh).toBe(false);
  });

  it('godtar ikke fliser som er eldre enn ett døgn, selv i vinduet', () => {
    const result = assessTileFreshness(
      [{ region: 'Oslo', tileDate: '2026-07-20', updatedAt: '2026-07-20T01:15:44Z' }],
      '2026-08-02',
      previousDate('2026-08-02')
    );
    expect(result.fresh).toBe(false);
  });

  it('godtar ikke en region helt uten fliser, selv i vinduet', () => {
    const result = assessTileFreshness(
      [{ region: 'Oslo', tileDate: null, updatedAt: null }],
      '2026-08-02',
      previousDate('2026-08-02')
    );
    expect(result.fresh).toBe(false);
  });
});
