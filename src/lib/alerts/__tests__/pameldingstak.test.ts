import { describe, expect, it } from 'vitest';
import {
  BEKREFTELSESVINDU_MS,
  FORSTE_PURRING_ETTER_MS,
  MAKS_BEKREFTELSER_PER_TIME,
  NESTE_PURRING_ETTER_MS,
  bekreftelsesvinduFra,
  nyligBekreftelseSendt
} from '../pameldingstak';

/**
 * Regelen på raden er den som overlever kaldstart og instansvifte — telleren i
 * minnet gjør ikke det. Feilene som betyr noe går hver sin vei: slipper den
 * gjennom for ofte, kan adressen bombes; holder den igjen feil rad, får et
 * menneske «sjekk innboksen» uten at det finnes noen e-post.
 */

const NAA = Date.parse('2026-09-25T10:00:00.000Z');
const siden = (ms: number) => new Date(NAA - ms).toISOString();
const MIN = 60_000;

/** En rad som venter på bekreftelse, opprettet og sist rørt for `min` minutter siden. */
const fersk = (min: number) => ({ active: true, confirmed_at: null, created_at: siden(min * MIN), updated_at: siden(min * MIN) });

describe('nyligBekreftelseSendt', () => {
  it('tallene henger sammen: tre i timen, første gjentakelse etter ti minutter, så én i timen', () => {
    expect(MAKS_BEKREFTELSER_PER_TIME).toBe(3);
    expect(FORSTE_PURRING_ETTER_MS).toBe(10 * MIN);
    expect(NESTE_PURRING_ETTER_MS).toBe(60 * MIN);
    expect(BEKREFTELSESVINDU_MS).toBe(60 * MIN);
  });

  it('en rad som nettopp ble opprettet: bekreftelsen gikk nå, send ikke en til', () => {
    expect(nyligBekreftelseSendt(fersk(0), NAA)).toBe(true);
    expect(nyligBekreftelseSendt(fersk(9), NAA)).toBe(true);
  });

  it('etter ti minutter kan den første gjentakelsen gå — nøyaktig på grensen også', () => {
    expect(nyligBekreftelseSendt({ ...fersk(0), created_at: siden(10 * MIN), updated_at: siden(10 * MIN) }, NAA)).toBe(false);
    expect(nyligBekreftelseSendt(fersk(11), NAA)).toBe(false);
    expect(nyligBekreftelseSendt(fersk(24 * 60), NAA)).toBe(false);
  });

  it('er raden alt sendt på nytt (rørt etter at den ble opprettet), går det en time til neste', () => {
    const purret = (min: number) => ({ active: true, confirmed_at: null, created_at: siden(180 * MIN), updated_at: siden(min * MIN) });
    expect(nyligBekreftelseSendt(purret(11), NAA)).toBe(true);
    expect(nyligBekreftelseSendt(purret(59), NAA)).toBe(true);
    expect(nyligBekreftelseSendt(purret(60), NAA)).toBe(false);
    expect(nyligBekreftelseSendt(purret(61), NAA)).toBe(false);
  });

  it('gjelder aldri en avmeldt rad — updated_at er fersk fra selve avmeldingen', () => {
    expect(nyligBekreftelseSendt({ active: false, confirmed_at: '2026-08-01T00:00:00Z', created_at: siden(900 * MIN), updated_at: siden(MIN) }, NAA)).toBe(false);
    expect(nyligBekreftelseSendt({ active: false, confirmed_at: null, created_at: siden(MIN), updated_at: siden(MIN) }, NAA)).toBe(false);
  });

  it('gjelder aldri en bekreftet rad — den håndteres før, som stille suksess', () => {
    expect(nyligBekreftelseSendt({ active: true, confirmed_at: siden(MIN), created_at: siden(MIN), updated_at: siden(MIN) }, NAA)).toBe(false);
  });

  it('kan ikke tidsstempelet leses, holdes ingenting igjen', () => {
    expect(nyligBekreftelseSendt({ active: true, confirmed_at: null, created_at: null, updated_at: null }, NAA)).toBe(false);
    expect(nyligBekreftelseSendt({ active: true, confirmed_at: null, created_at: siden(MIN), updated_at: 'tull' }, NAA)).toBe(false);
  });

  it('mangler opprettelsestiden, regnes raden som alt purret — den strenge ventetiden', () => {
    const rad = { active: true, confirmed_at: null, created_at: null, updated_at: siden(30 * MIN) };
    expect(nyligBekreftelseSendt(rad, NAA)).toBe(true);
    expect(nyligBekreftelseSendt({ ...rad, updated_at: siden(61 * MIN) }, NAA)).toBe(false);
  });

  it('tåler Supabases mikrosekunder og tidssoneform', () => {
    const rad = { active: true, confirmed_at: null, created_at: '2026-09-25T09:57:00.123456+00:00', updated_at: '2026-09-25T09:57:00.123456+00:00' };
    expect(nyligBekreftelseSendt(rad, NAA)).toBe(true);
    expect(nyligBekreftelseSendt(rad, NAA + 8 * MIN)).toBe(false);
  });

  it('en klokke som går litt foran databasen sender ikke i strøm: «i framtiden» er nylig', () => {
    expect(nyligBekreftelseSendt({ active: true, confirmed_at: null, created_at: siden(-2000), updated_at: siden(-2000) }, NAA)).toBe(true);
  });
});

describe('bekreftelsesvinduFra', () => {
  it('er én time før nå, som ISO databasen kan sammenligne mot', () => {
    expect(bekreftelsesvinduFra(NAA)).toBe('2026-09-25T09:00:00.000Z');
  });
});
