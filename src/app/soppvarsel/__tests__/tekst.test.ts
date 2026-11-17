import { describe, expect, it } from 'vitest';
import { COPY, PAMELDING_STATUSER, erPameldingStatus, omradeSvar, soppvarselMetadata, statuslinje } from '../tekst';

/**
 * Statuslinja er det eneste svaret den som melder seg på får fra siden. To
 * ting gikk galt med den: «Sjekk innboksen! Vi har sendt deg en
 * bekreftelseslenke» sto også når ingenting ble sendt (adressen var påmeldt
 * fra før), og den som traff taket per klient fikk «Noe manglet — sjekk at
 * e-postadressen er riktig», som er feil årsak.
 */

describe('statuslinje', () => {
  it('hver status ruta kan sende har en tekst på begge språk', () => {
    for (const locale of ['nb', 'sv'] as const) {
      for (const status of PAMELDING_STATUSER) {
        const linje = statuslinje(status, locale, true);
        expect(linje, `${status} ${locale}`).not.toBeNull();
        expect(linje?.tekst.length).toBeGreaterThan(10);
        expect(linje?.farge).toMatch(/^border-\S+ bg-\S+ text-\S+$/);
      }
    }
  });

  it('ukjent eller manglende status gir ingen linje — fri tekst fra adressefeltet blir aldri en melding', () => {
    expect(statuslinje(undefined, 'nb', true)).toBeNull();
    expect(statuslinje(null, 'nb', true)).toBeNull();
    expect(statuslinje('', 'nb', true)).toBeNull();
    expect(statuslinje('<script>', 'nb', true)).toBeNull();
    expect(statuslinje('SENDT', 'nb', true)).toBeNull();
    expect(erPameldingStatus('for-mange')).toBe(true);
    expect(erPameldingStatus('toString')).toBe(false);
  });

  it('«sendt» er sann også når ingen e-post gikk: sier at vi ikke sender en ny til en som er påmeldt eller nettopp fikk lenka', () => {
    // Ruta svarer «sendt» i fire tilfeller (sendt, påmeldt fra før, nylig sendt,
    // taket per adresse) og kan ikke si hvilket uten å bli et orakel.
    const nb = statuslinje('sendt', 'nb', true)?.tekst ?? '';
    expect(nb).toContain('Sjekk innboksen');
    expect(nb).toContain('allerede påmeldt');
    expect(nb).toContain('nettopp fått en lenke');
    expect(nb).toContain('sender vi ikke en ny');
    const sv = statuslinje('sendt', 'sv', true)?.tekst ?? '';
    expect(sv).toContain('Kolla inkorgen');
    expect(sv).toContain('redan anmäld');
    expect(sv).toContain('nyss fått en länk');
    expect(sv).toContain('skickar vi ingen ny');
  });

  it('taket per klient har sin egen tekst — ikke «noe manglet»', () => {
    expect(statuslinje('for-mange', 'nb', true)?.tekst).toBe('For mange forsøk herfra — prøv igjen om en time.');
    expect(statuslinje('for-mange', 'sv', true)?.tekst).toBe('För många försök härifrån — försök igen om en timme.');
    expect(statuslinje('for-mange', 'nb', true)?.tekst).not.toBe(statuslinje('ugyldig', 'nb', true)?.tekst);
    // Gult som de andre «prøv igjen»-meldingene, ikke rødt som en feil hos oss.
    expect(statuslinje('for-mange', 'nb', true)?.farge).toBe(statuslinje('ugyldig', 'nb', true)?.farge);
    expect(statuslinje('feil', 'nb', true)?.farge).toContain('red');
  });

  it('kvitteringen etter bekreftelse får én setning til utenom sesongen — og bare da', () => {
    const iSesong = statuslinje('bekreftet', 'nb', true)?.tekst ?? '';
    const utenom = statuslinje('bekreftet', 'nb', false)?.tekst ?? '';
    expect(iSesong).toBe(COPY.nb.statusBekreftet);
    expect(utenom).toBe(`${COPY.nb.statusBekreftet} ${COPY.nb.statusBekreftetUtenomSesong}`);
    expect(utenom).toContain('kan gå måneder');
    expect(statuslinje('bekreftet', 'sv', false)?.tekst).toContain('kan dröja månader');
    // Sesongen angår ingen av de andre statusene.
    for (const status of PAMELDING_STATUSER.filter((s) => s !== 'bekreftet')) {
      expect(statuslinje(status, 'nb', false)).toEqual(statuslinje(status, 'nb', true));
    }
  });

  it('svensk er svensk — ingen norske bokstaver i statustekstene', () => {
    for (const status of PAMELDING_STATUSER) {
      expect(statuslinje(status, 'sv', false)?.tekst, status).not.toMatch(/[æøÆØ]/);
    }
  });

  it('lover aldri funn, og sier aldri noe om HVOR', () => {
    for (const locale of ['nb', 'sv'] as const) {
      for (const status of PAMELDING_STATUSER) {
        expect(statuslinje(status, locale, false)?.tekst).not.toMatch(/finner du|hittar du|garanter/i);
      }
    }
  });
});

describe('statuslinje der området er gitt av siden', () => {
  it('«ugyldig» handler bare om adressen — ikke «sjekk at du har valgt et område»', () => {
    // Skjemaet på en områdeside har området som skjult felt. Rådet om å velge
    // et område ville sendt leseren på leting etter et valg som ikke finnes.
    const nb = statuslinje('ugyldig', 'nb', true, true)?.tekst ?? '';
    expect(nb).toBe(COPY.nb.statusUgyldigEpost);
    expect(nb).not.toMatch(/område/i);
    const sv = statuslinje('ugyldig', 'sv', true, true)?.tekst ?? '';
    expect(sv).toBe(COPY.sv.statusUgyldigEpost);
    expect(sv).not.toMatch(/område|[æøÆØ]/i);
    // På /soppvarsel, der området velges, står rådet som før.
    expect(statuslinje('ugyldig', 'nb', true)?.tekst).toContain('valgt et område');
    // Samme farge: det er samme slags beskjed.
    expect(statuslinje('ugyldig', 'nb', true, true)?.farge).toBe(statuslinje('ugyldig', 'nb', true)?.farge);
  });

  it('de andre statusene er uendret', () => {
    for (const status of PAMELDING_STATUSER.filter((s) => s !== 'ugyldig')) {
      expect(statuslinje(status, 'nb', true, true)).toEqual(statuslinje(status, 'nb', true));
      expect(statuslinje(status, 'sv', false, true)).toEqual(statuslinje(status, 'sv', false));
    }
  });
});

describe('omradeSvar — svaret rundt skjemaet på en områdeside', () => {
  it('«sendt»: linja vises og skjemaet skjules — neste steg er innboksen', () => {
    const svar = omradeSvar('sendt', 'nb');
    expect(svar.linje?.tekst).toBe(COPY.nb.statusSendt);
    expect(svar.visSkjema).toBe(false);
  });

  it('der skjemaet er skjult, står en vei tilbake til det — for den som skrev feil adresse', () => {
    expect(omradeSvar('sendt', 'nb').nyttForsok).toBe('Skrev du feil adresse? Prøv igjen.');
    expect(omradeSvar('sendt', 'sv').nyttForsok).toBe('Skrev du fel adress? Försök igen.');
    // Står skjemaet der, trengs ingen lenke til det.
    for (const status of ['ugyldig', 'for-mange', 'feil', 'bekreftet', undefined]) {
      expect(omradeSvar(status, 'nb').nyttForsok, String(status)).toBeNull();
    }
  });

  it('«ugyldig», «for-mange» og «feil»: linja vises over skjemaet, som står så leseren kan prøve igjen', () => {
    expect(omradeSvar('ugyldig', 'nb')).toEqual({
      linje: statuslinje('ugyldig', 'nb', true, true),
      visSkjema: true,
      nyttForsok: null
    });
    expect(omradeSvar('for-mange', 'sv').linje?.tekst).toBe(COPY.sv.statusForMange);
    expect(omradeSvar('for-mange', 'sv').visSkjema).toBe(true);
    expect(omradeSvar('feil', 'nb').linje?.farge).toContain('red');
    expect(omradeSvar('feil', 'nb').visSkjema).toBe(true);
  });

  it('«bekreftet» har sitt eget banner på siden, og «ugyldig-lenke» sendes aldri dit: ingen linje', () => {
    expect(omradeSvar('bekreftet', 'nb').linje).toBeNull();
    expect(omradeSvar('ugyldig-lenke', 'nb').linje).toBeNull();
  });

  it('uten status, eller med fri tekst i adressefeltet: bare skjemaet', () => {
    for (const status of [undefined, null, '', 'SENDT', '<script>', 'toString']) {
      expect(omradeSvar(status, 'nb')).toEqual({ linje: null, visSkjema: true, nyttForsok: null });
    }
  });

  it('språket følger siden', () => {
    expect(omradeSvar('sendt', 'sv').linje?.tekst).toBe(COPY.sv.statusSendt);
    expect(omradeSvar('ugyldig', 'sv').linje?.tekst).toBe(COPY.sv.statusUgyldigEpost);
  });
});

describe('soppvarselMetadata — siden hadde ingen, og arvet appens generelle tittel', () => {
  it('egen tittel og beskrivelse på leserens språk, uten merkenavnet (rot-layouten legger det til)', () => {
    const nb = soppvarselMetadata('nb');
    expect(nb.title).toBe('Soppvarsel på e-post');
    expect(nb.description).toBe(COPY.nb.metaBeskrivelse);
    const sv = soppvarselMetadata('sv');
    expect(sv.title).toBe('Svampvarning via mejl');
    expect(sv.description).toBe(COPY.sv.metaBeskrivelse);
    for (const meta of [nb, sv]) {
      expect(String(meta.title)).not.toMatch(/Mycelet/);
      // Søketreff kapper beskrivelsen rundt 160 tegn — løftet skal få plass.
      expect(String(meta.description).length).toBeLessThanOrEqual(175);
    }
    expect(String(sv.description)).not.toMatch(/[æøÆØ]/);
  });

  it('canonical er den rene adressen — lik for alle ?status=-verdier', () => {
    expect(soppvarselMetadata('nb').alternates?.canonical).toBe('https://www.mycelet.com/soppvarsel');
    expect(soppvarselMetadata('sv').alternates?.canonical).toBe('https://www.mycelet.com/soppvarsel');
  });

  it('delingskortet er fullt utfylt: Next erstatter rot-layoutens openGraph, så siteName og locale gjentas', () => {
    expect(soppvarselMetadata('nb').openGraph).toEqual({
      title: 'Soppvarsel på e-post',
      description: COPY.nb.metaBeskrivelse,
      url: 'https://www.mycelet.com/soppvarsel',
      type: 'website',
      siteName: 'Mycelet',
      locale: 'nb_NO'
    });
    expect(soppvarselMetadata('sv').openGraph).toMatchObject({
      title: 'Svampvarning via mejl',
      siteName: 'Mycelet',
      locale: 'sv_SE'
    });
  });

  it('holder sidens ærlighetslinje: når det snur, høyst én i uka — og aldri et løfte om funn', () => {
    expect(COPY.nb.metaBeskrivelse).toContain('snur');
    expect(COPY.nb.metaBeskrivelse).toContain('aldri mer enn én i uka');
    expect(COPY.nb.metaBeskrivelse).toContain('Vi lover aldri funn');
    expect(COPY.sv.metaBeskrivelse).toContain('vänder');
    expect(COPY.sv.metaBeskrivelse).toContain('aldrig mer än ett i veckan');
    expect(COPY.sv.metaBeskrivelse).toContain('Vi lovar aldrig fynd');
    for (const tekst of [COPY.nb.metaBeskrivelse, COPY.sv.metaBeskrivelse]) {
      expect(tekst).not.toMatch(/finner du|hittar du|garanter|her finner|här hittar/i);
    }
  });
});

describe('COPY', () => {
  it('nb og sv har nøyaktig de samme nøklene', () => {
    expect(Object.keys(COPY.sv).sort()).toEqual(Object.keys(COPY.nb).sort());
  });

  it('svensk er svensk — ingen norske bokstaver i noen av tekstene', () => {
    for (const [nokkel, tekst] of Object.entries(COPY.sv)) {
      expect(tekst, nokkel).not.toMatch(/[æøÆØ]/);
    }
  });

  it('plassholderen i e-postfeltet står på hvert sitt språk, på et domene reservert til eksempler', () => {
    // Svenske skjemaer viste «deg@example.com» — «deg» er norsk, og betyr «deig» på svensk.
    expect(COPY.nb.epostEksempel).toBe('deg@example.com');
    expect(COPY.sv.epostEksempel).toBe('du@example.com');
    // RFC 2606: example.com kan aldri være noens ekte adresse. eksempel.no og
    // exempel.se er vanlige domener som kan tilhøre noen.
    for (const locale of ['nb', 'sv'] as const) {
      expect(COPY[locale].epostEksempel).toMatch(/^[a-z]+@example\.com$/);
    }
  });
});
