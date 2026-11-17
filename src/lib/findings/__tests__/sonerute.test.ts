import { describe, expect, it } from 'vitest';
import {
  rundAvSomPostgres,
  SONERUTE_TOLERANSE_GRADER,
  sonerute042,
  sonerute075,
  stempletMed075
} from '../sonerute';

/**
 * Det sonevakta bygger på: kan vi skille et punkt stemplet av 075 fra et
 * stemplet av den gamle triggeren, uten å la flyttallsstøy mellom Postgres og
 * JavaScript gjøre et trygt punkt «utrygt» — eller omvendt?
 */

/** Fast frø: samme tall hver gang, på hver maskin. */
function tilfeldig(fro: number): () => number {
  let tilstand = fro >>> 0;
  return () => {
    tilstand = (Math.imul(tilstand, 1664525) + 1013904223) >>> 0;
    return tilstand / 2 ** 32;
  };
}

/** Hele verden, begge halvkuler, men utenfor polkappene der cos klemmes. */
function punkt(neste: () => number) {
  return {
    lat: -75 + neste() * 150,
    lng: -179 + neste() * 358,
    km: 1 + Math.floor(neste() * 50)
  };
}

/** Et nordisk punkt og en størrelse fra glidebryteren. */
function nordisk(neste: () => number) {
  return { lat: 55 + neste() * 16.2, lng: 4.5 + neste() * 26.5, km: 1 + Math.floor(neste() * 15) };
}

/** Ett siste-siffer-steg opp eller ned — det Postgres og V8 kan skille på. */
function nesteDouble(x: number, retning: 1 | -1): number {
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  const bits = buf.getBigInt64(0);
  buf.setBigInt64(0, bits + BigInt(x >= 0 ? retning : -retning));
  return buf.getFloat64(0);
}

function rad(lat: number, lng: number, km: number, vist: { lat: number; lng: number }) {
  return { latitude: lat, longitude: lng, zone_precision_km: km, display_latitude: vist.lat, display_longitude: vist.lng };
}

describe('rundAvSomPostgres — rint(), halv til partall', () => {
  it('runder halve til nærmeste partall på begge sider av null', () => {
    expect(rundAvSomPostgres(2.5)).toBe(2);
    expect(rundAvSomPostgres(3.5)).toBe(4);
    expect(rundAvSomPostgres(-2.5)).toBe(-2);
    expect(rundAvSomPostgres(-3.5)).toBe(-4);
    expect(rundAvSomPostgres(0.5)).toBe(0);
    expect(rundAvSomPostgres(-0.5)).toBe(-0);
  });

  it('runder alt annet som Math.round', () => {
    for (const x of [2.4999, 2.5001, -2.4999, -2.5001, 0, 7, -7, 1e6 + 0.3]) {
      expect(rundAvSomPostgres(x)).toBe(Math.round(x));
    }
  });
});

describe('stempletMed075', () => {
  it('godtar punktet 075 gir, over hele kloden og for alle størrelser 1–50 km', () => {
    const neste = tilfeldig(1);
    let avvist = 0;
    for (let i = 0; i < 20_000; i += 1) {
      const { lat, lng, km } = punkt(neste);
      if (!stempletMed075(rad(lat, lng, km, sonerute075(lat, lng, km)))) avvist += 1;
    }
    expect(avvist).toBe(0);
  });

  /**
   * Postgres og V8 kan skille i siste bit på stegene og på cos. Et punkt som er
   * et par siste-siffer-steg unna, er det samme punktet.
   */
  it('godtar flyttallsstøy på størrelse med det Postgres og JavaScript skiller på', () => {
    const neste = tilfeldig(2);
    let avvist = 0;
    for (let i = 0; i < 5_000; i += 1) {
      const { lat, lng, km } = punkt(neste);
      const v = sonerute075(lat, lng, km);
      let stoyLat = v.lat;
      let stoyLng = v.lng;
      for (let n = 0; n < 4; n += 1) {
        stoyLat = nesteDouble(stoyLat, 1);
        stoyLng = nesteDouble(stoyLng, -1);
      }
      if (!stempletMed075(rad(lat, lng, km, { lat: stoyLat, lng: stoyLng }))) avvist += 1;
      // Og en relativ feil på 1e-14 — mange ganger mer enn noen av dem gir.
      if (!stempletMed075(rad(lat, lng, km, { lat: v.lat * (1 + 1e-14), lng: v.lng * (1 - 1e-14) }))) avvist += 1;
    }
    expect(avvist).toBe(0);
  });

  it('avviser punktet den gamle triggeren gir, for nordiske funn', () => {
    const neste = tilfeldig(3);
    let godtatt = 0;
    for (let i = 0; i < 20_000; i += 1) {
      const { lat, lng, km } = nordisk(neste);
      if (stempletMed075(rad(lat, lng, km, sonerute042(lat, lng, km)))) godtatt += 1;
    }
    // Sammenfall krever at funnet ligger innenfor rundt en millimeter av
    // radens midtlinje — se stempletMed075. Blant 20 000 tilfeldige: ingen.
    expect(godtatt).toBe(0);
  });

  it('avviser den gamle utregningen i begge halvkuler, også vest og sør', () => {
    const neste = tilfeldig(4);
    let godtatt = 0;
    for (let i = 0; i < 20_000; i += 1) {
      const { lat, lng, km } = punkt(neste);
      // k = 0 (nær 0-meridianen) og polkappene er de ufarlige sammenfallene,
      // testet for seg under.
      if (Math.abs(lng) < 1) continue;
      if (stempletMed075(rad(lat, lng, km, sonerute042(lat, lng, km)))) godtatt += 1;
    }
    expect(godtatt).toBe(0);
  });

  it('skiller de to selv ved funn rett ved siden av radens midtlinje', () => {
    // 1 cm nord for midtlinjen i en 5 km-rute ved Oslo: lengdegraden skiller
    // fortsatt med mer enn toleransen.
    const midt = sonerute075(59.98765, 10.71234, 5).lat;
    const lat = midt + 0.01 / 111_320;
    const gammel = sonerute042(lat, 10.71234, 5);
    expect(Math.abs(gammel.lng - sonerute075(lat, 10.71234, 5).lng)).toBeGreaterThan(SONERUTE_TOLERANSE_GRADER);
    expect(stempletMed075(rad(lat, 10.71234, 5, gammel))).toBe(false);
  });

  /** Ufarlig sammenfall 1: over ~78,46° klemmes cos til 0,2 i begge. */
  it('lar polkappen passere — der avhenger ikke det gamle punktet av breddegraden', () => {
    for (const lat of [79.5, 80.123, -80.5]) {
      const gammel = sonerute042(lat, 15.4, 5);
      expect(stempletMed075(rad(lat, 15.4, 5, gammel))).toBe(true);
      // Og det gamle punktet er likt for hele raden: ingenting å regne ut.
      expect(sonerute042(lat + 0.01, 15.4, 5).lng).toBe(gammel.lng);
    }
  });

  /** Ufarlig sammenfall 2: k = 0 gir 0 uansett steg. */
  it('lar k = 0 passere — punktet er 0 med begge utregningene', () => {
    const gammel = sonerute042(51.4778, 0.0001, 5);
    expect(gammel.lng).toBe(0);
    expect(stempletMed075(rad(51.4778, 0.0001, 5, gammel))).toBe(true);
  });

  /**
   * En rutekant innenfor støyen kan rundes til hver sin side i Postgres og
   * her. Da skiller svarene med et helt rutesteg — og vakta gjør funnet privat
   * uten grunn. Det er den trygge retningen.
   */
  it('avviser et punkt ett rutesteg unna — en kant rundet til hver sin side', () => {
    const v = sonerute075(60.1, 10.7, 5);
    expect(stempletMed075(rad(60.1, 10.7, 5, { lat: v.lat, lng: v.lng + v.stegLng }))).toBe(false);
    expect(stempletMed075(rad(60.1, 10.7, 5, { lat: v.lat + v.stegLat, lng: v.lng }))).toBe(false);
  });

  it('avviser en rad som ikke kom lesbart tilbake', () => {
    const v = sonerute075(60.1, 10.7, 5);
    const god = rad(60.1, 10.7, 5, v);
    expect(stempletMed075(god)).toBe(true);
    expect(stempletMed075({ ...god, display_latitude: null })).toBe(false);
    expect(stempletMed075({ ...god, display_longitude: undefined })).toBe(false);
    expect(stempletMed075({ ...god, zone_precision_km: null })).toBe(false);
    expect(stempletMed075({ ...god, latitude: Number.NaN })).toBe(false);
  });

  it('regner størrelsene under 1 km som 1 km, som GREATEST(precision_km, 1)', () => {
    expect(sonerute075(60.1, 10.7, 0)).toEqual(sonerute075(60.1, 10.7, 1));
  });
});
