import { describe, expect, it } from 'vitest';
import { formatMemberSince, memberSinceIso } from '../member-since';

/**
 * Bakgrunn: profilraden lages av appkoden, ikke av en trigger, og kan komme
 * lenge etter registreringen (selvreparasjon + backfill-migrasjon 037).
 * Verifisert mot produksjon: én konto opprettet 2026-03-08 hadde profilrad fra
 * 2026-04-29 — profilen sa «april», kontoen er fra mars.
 */
describe('medlem siden', () => {
  it('leser kontoens opprettelsestid, ikke profilradens', () => {
    const kontoFraMars = { created_at: '2026-03-08T10:23:00Z' };
    const profilFraApril = { created_at: '2026-04-29T14:31:00Z' };

    expect(memberSinceIso(kontoFraMars, profilFraApril)).toBe('2026-03-08T10:23:00Z');
    expect(formatMemberSince(kontoFraMars, profilFraApril, 'nb')).toBe('mars 2026');
  });

  it('faller tilbake på profilraden når auth-datoen mangler', () => {
    expect(memberSinceIso({ created_at: null }, { created_at: '2026-04-29T14:31:00Z' })).toBe(
      '2026-04-29T14:31:00Z'
    );
  });

  it('gir null når ingen av dem har dato — da skal linjen ikke vises', () => {
    expect(memberSinceIso(null, null)).toBeNull();
    expect(formatMemberSince(null, null, 'nb')).toBeNull();
    expect(formatMemberSince({ created_at: 'ikke en dato' }, null, 'nb')).toBeNull();
  });

  it('formaterer på svensk for svenske brukere', () => {
    expect(formatMemberSince({ created_at: '2026-03-08T10:23:00Z' }, null, 'sv')).toBe('mars 2026');
    expect(formatMemberSince({ created_at: '2026-08-02T10:23:00Z' }, null, 'sv')).toBe('augusti 2026');
    expect(formatMemberSince({ created_at: '2026-08-02T10:23:00Z' }, null, 'nb')).toBe('august 2026');
  });
});
