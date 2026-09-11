import { describe, expect, it } from 'vitest';
import { kanFaaProveperiode, leggTilKartdag, registrerVisning, skalViseProvetilbud, tolkProvetilbud } from '../provetilbud';

const NAA = 1_800_000_000_000;
const fersk = { visninger: 0, sistVistMs: null };

describe('skalViseProvetilbud', () => {
  it('vises for gratisbruker ved «viser 3 av 12»', () => {
    expect(skalViseProvetilbud({ betaler: false, betalingKjent: true, kanFaaProve: true, tilstand: fersk, utloser: 'begrenset', naaMs: NAA })).toBe(true);
  });

  it('aldri for betalende, og aldri før vi vet om de betaler', () => {
    expect(skalViseProvetilbud({ betaler: true, betalingKjent: true, kanFaaProve: true, tilstand: fersk, utloser: 'begrenset', naaMs: NAA })).toBe(false);
    expect(skalViseProvetilbud({ betaler: false, betalingKjent: false, kanFaaProve: true, tilstand: fersk, utloser: 'begrenset', naaMs: NAA })).toBe(false);
  });

  it('ikke uten utløser, ikke to ganger samme døgn, aldri mer enn to ganger', () => {
    expect(skalViseProvetilbud({ betaler: false, betalingKjent: true, kanFaaProve: true, tilstand: fersk, utloser: null, naaMs: NAA })).toBe(false);
    const enGang = registrerVisning(fersk, NAA - 3600_000);
    expect(skalViseProvetilbud({ betaler: false, betalingKjent: true, kanFaaProve: true, tilstand: enGang, utloser: 'andre-dag', naaMs: NAA })).toBe(false);
    const enGangIGar = registrerVisning(fersk, NAA - 25 * 3600_000);
    expect(skalViseProvetilbud({ betaler: false, betalingKjent: true, kanFaaProve: true, tilstand: enGangIGar, utloser: 'andre-dag', naaMs: NAA })).toBe(true);
    const toGanger = registrerVisning(enGangIGar, NAA - 25 * 3600_000);
    expect(skalViseProvetilbud({ betaler: false, betalingKjent: true, kanFaaProve: true, tilstand: toGanger, utloser: 'begrenset', naaMs: NAA })).toBe(false);
  });
});

describe('tolkProvetilbud / leggTilKartdag', () => {
  it('tåler søppel i lagringen', () => {
    expect(tolkProvetilbud('nei')).toEqual(fersk);
    expect(tolkProvetilbud(JSON.stringify({ visninger: -3, sistVistMs: 'x' }))).toEqual(fersk);
    expect(leggTilKartdag('[1, "2026-09-09", "feil"]', '2026-09-10')).toEqual(['2026-09-09', '2026-09-10']);
  });

  it('samme dag telles én gang', () => {
    expect(leggTilKartdag('["2026-09-09"]', '2026-09-09')).toEqual(['2026-09-09']);
  });

  it('aldri til en tidligere abonnent — de får ingen gratis uke', () => {
    expect(skalViseProvetilbud({ betaler: false, betalingKjent: true, kanFaaProve: false, tilstand: fersk, utloser: 'begrenset', naaMs: NAA })).toBe(false);
  });
});

describe('kanFaaProveperiode', () => {
  it('ny bruker uten rad: ja · betalende: nei · avsluttet abonnement (rad uten betaling): nei · ukjent status: nei', () => {
    expect(kanFaaProveperiode({ capabilities: { paid: false }, subscription: null })).toBe(true);
    expect(kanFaaProveperiode({ capabilities: { paid: true }, subscription: { status: 'active' } })).toBe(false);
    expect(kanFaaProveperiode({ capabilities: { paid: false }, subscription: { status: 'canceled' } })).toBe(false);
    expect(kanFaaProveperiode(undefined)).toBe(false);
  });

  it('første kartøkt er en gyldig utløser', () => {
    expect(skalViseProvetilbud({ betaler: false, betalingKjent: true, kanFaaProve: true, tilstand: { visninger: 0, sistVistMs: null }, utloser: 'forste-okt', naaMs: NAA })).toBe(true);
  });
});
