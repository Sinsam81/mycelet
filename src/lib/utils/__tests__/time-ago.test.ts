import { afterAll, describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';
import { formatTimeAgo, type TidSidenOversetter } from '../time-ago';

/**
 * «Siste funn fra fellesskapet» på forsiden: når ble funnet gjort?
 *
 * Forsiden rendres på en server i UTC. Dagene ble regnet som timer delt på 24,
 * og datoen for eldre funn ble formatert i UTC — begge ga feil dag rundt
 * midnatt norsk tid.
 */

// Serveren går i UTC, og det er DER feilen bodde. Uten denne linja leser
// testen maskinens egen sone — på en maskin i Oslo ga den gamle koden riktig
// dato ved en tilfeldighet. Hver testfil kjører i sin egen prosess; sonen
// settes likevel tilbake til slutt.
const OPPRINNELIG_SONE = process.env.TZ;
process.env.TZ = 'UTC';

afterAll(() => {
  if (OPPRINNELIG_SONE === undefined) delete process.env.TZ;
  else process.env.TZ = OPPRINNELIG_SONE;
});

function oversetter(locale: 'nb' | 'sv'): TidSidenOversetter {
  const t = createTranslator({ locale, messages: locale === 'sv' ? sv : nb, namespace: 'Home' });
  return (nokkel, verdier) => t(nokkel, verdier);
}

const NB = oversetter('nb');
const SV = oversetter('sv');

describe('i dag og i går er Oslo-dager, ikke timer', () => {
  it('kvelden før er «i går», også tidlig neste morgen', () => {
    // 23:30 norsk tid 15. november, lest 08:00 16. november — 8,5 timer senere.
    // Den gamle avrundingen ga «i dag».
    const naa = new Date('2026-11-16T07:00:00Z');
    expect(formatTimeAgo('2026-11-15T22:30:00Z', NB, 'nb', naa)).toBe('i går');
    expect(formatTimeAgo('2026-11-15T22:30:00Z', SV, 'sv', naa)).toBe('i går');
  });

  it('like over midnatt er «i dag» hele dagen, selv om UTC-datoen er gårsdagens', () => {
    // 00:30 norsk tid 16. november (23:30 UTC 15. november), lest 22:30 samme
    // dag — 22 timer senere. Den gamle avrundingen ga «i går».
    const naa = new Date('2026-11-16T21:30:00Z');
    expect(formatTimeAgo('2026-11-15T23:30:00Z', NB, 'nb', naa)).toBe('i dag');
  });

  it('sommertid: midnatt ligger to timer foran UTC', () => {
    // 00:30 norsk tid 15. august = 22:30 UTC 14. august, lest 23:00 norsk tid
    // samme dag. Den gamle avrundingen (22,5 timer) ga «i går».
    const naa = new Date('2026-08-15T21:00:00Z');
    expect(formatTimeAgo('2026-08-14T22:30:00Z', NB, 'nb', naa)).toBe('i dag');
    expect(formatTimeAgo('2026-08-14T22:30:00Z', SV, 'sv', naa)).toBe('i dag');
  });

  it('et tidspunkt litt fram i tid er «i dag», aldri «for -1 dager siden»', () => {
    const naa = new Date('2026-11-16T22:50:00Z'); // 23:50 norsk tid
    expect(formatTimeAgo('2026-11-16T22:55:00Z', NB, 'nb', naa)).toBe('i dag');
    expect(formatTimeAgo('2026-11-16T23:10:00Z', NB, 'nb', naa)).toBe('i dag'); // allerede 17. i Oslo
  });
});

describe('dager og uker', () => {
  const naa = new Date('2026-11-16T10:00:00Z');
  /** Et funn kl. 10 UTC (11 norsk tid) for `dager` dager siden. */
  const dagerSiden = (dager: number) => new Date(naa.getTime() - dager * 86_400_000).toISOString();

  it('teller dager til og med 13, deretter uker', () => {
    expect(formatTimeAgo(dagerSiden(2), NB, 'nb', naa)).toBe('for 2 dager siden');
    expect(formatTimeAgo(dagerSiden(13), NB, 'nb', naa)).toBe('for 13 dager siden');
    expect(formatTimeAgo(dagerSiden(14), NB, 'nb', naa)).toBe('for 2 uker siden');
    expect(formatTimeAgo(dagerSiden(29), NB, 'nb', naa)).toBe('for 4 uker siden');
    expect(formatTimeAgo(dagerSiden(13), SV, 'sv', naa)).toBe('för 13 dagar sedan');
    expect(formatTimeAgo(dagerSiden(14), SV, 'sv', naa)).toBe('för 2 veckor sedan');
  });

  it('sier aldri «for 1 uker siden» eller «för 1 veckor sedan»', () => {
    for (let dager = 0; dager < 30; dager++) {
      expect(formatTimeAgo(dagerSiden(dager), NB, 'nb', naa), `${dager} dager`).not.toMatch(/\b1 uker\b/);
      expect(formatTimeAgo(dagerSiden(dager), SV, 'sv', naa), `${dager} dagar`).not.toMatch(/\b1 veckor\b/);
    }
  });
});

describe('eldre funn får datoen — i leserens tidssone', () => {
  const naa = new Date('2026-11-16T10:00:00Z');

  it('et funn kl. 00.30 norsk tid 15. oktober står som 15. oktober, ikke 14.', () => {
    // 22:30 UTC 14. oktober = 00:30 i Oslo og Stockholm 15. oktober (sommertid).
    expect(formatTimeAgo('2026-10-14T22:30:00Z', NB, 'nb', naa)).toBe('15. okt.');
    expect(formatTimeAgo('2026-10-14T22:30:00Z', SV, 'sv', naa)).toBe('15 okt.');
  });

  it('30 dager er grensen: da kommer datoen', () => {
    expect(formatTimeAgo('2026-10-17T10:00:00Z', NB, 'nb', naa)).toBe('17. okt.');
  });

  it('en ugyldig dato gir tom tekst, ikke en krasj midt i forsiden', () => {
    expect(formatTimeAgo('ikke en dato', NB, 'nb', naa)).toBe('');
  });
});
