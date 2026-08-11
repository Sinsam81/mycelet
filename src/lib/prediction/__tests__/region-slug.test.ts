import { describe, expect, it } from 'vitest';
import { PREDICTION_TILE_REGIONS } from '../tile-regions';
import { alleRegionSlugs, regionFromSlug, regionSlug } from '../region-slug';

/**
 * Slugene er offentlige URL-er (sitemap + delte lenker). Denne testen låser
 * dem: en endring i avledningen som flytter en eneste side, skal feile her —
 * ikke oppdages i Google Search Console tre uker senere.
 */

describe('regionSlug', () => {
  it('fjerner diakritika slik lenkene faktisk skrives', () => {
    expect(regionSlug('Ålesund')).toBe('alesund');
    expect(regionSlug('Tromsø')).toBe('tromso');
    expect(regionSlug('Bodø')).toBe('bodo');
    expect(regionSlug('Östersund')).toBe('ostersund');
    expect(regionSlug('Göteborg')).toBe('goteborg');
    expect(regionSlug('Växjö')).toBe('vaxjo');
    expect(regionSlug('Jönköping')).toBe('jonkoping');
    expect(regionSlug('Malmö')).toBe('malmo');
    expect(regionSlug('Umeå')).toBe('umea');
  });

  it('gir kun url-trygge tegn', () => {
    for (const r of PREDICTION_TILE_REGIONS) {
      expect(regionSlug(r.name)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('gir en unik slug per region', () => {
    const slugs = PREDICTION_TILE_REGIONS.map((r) => regionSlug(r.name));
    expect(new Set(slugs).size).toBe(PREDICTION_TILE_REGIONS.length);
  });

  it('finner regionen tilbake fra slugen', () => {
    for (const r of PREDICTION_TILE_REGIONS) {
      expect(regionFromSlug(regionSlug(r.name))?.name).toBe(r.name);
    }
  });

  it('svarer null for ukjente slugs i stedet for å kaste', () => {
    expect(regionFromSlug('atlantis')).toBeNull();
    expect(regionFromSlug('')).toBeNull();
  });

  it('alleRegionSlugs dekker hele regionlista', () => {
    expect(alleRegionSlugs()).toHaveLength(PREDICTION_TILE_REGIONS.length);
  });

  it('landfilteret deler lista riktig', () => {
    const no = alleRegionSlugs('NO');
    const se = alleRegionSlugs('SE');
    expect(no.length + se.length).toBe(PREDICTION_TILE_REGIONS.length);
    expect(no).toContain('oslo');
    expect(no).not.toContain('goteborg');
    expect(se).toContain('goteborg');
  });
});
