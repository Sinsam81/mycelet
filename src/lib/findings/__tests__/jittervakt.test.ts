import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  JITTERVAKT_TILTAK,
  _nullstillJitterVakt,
  flyttetUtenGrunn,
  jitterFlyttet,
  jitterVaktMangler,
  meldJitterVaktMangler,
  type Stempling
} from '../jittervakt';

/**
 * Snubletråden for vakten i migrasjon 042: et notat som rettes, skal ikke
 * flytte prikken til et omtrentlig funn. Gjør den det, mangler vakten.
 */

const PUNKT = { display_latitude: 59.9412, display_longitude: 10.7231 };

function rad(over: Partial<Stempling> = {}): Stempling {
  return { visibility: 'approximate', is_zone_finding: false, zone_precision_km: 5, ...PUNKT, ...over };
}

beforeEach(() => {
  _nullstillJitterVakt();
});

describe('jitterFlyttet', () => {
  it('ser at punktet står i ro', () => {
    expect(jitterFlyttet(PUNKT, { ...PUNKT })).toBe(false);
    expect(
      jitterFlyttet({ display_latitude: null, display_longitude: null }, { display_latitude: null, display_longitude: null })
    ).toBe(false);
  });

  it('ser at punktet har flyttet seg, også når bare én koordinat er endret', () => {
    expect(jitterFlyttet(PUNKT, { ...PUNKT, display_latitude: 59.9413 })).toBe(true);
    expect(jitterFlyttet(PUNKT, { ...PUNKT, display_longitude: 10.7232 })).toBe(true);
    expect(jitterFlyttet({ display_latitude: null, display_longitude: null }, PUNKT)).toBe(true);
  });
});

describe('flyttetUtenGrunn', () => {
  it('er stille når punktet står i ro', () => {
    expect(flyttetUtenGrunn(rad(), rad())).toBe(false);
  });

  it('slår til når punktet flyttet seg uten at delingen er endret', () => {
    expect(flyttetUtenGrunn(rad(), rad({ display_latitude: 59.9388, display_longitude: 10.7302 }))).toBe(true);
  });

  /**
   * Lesingen og skrivingen er to kall. Endret en annen forespørsel delingen
   * imellom, SKAL punktet stemples på nytt — det er ikke et bevis på noe.
   */
  it.each([
    ['synligheten', { visibility: 'private', display_latitude: null, display_longitude: null }],
    ['soneflagget', { is_zone_finding: true, display_latitude: 59.93, display_longitude: 10.71 }],
    ['sonepresisjonen', { zone_precision_km: 3, display_latitude: 59.9388, display_longitude: 10.7302 }]
  ])('regner ikke et flyttet punkt som bevis når %s ble endret imellom', (_navn, etter) => {
    expect(flyttetUtenGrunn(rad(), rad(etter))).toBe(false);
  });

  it('regner et manglende soneflagg som «ikke sone»', () => {
    const flyttet = { display_latitude: 59.9388, display_longitude: 10.7302 };
    expect(flyttetUtenGrunn(rad({ is_zone_finding: null }), rad({ is_zone_finding: false, ...flyttet }))).toBe(true);
  });
});

describe('flagget', () => {
  it('husker at vakten mangler til den nullstilles', () => {
    expect(jitterVaktMangler()).toBe(false);
    meldJitterVaktMangler();
    expect(jitterVaktMangler()).toBe(true);
    _nullstillJitterVakt();
    expect(jitterVaktMangler()).toBe(false);
  });
});

/**
 * Rådet i feilloggen blir fulgt av en som ikke har lest hovedboka. 042 og 075
 * skriver samme funksjon: 042 limt inn etter 075 gir vakten tilbake, men lar
 * sone-funn røpe breddegraden sin igjen. 075 inneholder begge deler.
 */
describe('JITTERVAKT_TILTAK', () => {
  it('ber driften kjøre 075 — en fil som finnes — og advarer mot 042 etterpå', () => {
    const fil = JITTERVAKT_TILTAK.match(/supabase\/migrations\/\S+\.sql/)?.[0];
    expect(fil).toBe('supabase/migrations/075_sonerute_uten_breddegradslekkasje.sql');
    expect(existsSync(join(process.cwd(), fil ?? ''))).toBe(true);
    expect(JITTERVAKT_TILTAK).not.toMatch(/Kjør \S*042/);
    expect(JITTERVAKT_TILTAK).toMatch(/ikke inn 042 etter 075/);
  });
});
