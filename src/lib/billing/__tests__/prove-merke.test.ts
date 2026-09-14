import { describe, expect, it } from 'vitest';
import { oppdaterProveMerker, lesProveMerke } from '../prove-merke';

/**
 * Det ene tallet prøvetilbudet dømmes på er «prøve → første belastning».
 * Testene her sikrer at merkene overlever at begge webhookene bygger
 * metadata på nytt, og at en oppsagt prøve aldri ser konvertert ut.
 */

const NAA = '2026-09-14T20:00:00.000Z';
const PROVE_START = '2026-09-07T10:00:00.000Z';
const BELASTNING = '2026-09-14T10:00:00.000Z';

describe('oppdaterProveMerker', () => {
  it('setter prøvestart første gang raden blir trialing, fra periodestart', () => {
    expect(oppdaterProveMerker(null, { status: 'trialing', periodeStart: PROVE_START, naa: NAA, kjop: false })).toEqual({
      prove_start: PROVE_START
    });
  });

  it('faller tilbake på nå når hendelsen mangler periode', () => {
    expect(oppdaterProveMerker(null, { status: 'trialing', periodeStart: null, naa: NAA, kjop: false })).toEqual({ prove_start: NAA });
  });

  it('flytter aldri prøvestarten når den alt er satt', () => {
    const rad = { status: 'trialing', metadata: { prove_start: PROVE_START } };
    expect(oppdaterProveMerker(rad, { status: 'trialing', periodeStart: '2026-09-10T00:00:00.000Z', naa: NAA, kjop: false })).toEqual({
      prove_start: PROVE_START
    });
  });

  it('prøve → active ved kjøp gir første belastning fra periodestart', () => {
    const rad = { status: 'trialing', metadata: { prove_start: PROVE_START } };
    expect(oppdaterProveMerker(rad, { status: 'active', periodeStart: BELASTNING, naa: NAA, kjop: true })).toEqual({
      prove_start: PROVE_START,
      forste_belastning: BELASTNING
    });
  });

  it('prøve fra før merkingen fantes: raden sto som trialing uten merke → prøvestart fra radens periodestart', () => {
    const rad = { status: 'trialing', current_period_start: PROVE_START, metadata: { provider: 'stripe' } };
    expect(oppdaterProveMerker(rad, { status: 'active', periodeStart: BELASTNING, naa: NAA, kjop: true })).toEqual({
      prove_start: PROVE_START,
      forste_belastning: BELASTNING
    });
  });

  it('et kjøp uten prøve får ingen merker — «nye kjøp» leses da av created_at som før', () => {
    expect(oppdaterProveMerker(null, { status: 'active', periodeStart: BELASTNING, naa: NAA, kjop: true })).toEqual({});
    const aktiv = { status: 'active', metadata: { provider: 'stripe' } };
    expect(oppdaterProveMerker(aktiv, { status: 'active', periodeStart: BELASTNING, naa: NAA, kjop: true })).toEqual({});
  });

  it('en oppsigelse i prøven (status active + cancel) er ikke en belastning', () => {
    // RevenueCat CANCELLATION mapper til active + cancelAtPeriodEnd. kjop=false.
    const rad = { status: 'trialing', metadata: { prove_start: PROVE_START } };
    expect(oppdaterProveMerker(rad, { status: 'active', periodeStart: PROVE_START, naa: NAA, kjop: false })).toEqual({
      prove_start: PROVE_START
    });
  });

  it('bærer begge merkene videre gjennom senere hendelser, også oppsigelse og fornyelse', () => {
    const rad = { status: 'active', metadata: { prove_start: PROVE_START, forste_belastning: BELASTNING } };
    expect(oppdaterProveMerker(rad, { status: 'canceled', periodeStart: null, naa: NAA, kjop: false })).toEqual({
      prove_start: PROVE_START,
      forste_belastning: BELASTNING
    });
    // En fornyelse en måned senere flytter ikke første belastning.
    expect(oppdaterProveMerker(rad, { status: 'active', periodeStart: '2026-10-14T10:00:00.000Z', naa: NAA, kjop: true })).toEqual({
      prove_start: PROVE_START,
      forste_belastning: BELASTNING
    });
  });

  it('ignorerer merker som ikke er datoer — metadata er fritekst i basen', () => {
    const rad = { status: 'trialing', metadata: { prove_start: 'i går', forste_belastning: 42 } };
    expect(oppdaterProveMerker(rad, { status: 'trialing', periodeStart: PROVE_START, naa: NAA, kjop: false })).toEqual({
      prove_start: PROVE_START
    });
  });
});

describe('lesProveMerke', () => {
  it('gir ISO-strengen eller null', () => {
    expect(lesProveMerke({ prove_start: PROVE_START }, 'prove_start')).toBe(PROVE_START);
    expect(lesProveMerke({ prove_start: 'nei' }, 'prove_start')).toBeNull();
    expect(lesProveMerke(null, 'forste_belastning')).toBeNull();
  });
});
