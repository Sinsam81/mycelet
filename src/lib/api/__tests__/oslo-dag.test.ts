import { describe, expect, it } from 'vitest';
import { osloIDag } from '../oslo-dag';

/**
 * Serveren går i UTC, leseren står i Norge eller Sverige. Mellom midnatt og
 * kl. 01 (vintertid) eller 02 (sommertid) er det to forskjellige dager.
 */
describe('osloIDag', () => {
  it('midt på dagen er det samme dag i Oslo som i UTC', () => {
    expect(osloIDag(new Date('2026-09-15T09:00:00Z'))).toEqual({ dato: '2026-09-15', maaned: 9, dagIManeden: 15 });
  });

  it('sommertid: kl. 00.30 i Oslo er det fortsatt i går i UTC', () => {
    // 22.30 UTC 14. august = 00.30 15. august i Oslo (UTC+2).
    expect(osloIDag(new Date('2026-08-14T22:30:00Z'))).toEqual({ dato: '2026-08-15', maaned: 8, dagIManeden: 15 });
    // Ett minutt før midnatt i Oslo er det fortsatt den 14.
    expect(osloIDag(new Date('2026-08-14T21:59:00Z')).dato).toBe('2026-08-14');
    expect(osloIDag(new Date('2026-08-14T22:00:00Z')).dato).toBe('2026-08-15');
  });

  it('vintertid: forskyvningen er én time, ikke to', () => {
    // 23.30 UTC 20. november = 00.30 21. november i Oslo (UTC+1).
    expect(osloIDag(new Date('2026-11-20T23:30:00Z'))).toEqual({ dato: '2026-11-21', maaned: 11, dagIManeden: 21 });
    // 22.30 UTC er 23.30 i Oslo — fortsatt den 20.
    expect(osloIDag(new Date('2026-11-20T22:30:00Z')).dato).toBe('2026-11-20');
  });

  it('månedsskiftet følger Oslo: 1. juni kl. 00.30 er juni, ikke mai', () => {
    // Mai er utenom sesongen, juni er i den — det er her en time feil synes.
    expect(osloIDag(new Date('2026-05-31T22:30:00Z'))).toEqual({ dato: '2026-06-01', maaned: 6, dagIManeden: 1 });
    expect(osloIDag(new Date('2026-10-31T23:30:00Z'))).toEqual({ dato: '2026-11-01', maaned: 11, dagIManeden: 1 });
  });

  it('årsskiftet følger Oslo', () => {
    expect(osloIDag(new Date('2026-12-31T23:10:00Z'))).toEqual({ dato: '2027-01-01', maaned: 1, dagIManeden: 1 });
  });

  it('dagen i måneden er et tall uten ledende null', () => {
    expect(osloIDag(new Date('2026-07-05T12:00:00Z')).dagIManeden).toBe(5);
  });
});
