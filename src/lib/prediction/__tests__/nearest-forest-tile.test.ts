import { describe, expect, it } from 'vitest';
import { nearestForestTile } from '../nearest-forest-tile';

const skog = (forestType: string) => ({ forest: { forestType, productivity: null, volumePerHa: null, source: 'sr16' } });

describe('nearestForestTile', () => {
  it('velger nærmeste flis med skogdata, ikke den med høyest score', () => {
    const tiles = [
      { center_lat: 59.78, center_lng: 10.65, score: 60, components: skog('gran') },
      { center_lat: 59.9, center_lng: 10.78, score: 31, components: skog('lauv') }
    ];
    const naermest = nearestForestTile(tiles, 59.91, 10.75);
    expect(naermest?.tile.components.forest.forestType).toBe('lauv');
  });

  it('regner ut avstanden — 59,78/10,65 ligger 15,5 km fra Oslo sentrum', () => {
    const tiles = [{ center_lat: 59.78, center_lng: 10.65, score: 60, components: skog('gran') }];
    const naermest = nearestForestTile(tiles, 59.91, 10.75);
    expect(naermest?.distanceKm).toBeGreaterThan(15);
    expect(naermest?.distanceKm).toBeLessThan(16);
  });

  it('hopper over fliser uten skogdata, uansett hvor nær de ligger', () => {
    const tiles = [
      { center_lat: 59.911, center_lng: 10.751, score: 20, components: { forest: null } },
      { center_lat: 59.85, center_lng: 10.7, score: 10, components: skog('furu') }
    ];
    const naermest = nearestForestTile(tiles, 59.91, 10.75);
    expect(naermest?.tile.components.forest?.forestType).toBe('furu');
  });

  it('gir null når ingen flis har skogdata', () => {
    const tiles = [{ center_lat: 59.911, center_lng: 10.751, score: 20, components: { forest: null } }];
    expect(nearestForestTile(tiles, 59.91, 10.75)).toBeNull();
  });

  it('måler avstanden til punktet skogen er målt i, ikke til midtpunktet', () => {
    // Midtpunktet 59,84/10,71 ligger i fjorden; nattjobben fant skogen i
    // kvadrantsenteret 59,825/10,695 og skrev punktet i metadata.
    const forskjovet = {
      center_lat: 59.84,
      center_lng: 10.71,
      score: 40,
      components: skog('lauv'),
      metadata: { skogprove_lat: 59.825, skogprove_lng: 10.695 }
    };
    const naermest = nearestForestTile([forskjovet], 59.84, 10.71);
    // 0,015° nord–sør og 0,015° øst–vest på 59,8° N ≈ 1,9 km.
    expect(naermest?.distanceKm).toBeGreaterThan(1.8);
    expect(naermest?.distanceKm).toBeLessThan(2);
  });

  it('bruker midtpunktet for fliser uten prøvepunkt (generert før regelen)', () => {
    const gammel = { center_lat: 59.84, center_lng: 10.71, score: 40, components: skog('lauv'), metadata: { region: 'Oslo' } };
    const utenMetadata = { center_lat: 59.84, center_lng: 10.71, score: 40, components: skog('lauv'), metadata: null };
    expect(nearestForestTile([gammel], 59.84, 10.71)?.distanceKm).toBe(0);
    expect(nearestForestTile([utenMetadata], 59.84, 10.71)?.distanceKm).toBe(0);
  });

  it('gir null for tom liste', () => {
    expect(nearestForestTile([], 59.91, 10.75)).toBeNull();
  });

  it('velger samme flis hver gang når to ligger like langt unna', () => {
    const tiles = [
      { center_lat: 60.0, center_lng: 10.75, score: 5, components: skog('gran') },
      { center_lat: 59.82, center_lng: 10.75, score: 90, components: skog('lauv') }
    ];
    const forste = nearestForestTile(tiles, 59.91, 10.75);
    const andre = nearestForestTile(tiles, 59.91, 10.75);
    expect(forste?.tile.center_lat).toBe(andre?.tile.center_lat);
  });
});
