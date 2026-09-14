import { describe, expect, it } from 'vitest';
import {
  HUSKET_POSISJON_LEVETID_MS,
  grovPosisjon,
  nyHusketPosisjon,
  sammeRute,
  tolkHusketPosisjon
} from '../husket-posisjon';

const NAA = 1_800_000_000_000;
const gyldig = { lat: 60.39, lng: 5.32, ts: NAA - 1000 };

describe('tolkHusketPosisjon', () => {
  it('gir tilbake det som ble lagret', () => {
    expect(tolkHusketPosisjon(JSON.stringify(gyldig), NAA)).toEqual(gyldig);
  });

  it('husker i sju dager — deretter er standardområdet et ærligere utgangspunkt', () => {
    const grense = { ...gyldig, ts: NAA - HUSKET_POSISJON_LEVETID_MS };
    expect(tolkHusketPosisjon(JSON.stringify(grense), NAA)).toEqual(grense);
    expect(tolkHusketPosisjon(JSON.stringify({ ...gyldig, ts: NAA - HUSKET_POSISJON_LEVETID_MS - 1 }), NAA)).toBeNull();
  });

  it('forkaster et tidspunkt fra framtida — en telefon med feil klokke skal ikke gi evig levetid', () => {
    expect(tolkHusketPosisjon(JSON.stringify({ ...gyldig, ts: NAA + 3600_000 }), NAA)).toBeNull();
  });

  it('forkaster søppel og punkter utenfor kloden — ingen NaN videre til prognosen', () => {
    expect(tolkHusketPosisjon('ikke json', NAA)).toBeNull();
    expect(tolkHusketPosisjon(null, NAA)).toBeNull();
    expect(tolkHusketPosisjon(undefined, NAA)).toBeNull();
    expect(tolkHusketPosisjon('null', NAA)).toBeNull();
    expect(tolkHusketPosisjon('[1,2]', NAA)).toBeNull();
    expect(tolkHusketPosisjon(JSON.stringify({ ...gyldig, lat: 95 }), NAA)).toBeNull();
    expect(tolkHusketPosisjon(JSON.stringify({ ...gyldig, lng: 'øst' }), NAA)).toBeNull();
    expect(tolkHusketPosisjon(JSON.stringify({ lat: 60, lng: 5 }), NAA)).toBeNull();
    expect(tolkHusketPosisjon(JSON.stringify({ ...gyldig, ts: 'i går' }), NAA)).toBeNull();
  });
});

describe('nyHusketPosisjon', () => {
  it('lagrer grovkornet (~1 km), aldri meterpresis GPS', () => {
    expect(nyHusketPosisjon(60.391234, 5.327891, NAA)).toEqual({ lat: 60.39, lng: 5.33, ts: NAA });
  });

  it('overlever en runde gjennom JSON', () => {
    const lagret = nyHusketPosisjon(59.9139, 10.7522, NAA - 5000);
    expect(tolkHusketPosisjon(JSON.stringify(lagret), NAA)).toEqual(lagret);
  });
});

describe('grovPosisjon og sammeRute', () => {
  it('to desimaler', () => {
    expect(grovPosisjon(59.91391, 10.75225)).toEqual({ lat: 59.91, lng: 10.75 });
  });

  it('samme rute betyr samme forespørsel til prognosen', () => {
    expect(sammeRute({ lat: 59.9139, lng: 10.7522 }, { lat: 59.9101, lng: 10.7549 })).toBe(true);
    expect(sammeRute({ lat: 59.9139, lng: 10.7522 }, { lat: 59.92, lng: 10.7522 })).toBe(false);
  });
});
