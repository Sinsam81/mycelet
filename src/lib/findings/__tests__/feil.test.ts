import { describe, expect, it } from 'vitest';
import { LOCALES, type Locale } from '@/i18n/config';
import { FUNN_FEIL, delingKaranteneTekst, funnFeilTekst, type FunnFeilKode } from '../feil';

/**
 * Feiltekstene lages på serveren, så next-intl dekker dem ikke — og
 * messages.test.ts, som vokter at nb og sv har de samme nøklene, ser dem ikke.
 * Denne testen er den vakten for /api/findings-rutene.
 */

const KODER = Object.keys(FUNN_FEIL) as FunnFeilKode[];
/** Katalogen som vanlige strenger: `as const` gjør ellers hver tekst til sin egen type. */
const TEKSTER: Record<FunnFeilKode, Record<Locale, string>> = FUNN_FEIL;

describe('feiltekstene til /api/findings', () => {
  it('finnes på hvert språk appen har, uten tomme tekster', () => {
    for (const kode of KODER) {
      for (const locale of LOCALES) {
        expect(funnFeilTekst(kode, locale).trim(), `${kode} på ${locale}`).not.toBe('');
      }
    }
  });

  /**
   * En svensk tekst som er lik den norske, er nesten alltid en norsk tekst
   * som er limt inn. De to språkene deler svært få hele setninger.
   */
  it('er faktisk oversatt — svensk er ikke norsk limt inn', () => {
    const like = KODER.filter((kode) => TEKSTER[kode].nb === TEKSTER[kode].sv);
    expect(like).toEqual([]);
  });

  it('bruker svenske ord for funn, ikke norske', () => {
    for (const kode of KODER) {
      expect(TEKSTER[kode].sv, kode).not.toMatch(/\bfunn(et|ene)?\b|\bikke\b|\bkunne\b|\bslett/i);
    }
  });

  it('sier rett ut hva som IKKE skjedde når en migrasjon mangler', () => {
    expect(funnFeilTekst('delete_migration_missing', 'nb')).toContain('IKKE slettet');
    expect(funnFeilTekst('delete_migration_missing', 'sv')).toContain('INTE raderat');
    expect(funnFeilTekst('update_migration_missing', 'nb')).toContain('IKKE endret');
    expect(funnFeilTekst('update_migration_missing', 'sv')).toContain('INTE ändrats');
  });

  it('minner om at et funn alltid kan gjøres privat, der brukeren ellers får nei', () => {
    for (const kode of ['sharing_cooldown', 'guard_missing', 'zone_unavailable', 'zone_size_locked'] as const) {
      expect(funnFeilTekst(kode, 'nb')).toMatch(/gjøre det privat/);
      expect(funnFeilTekst(kode, 'sv')).toMatch(/göra det privat/);
    }
  });

  /**
   * En avvist sone-endring skriver ingenting. Brukeren skal ikke tro at funnet
   * nå er «hemmeligsted-vennlig» delt når det står som før.
   */
  it('sier rett ut at funnet IKKE er endret når en sone-endring avvises', () => {
    for (const kode of ['zone_unavailable', 'zone_size_locked'] as const) {
      expect(funnFeilTekst(kode, 'nb')).toContain('IKKE endret');
      expect(funnFeilTekst(kode, 'sv')).toContain('INTE ändrats');
    }
  });

  /** Brukeren får ikke en forklaring av hullet — bare hva som ikke går, og hva som går. */
  it('forklarer ikke hvordan et sted kan regnes ut', () => {
    for (const locale of LOCALES) {
      for (const kode of ['zone_unavailable', 'zone_size_locked'] as const) {
        expect(funnFeilTekst(kode, locale)).not.toMatch(/breddegrad|latitud|migrasjon|migrering|075/i);
      }
    }
  });
});

describe('delingKaranteneTekst', () => {
  // 11. november 2026 kl. 10:00 UTC = kl. 11:00 i Oslo og Stockholm (vintertid).
  const VINTER = Date.parse('2026-11-11T10:00:00.000Z');
  // 15. juli 2026 kl. 10:00 UTC = kl. 12:00 (sommertid).
  const SOMMER = Date.parse('2026-07-15T10:00:00.000Z');

  it('skriver tidspunktet i leserens tidssone, ikke serverens UTC', () => {
    expect(delingKaranteneTekst(VINTER, 'nb')).toContain('11. november');
    expect(delingKaranteneTekst(VINTER, 'nb')).toContain('11:00');
    expect(delingKaranteneTekst(SOMMER, 'nb')).toContain('15. juli');
    expect(delingKaranteneTekst(SOMMER, 'nb')).toContain('12:00');
  });

  it('skriver det på svensk for en svensk leser', () => {
    const tekst = delingKaranteneTekst(VINTER, 'sv');
    expect(tekst).toContain('11 november');
    expect(tekst).toContain('11:00');
    expect(tekst).toContain('Fyndet har ändrats');
  });

  it('lar ikke plassholderen bli stående', () => {
    for (const locale of LOCALES) {
      expect(delingKaranteneTekst(VINTER, locale)).not.toContain('{tid}');
    }
  });

  /** En natt-til-dag-overgang: 23:30 UTC er neste dag i Norge. */
  it('bytter dato der leseren bytter dato', () => {
    expect(delingKaranteneTekst(Date.parse('2026-11-10T23:30:00.000Z'), 'nb')).toContain('11. november');
  });
});
