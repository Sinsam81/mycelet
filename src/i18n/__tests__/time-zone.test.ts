import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LOCALES, LOCALE_TIME_ZONES, timeZoneForLocale } from '@/i18n/config';

/**
 * next-intl formaterer datoer i kjøremiljøets tidssone når ingen er
 * konfigurert: UTC på Vercel, brukerens egen sone i nettleseren. Samme dato
 * kan da bli to forskjellige dager på server og klient — en av-med-én-dag-feil
 * som ser tilfeldig ut, og en hydreringsadvarsel fra React. Biblioteket
 * logget «IntlError: ENVIRONMENT_FALLBACK» ved hver eneste rendring.
 *
 * Ingen kode formaterte dato gjennom next-intl da dette ble rettet, så
 * vaktene under er der for den FØRSTE som gjør det.
 */
function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

describe('timeZoneForLocale', () => {
  it('gir en ekte IANA-sone for hvert språk', () => {
    for (const locale of LOCALES) {
      const zone = timeZoneForLocale(locale);
      expect(LOCALE_TIME_ZONES[locale]).toBe(zone);
      // Kaster hvis sonenavnet ikke finnes i ICU.
      expect(() => new Intl.DateTimeFormat('en', { timeZone: zone }).format(new Date())).not.toThrow();
    }
  });

  it('faller tilbake på norsk sone for ukjent språk', () => {
    expect(timeZoneForLocale('de')).toBe('Europe/Oslo');
    expect(timeZoneForLocale('')).toBe('Europe/Oslo');
  });

  it('formaterer samme øyeblikk likt uansett hvilken sone prosessen kjører i', () => {
    // Midnatt i Oslo er kvelden før i UTC. Det er nettopp den forskjellen som
    // ville gitt to datoer for samme funn.
    const midnightOslo = new Date('2026-08-15T22:30:00Z');
    const inOslo = new Intl.DateTimeFormat('nb-NO', {
      timeZone: timeZoneForLocale('nb'),
      dateStyle: 'short'
    }).format(midnightOslo);
    const inUtc = new Intl.DateTimeFormat('nb-NO', { timeZone: 'UTC', dateStyle: 'short' }).format(
      midnightOslo
    );
    expect(inOslo).not.toBe(inUtc);
  });
});

describe('oppsettet', () => {
  it('sender timeZone inn i getRequestConfig', () => {
    expect(source('../request.ts')).toContain('timeZone: timeZoneForLocale(locale)');
  });

  it('sender timeZone inn i begge klientprovidere', () => {
    // Rot-layouten OG den løsrevne popup-roten i MushroomMap — kontekst
    // krysser ikke rot-grenser, så begge må få den eksplisitt.
    for (const file of ['../../app/layout.tsx', '../../components/map/MushroomMap.tsx']) {
      expect(source(file), file).toContain('timeZone={timeZoneForLocale(locale)}');
    }
  });
});
