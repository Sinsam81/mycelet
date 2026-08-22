import { describe, expect, it } from 'vitest';
import { byggPurreEpost, PURRE_MARKOR, velgUbekreftede } from '../purre';

/**
 * Utvalget avgjør hvem som får e-post fra en cron som kjører hver dag —
 * feilene som betyr noe er (1) å purre samme person to ganger, (2) å purre
 * noen som faktisk har bekreftet, og (3) å purre interne kontoer. Testene
 * låser alle tre pluss tidsvinduet.
 */

const NAA = new Date('2026-08-22T12:00:00Z');

function timerSiden(t: number): string {
  return new Date(NAA.getTime() - t * 60 * 60 * 1000).toISOString();
}

function kandidat(overstyr: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    email: 'person@example.com',
    created_at: timerSiden(48),
    email_confirmed_at: null,
    app_metadata: {},
    ...overstyr
  };
}

describe('velgUbekreftede', () => {
  it('velger en ubekreftet konto i vinduet', () => {
    expect(velgUbekreftede([kandidat()], NAA)).toHaveLength(1);
  });

  it('hopper over bekreftede kontoer', () => {
    expect(velgUbekreftede([kandidat({ email_confirmed_at: timerSiden(1) })], NAA)).toHaveLength(0);
  });

  it('purrer ALDRI samme konto to ganger', () => {
    const alt = kandidat({ app_metadata: { [PURRE_MARKOR]: '2026-08-21T07:00:00Z' } });
    expect(velgUbekreftede([alt], NAA)).toHaveLength(0);
  });

  it('venter til kontoen er minst 24 timer gammel', () => {
    expect(velgUbekreftede([kandidat({ created_at: timerSiden(23) })], NAA)).toHaveLength(0);
    expect(velgUbekreftede([kandidat({ created_at: timerSiden(25) })], NAA)).toHaveLength(1);
  });

  it('purrer ikke kontoer eldre enn ti døgn', () => {
    expect(velgUbekreftede([kandidat({ created_at: timerSiden(11 * 24) })], NAA)).toHaveLength(0);
    expect(velgUbekreftede([kandidat({ created_at: timerSiden(9 * 24) })], NAA)).toHaveLength(1);
  });

  it('rører aldri interne mycelet.com-kontoer', () => {
    expect(velgUbekreftede([kandidat({ email: 'applereview@mycelet.com' })], NAA)).toHaveLength(0);
  });

  it('tåler rare rader: manglende e-post, dato eller metadata', () => {
    const rare = [
      kandidat({ email: undefined }),
      kandidat({ created_at: undefined }),
      kandidat({ created_at: 'ikke-en-dato' }),
      kandidat({ app_metadata: null })
    ];
    // Bare raden med null-metadata er gyldig — resten mangler noe essensielt.
    expect(velgUbekreftede(rare, NAA)).toHaveLength(1);
  });

  it('takler Supabases femsifrede tidsbrøker', () => {
    expect(
      velgUbekreftede([kandidat({ created_at: '2026-08-20T04:30:11.20911+00:00' })], NAA)
    ).toHaveLength(1);
  });
});

describe('byggPurreEpost', () => {
  it('lenken står i både html og tekst, og tonen er informativ', () => {
    const e = byggPurreEpost('https://example.com/verify?token=abc');
    expect(e.html).toContain('https://example.com/verify?token=abc');
    expect(e.tekst).toContain('https://example.com/verify?token=abc');
    expect(e.emne).toBe('Fullfør registreringen din hos Mycelet');
    // Utveien for feilsendte purringer skal alltid være med.
    expect(e.tekst).toContain('se bort fra denne');
    expect(e.html).toContain('se bort fra denne');
  });
});
