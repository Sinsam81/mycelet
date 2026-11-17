import { describe, expect, it } from 'vitest';
import { byggPurreEpost, PURRE_KALL_FRIST_MS, PURRE_KJORETID_FRIST_MS, PURRE_MARKOR, velgUbekreftede } from '../purre';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

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
  const LENKE = 'https://example.com/verify?token=abc';

  it('lenken står i både html og tekst, og tonen er informativ', () => {
    const e = byggPurreEpost(LENKE);
    expect(e.html).toContain(LENKE);
    expect(e.tekst).toContain(LENKE);
    expect(e.emne).toBe('Fullfør registreringen din hos Mycelet');
    // Utveien for feilsendte purringer skal alltid være med.
    expect(e.tekst).toContain('se bort fra denne');
    expect(e.html).toContain('se bort fra denne');
  });

  it('uten språk er e-posten norsk — kontoer fra før språket ble lagret har ikke noe annet', () => {
    const e = byggPurreEpost(LENKE);
    expect(e).toEqual(byggPurreEpost(LENKE, 'nb'));
    expect(e.html).toContain('<html lang="nb">');
    expect(e.html).toContain('Bekreft e-postadressen min');
    expect(e.tekst).toContain('Skogshilsen,');
  });

  it('svensk konto får svensk e-post: emne, brødtekst, knapp og hilsen', () => {
    // Den var bare norsk. En svenske som registrerte seg på svensk og aldri
    // bekreftet, fikk den ENE e-posten vi sender for å hente hen inn igjen på
    // norsk — fra en avsender hen ikke kjenner.
    const e = byggPurreEpost(LENKE, 'sv');
    expect(e.emne).toBe('Slutför din registrering hos Mycelet');
    expect(e.html).toContain('<html lang="sv">');
    expect(e.html).toContain('Slutför din registrering');
    expect(e.html).toContain('Bekräfta min e-postadress');
    expect(e.html).toContain('svampprognos, svampkarta och artbibliotek för Norge och Sverige');
    expect(e.tekst).toContain('Hej!');
    expect(e.tekst).toContain('Skogshälsningar,');
    // Lenka og utveien er med, akkurat som på norsk.
    expect(e.html).toContain(LENKE);
    expect(e.tekst).toContain(LENKE);
    expect(e.tekst).toContain('bortse från det här mejlet');
    expect(e.html).toContain('bortse från det här mejlet');
    // Ingen norsk tekst igjen: æ og ø finnes ikke på svensk.
    for (const del of [e.emne, e.tekst, e.html]) expect(del).not.toMatch(/[æøÆØ]/);
    expect(e.tekst).not.toMatch(/\b(ikke|og|deg|din e-postadresse ble)\b/);
  });

  it('de to språkene har samme oppbygning: like mange linjer, lenka på samme sted', () => {
    const norsk = byggPurreEpost(LENKE, 'nb').tekst.split('\n');
    const svensk = byggPurreEpost(LENKE, 'sv').tekst.split('\n');
    expect(svensk).toHaveLength(norsk.length);
    expect(svensk.indexOf(LENKE)).toBe(norsk.indexOf(LENKE));
    expect(norsk.indexOf(LENKE)).toBeGreaterThan(0);
  });

  it('siterer knappen på innloggingssiden slik den faktisk heter — på begge språk', () => {
    // E-posten ber mottakeren bruke «Glemt passord?» når lenka har sluttet å
    // virke. Heter knappen noe annet, leter hen etter noe som ikke finnes.
    expect(byggPurreEpost(LENKE, 'nb').tekst).toContain(`«${nb.AuthLogin.forgotPassword}»`);
    expect(byggPurreEpost(LENKE, 'nb').html).toContain(`«${nb.AuthLogin.forgotPassword}»`);
    expect(byggPurreEpost(LENKE, 'sv').tekst).toContain(`”${sv.AuthLogin.forgotPassword}”`);
    expect(byggPurreEpost(LENKE, 'sv').html).toContain(`”${sv.AuthLogin.forgotPassword}”`);
  });

  it('et ukjent språk gir norsk, ikke en tom e-post', () => {
    const e = byggPurreEpost(LENKE, 'en' as never);
    expect(e.emne).toBe('Fullfør registreringen din hos Mycelet');
    expect(e.html).toContain('<html lang="nb">');
  });

  it('samme avsenderadresse og samme innloggingslenke uansett språk', () => {
    for (const locale of ['nb', 'sv'] as const) {
      const e = byggPurreEpost(LENKE, locale);
      expect(e.tekst).toContain('post@mycelet.com');
      expect(e.html).toContain('href="https://www.mycelet.com/auth/login"');
      expect(e.html).toContain('mailto:post@mycelet.com');
    }
  });
});

describe('cronens frister', () => {
  it('verste fall for én kandidat får plass mellom kjøretidsfristen og rutas maxDuration (120 s)', () => {
    // Lenke + merking (to kall mot Supabase) + utsending (15 s i sendEpost) +
    // pausen etterpå. Starter en kandidat rett før fristen, skal den rekke å
    // bli ferdig før plattformen dreper funksjonen.
    const verstefall = 2 * PURRE_KALL_FRIST_MS + 15_000 + 600;
    expect(PURRE_KJORETID_FRIST_MS + verstefall).toBeLessThan(120_000);
  });
});
