import { describe, expect, it } from 'vitest';
import {
  FOLG_OMRADE_PAUSE_MS,
  avvisningsVerdi,
  erAvvist,
  skalViseFolgOmrade,
  tolkAvvisning,
  velgVariant
} from '../folg-omrade';

/**
 * Regelen bak «Følg området ditt». Den avgjør bare NÅR vi har lov til å spørre
 * — aldri om noen kan meldes på. Abonnementet krever et trykk.
 */

const DAG = 86_400_000;
const NAA = Date.parse('2026-09-17T19:00:00Z');

const vilkar = (over: Partial<Parameters<typeof skalViseFolgOmrade>[0]> = {}) =>
  skalViseFolgOmrade({
    innlogget: true,
    harData: true,
    folgerAlt: false,
    arkApent: false,
    avvist: null,
    naa: NAA,
    ...over
  });

describe('skalViseFolgOmrade', () => {
  it('vises ved første besøk, når kortet har data og brukeren er innlogget', () => {
    expect(vilkar()).toBe(true);
  });

  it('vises ikke for en som alt følger et område', () => {
    expect(vilkar({ folgerAlt: true })).toBe(false);
  });

  it('vises ikke uten innlogging, uten data, eller mens prøvetilbudsarket ligger over', () => {
    expect(vilkar({ innlogget: false })).toBe(false);
    expect(vilkar({ harData: false })).toBe(false);
    expect(vilkar({ arkApent: true })).toBe(false);
  });

  it('er borte 13 dager etter «Ikke nå», og tilbake etter 15', () => {
    expect(vilkar({ avvist: avvisningsVerdi(NAA - 13 * DAG) })).toBe(false);
    expect(vilkar({ avvist: avvisningsVerdi(NAA - 15 * DAG) })).toBe(true);
  });

  it('behandler ulesbar eller blokkert lagring som «aldri avvist»', () => {
    // safe-storage svarer null når lagringen er blokkert; en skadet verdi kan
    // være hva som helst. Ingen av delene skal skjule stripa for alltid.
    for (const rar of [null, undefined, '', '   ', 'kantarell', '{}', 'NaN']) {
      expect(vilkar({ avvist: rar })).toBe(true);
    }
  });
});

describe('erAvvist', () => {
  it('holder nøyaktig pausen, og regner et framtidsstempel som nettopp avvist', () => {
    expect(erAvvist(null, NAA)).toBe(false);
    expect(erAvvist(NAA - FOLG_OMRADE_PAUSE_MS + 1000, NAA)).toBe(true);
    expect(erAvvist(NAA - FOLG_OMRADE_PAUSE_MS, NAA)).toBe(false);
    // Enheten hadde feil klokke da nei-et ble lagret.
    expect(erAvvist(NAA + 5 * DAG, NAA)).toBe(true);
  });
});

describe('tolkAvvisning', () => {
  it('leser ISO-verdien den selv skrev, og null for alt annet', () => {
    expect(tolkAvvisning(avvisningsVerdi(NAA))).toBe(NAA);
    expect(tolkAvvisning('tull')).toBe(null);
    expect(tolkAvvisning(null)).toBe(null);
  });
});

describe('velgVariant', () => {
  it('navngir området bare når det kommer fra brukerens egen posisjon', () => {
    expect(velgVariant({ kilde: 'egen', omrade: 'Bergen' })).toEqual({ type: 'kjent', omrade: 'Bergen' });
  });

  it('spør — og navngir ALDRI Oslo eller Stockholm — når kortet står på standardområdet', () => {
    // Standardområdet er et fallback for prognosen, ikke en påstand om hvor
    // noen plukker (docs/strategi-2026-2027.md § 1).
    expect(velgVariant({ kilde: 'standard', omrade: 'Oslo' })).toEqual({ type: 'sporre' });
    expect(velgVariant({ kilde: 'standard', omrade: 'Stockholm' })).toEqual({ type: 'sporre' });
    // Egen posisjon, men utenfor alle områdene vi dekker (nearestRegion gir null).
    expect(velgVariant({ kilde: 'egen', omrade: null })).toEqual({ type: 'sporre' });
  });
});
