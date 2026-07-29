import { describe, expect, it } from 'vitest';
import { buildWeatherSnapshot, deriveHabitatTags } from '../field-context';
import { parseFindingRequest } from '../request';

describe('field context', () => {
  it('derives stable training tags from real forest properties', () => {
    expect(
      deriveHabitatTags({
        forestType: 'gran',
        ageYears: 95,
        productivity: 18,
        volumePerHa: 220,
        source: 'sr16'
      })
    ).toEqual(['granskog', 'gammelskog', 'hoy_bonitet']);
  });

  it('captures provider weather together with snapshot time', () => {
    expect(
      buildWeatherSnapshot(
        {
          source: 'smhi',
          temperatureC: 14,
          humidityPct: 83,
          rain3dMm: 9,
          rain7dMm: 20,
          rain14dMm: 30,
          minTemp7dC: 7,
          maxTemp7dC: 18,
          soilMoistureIndex: 0.7
        },
        '2026-07-14T10:00:00.000Z'
      )
    ).toMatchObject({ source: 'smhi', capturedAt: '2026-07-14T10:00:00.000Z' });
  });
});

describe('parseFindingRequest', () => {
  it('accepts a privacy-masked negative field observation and removes images', () => {
    const result = parseFindingRequest({
      latitude: 59.91,
      longitude: 10.75,
      speciesId: 1,
      notes: 'Lette i en time',
      visibility: 'approximate',
      imageUrl: 'https://example.com/old.jpg',
      thumbnailUrl: 'https://example.com/old.jpg',
      isNegativeObservation: true,
      isZoneFinding: false
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.imageUrl).toBeNull();
      expect(result.data.isNegativeObservation).toBe(true);
    }
  });

  it('rejects invalid coordinates and unsafe image URLs', () => {
    expect(parseFindingRequest({ latitude: 200, longitude: 10, visibility: 'private' }).success).toBe(false);
    expect(
      parseFindingRequest({
        latitude: 60,
        longitude: 10,
        visibility: 'private',
        imageUrl: 'javascript:alert(1)'
      }).success
    ).toBe(false);
  });

  it('requires coarse visibility and a label for zone findings', () => {
    expect(
      parseFindingRequest({
        latitude: 60,
        longitude: 10,
        visibility: 'public',
        isZoneFinding: true,
        zoneLabel: 'Nordmarka'
      }).success
    ).toBe(false);
  });
});
