import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VarselCta } from '../VarselCta';
import { COPY as PAMELDINGSTEKST } from '@/app/soppvarsel/tekst';

/**
 * Varselboksen på områdesidene er selve påmeldingsskjemaet: området er kjent,
 * så leseren skal bare skrive adressen sin — ikke hoppe til en ny side og
 * finne skjemaet der.
 *
 * Testene låser tre ting:
 *
 *   · skjemaet sender NØYAKTIG det påmeldingsruta leser (email, region, locale,
 *     retur), uten klient-JS — en skjema-POST til vår egen rute
 *   · samtykket følger med: samme setning som på /soppvarsel, og lenke til
 *     personvernerklæringen. Adressen er persondata; et skjema uten dette ville
 *     vært en påmelding uten opplyst grunnlag
 *   · de to andre variantene er som før: innlogget → profilkortet, uinnlogget
 *     uten kjent område → /soppvarsel
 */

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

/** Verdien til et skjult felt, eller null når feltet ikke finnes. */
function skjult(markup: string, navn: string): string | null {
  return new RegExp(`<input type="hidden" name="${navn}" value="([^"]*)"`).exec(markup)?.[1] ?? null;
}

describe('VarselCta — skjemaet på en områdeside', () => {
  const oslo = html(<VarselCta regionNavn="Oslo" land="NO" />);
  const goteborg = html(<VarselCta regionNavn="Göteborg" land="SE" />);

  it('er en ren skjema-POST til påmeldingsruta, med området, språket og returadressen som skjulte felt', () => {
    const skjema = /<form[^>]*>/.exec(oslo)?.[0] ?? '';
    expect(skjema).toContain('method="post"');
    expect(skjema).toContain('action="/api/soppvarsel/pamelding"');
    expect(skjult(oslo, 'region')).toBe('Oslo');
    expect(skjult(oslo, 'locale')).toBe('nb');
    expect(skjult(oslo, 'retur')).toBe('oslo');
    expect(oslo.match(/<form/g)).toHaveLength(1);
    expect(oslo.match(/type="submit"/g)).toHaveLength(1);
  });

  it('svensk områdeside: svensk påmelding, området med sitt eget navn og ASCII-slug tilbake', () => {
    expect(skjult(goteborg, 'region')).toBe('Göteborg');
    expect(skjult(goteborg, 'locale')).toBe('sv');
    expect(skjult(goteborg, 'retur')).toBe('goteborg');
    expect(goteborg).toContain('Få besked när det vänder i Göteborg');
    expect(goteborg).toContain('Få svampvarning');
    expect(goteborg).toContain(PAMELDINGSTEKST.sv.epost);
    expect(goteborg).not.toMatch(/[æøÆØ]/);
  });

  it('e-postfeltet er merket, påkrevd, og lar nettleseren fylle inn adressen', () => {
    const felt = /<input[^>]*name="email"[^>]*>/.exec(oslo)?.[0] ?? '';
    expect(felt).toContain('type="email"');
    expect(felt).toContain('required');
    expect(felt).toContain('autoComplete="email"');
    // Etiketten omslutter feltet, så den er feltets navn for en skjermleser.
    expect(oslo).toMatch(new RegExp(`<label[^>]*>${PAMELDINGSTEKST.nb.epost}<input`));
  });

  it('plassholderen i e-postfeltet står på sidens språk — svensk på svenske områder', () => {
    const plassholder = (markup: string) => {
      const felt = /<input[^>]*name="email"[^>]*>/.exec(markup)?.[0] ?? '';
      return /placeholder="([^"]*)"/.exec(felt)?.[1];
    };
    expect(plassholder(oslo)).toBe(PAMELDINGSTEKST.nb.epostEksempel);
    expect(plassholder(goteborg)).toBe(PAMELDINGSTEKST.sv.epostEksempel);
    expect(plassholder(goteborg)).toBe('du@example.com');
  });

  it('samtykket er det samme som på /soppvarsel, ord for ord, med lenke til personvernerklæringen', () => {
    expect(oslo).toContain(PAMELDINGSTEKST.nb.samtykke);
    expect(goteborg).toContain(PAMELDINGSTEKST.sv.samtykke);
    expect(oslo).toMatch(new RegExp(`<a[^>]*href="/personvern"[^>]*>${PAMELDINGSTEKST.nb.personvern}</a>`));
    expect(goteborg).toMatch(new RegExp(`<a[^>]*href="/personvern"[^>]*>${PAMELDINGSTEKST.sv.personvern}</a>`));
  });

  it('den som vil lese først, får en lenke til /soppvarsel med området ferdig valgt', () => {
    expect(oslo).toContain('href="/soppvarsel?region=Oslo"');
    expect(goteborg).toContain('href="/soppvarsel?region=G%C3%B6teborg"');
  });

  it('lover det varselet holder: når det SNUR, høyst én gang i uka — og aldri funn', () => {
    expect(oslo).toContain('Aldri oftere enn én gang i uka');
    expect(oslo).toContain('ingen konto nødvendig');
    expect(goteborg).toContain('Aldrig oftare än en gång i veckan');
    for (const markup of [oslo, goteborg]) {
      expect(markup).not.toMatch(/finner du|hittar du|garanter|daglig/i);
    }
  });
});

describe('VarselCta — de to variantene uten skjema', () => {
  it('innlogget (forsiden): knappen går til profilkortet, og ingenting ber om en adresse vi alt har', () => {
    const markup = html(<VarselCta land="NO" innlogget />);
    expect(markup).not.toContain('<form');
    expect(markup).not.toContain('name="email"');
    expect(markup).toContain('href="/profile?vis=soppvarsel"');
    expect(markup).toContain('Slå på soppvarsel');
    // Også når området er kjent: en innlogget leser melder seg på fra profilen.
    const medOmrade = html(<VarselCta regionNavn="Oslo" land="NO" innlogget />);
    expect(medOmrade).not.toContain('<form');
    expect(medOmrade).toContain('href="/profile?vis=soppvarsel"');
  });

  it('uinnlogget uten kjent område: lenke til /soppvarsel, der området velges', () => {
    const markup = html(<VarselCta land="SE" />);
    expect(markup).not.toContain('<form');
    expect(markup).toContain('href="/soppvarsel"');
    expect(markup).toContain('Få svampvarning');
  });
});
