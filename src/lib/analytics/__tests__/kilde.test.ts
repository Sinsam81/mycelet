import { describe, expect, it } from 'vitest';
import { classifyTrafficSource } from '../traffic-source';
import { erInngangssti, kildeForForesporsel, kildeFraBesok, lesKildeCookie, normaliserKilde } from '../kilde';

const OSS = 'www.mycelet.com';

describe('kildeFraBesok', () => {
  it('bruker kampanjemerkingen når lenka har den — det er annonsetestens signatur', () => {
    const besok = classifyTrafficSource('https://www.google.com/', OSS, 'google');
    expect(kildeFraBesok(besok, 'soppkart-test')).toBe('google/soppkart-test');
  });

  it('klarer seg med bare utm_source', () => {
    expect(kildeFraBesok(classifyTrafficSource(null, OSS, 'nyhetsbrev'))).toBe('nyhetsbrev');
  });

  it('bruker type og vert når lenka ikke er merket', () => {
    expect(kildeFraBesok(classifyTrafficSource('https://www.google.no/search?q=soppkart', OSS))).toBe('sok:google.com'.replace('google.com', 'google.no'));
    expect(kildeFraBesok(classifyTrafficSource('https://l.facebook.com/', OSS))).toBe('sosialt:l.facebook.com');
    expect(kildeFraBesok(classifyTrafficSource('https://soppognyttevekster.no/', OSS))).toBe('henvisning:soppognyttevekster.no');
  });

  it('setter ingenting for direkte besøk og interne klikk', () => {
    // Direkte er et gulv, ikke en kilde. Rapporten skal si «ukjent», ikke gjette.
    expect(kildeFraBesok(classifyTrafficSource(null, OSS))).toBeNull();
    expect(kildeFraBesok(classifyTrafficSource('https://www.mycelet.com/pricing', OSS))).toBeNull();
  });

  it('holder verdien kort og ren, uansett hva noen legger i lenka', () => {
    const stygg = classifyTrafficSource(null, OSS, '<script>alert(1)</script>');
    const v = kildeFraBesok(stygg, 'a'.repeat(300));
    expect(v).not.toMatch(/[<>()]/);
    expect(v!.length).toBeLessThanOrEqual(80);
  });
});

describe('lesKildeCookie', () => {
  it('finner cookien blant de andre', () => {
    expect(lesKildeCookie('MYCELET_LOCALE=nb; mycelet_kilde=google%2Fsoppkart-test; sb-x=y')).toBe('google/soppkart-test');
  });

  it('gir null når den mangler eller er tom', () => {
    expect(lesKildeCookie(null)).toBeNull();
    expect(lesKildeCookie('')).toBeNull();
    expect(lesKildeCookie('MYCELET_LOCALE=nb')).toBeNull();
    expect(lesKildeCookie('mycelet_kilde=')).toBeNull();
  });
});

describe('normaliserKilde', () => {
  it('slipper bare korte tekster gjennom', () => {
    expect(normaliserKilde('google/soppkart-test')).toBe('google/soppkart-test');
    expect(normaliserKilde(42)).toBeNull();
    expect(normaliserKilde({ kilde: 'x' })).toBeNull();
    expect(normaliserKilde('   ')).toBeNull();
  });
});

describe('kildeForForesporsel — cookien på alle inngangssider', () => {
  const basis = { ownHost: OSS, utmSource: null, utmCampaign: null, harGclid: false };

  it('setter kilde på en områdeside, ikke bare forsiden', () => {
    expect(kildeForForesporsel({ ...basis, pathname: '/soppforhold/bergen', referer: 'https://www.google.no/' })).toBe('sok:google.no');
    expect(kildeForForesporsel({ ...basis, pathname: '/sanketips/sopp-etter-regn', referer: 'https://soppognyttevekster.no/' })).toBe(
      'henvisning:soppognyttevekster.no'
    );
  });

  it('partnerlenke med utm gir partnerens kilde — også når den åpnes i Gmail', () => {
    expect(
      kildeForForesporsel({
        ...basis,
        pathname: '/soppforhold/bergen',
        referer: 'https://mail.google.com/',
        utmSource: 'bergen-snf',
        utmCampaign: 'host-2026'
      })
    ).toBe('bergen-snf/host-2026');
  });

  it('e-postklienter og innloggingsretur er ikke kilder', () => {
    // Bekreftelseslenka fra Gmail og OAuth-returen fra Google ville ellers
    // blitt «sok:mail.google.com» — falske Google-kilder i rapporten.
    expect(kildeForForesporsel({ ...basis, pathname: '/soppvarsel', referer: 'https://mail.google.com/mail/u/0/' })).toBeNull();
    expect(kildeForForesporsel({ ...basis, pathname: '/', referer: 'https://accounts.google.com/o/oauth2/' })).toBeNull();
    expect(kildeForForesporsel({ ...basis, pathname: '/pricing', referer: 'https://checkout.stripe.com/c/pay' })).toBeNull();
  });

  it('API, OAuth-retur og filer er aldri inngangen — men registreringssiden er det', () => {
    expect(erInngangssti('/api/soppvarsel/bekreft')).toBe(false);
    expect(erInngangssti('/auth/callback')).toBe(false);
    expect(erInngangssti('/landing/soppforhold.webp')).toBe(false);
    expect(erInngangssti('/soppforhold/oslo')).toBe(true);
    expect(erInngangssti('/auth/register')).toBe(true);
    expect(kildeForForesporsel({ ...basis, pathname: '/auth/callback', referer: 'https://www.google.com/' })).toBeNull();
    expect(kildeForForesporsel({ ...basis, pathname: '/auth/register', utmSource: 'bergen-snf', referer: null })).toBe('bergen-snf');
  });

  it('webmail utenfor mail.-mønsteret er heller ikke kilder', () => {
    for (const ref of ['https://www.icloud.com/mail/', 'https://app.fastmail.com/', 'https://webmail.domeneshop.no/', 'https://mail2.example.com/']) {
      expect(kildeForForesporsel({ ...basis, pathname: '/soppvarsel', referer: ref })).toBeNull();
    }
  });

  it('videresending fra egne e-postruter (?fra=…) leser aldri Referer som kilde', () => {
    expect(kildeForForesporsel({ ...basis, pathname: '/soppforhold/bergen', referer: 'https://www.telenor.no/webmail/', fraEgenEpostrute: true })).toBeNull();
    // …men merket lenke i selve e-posten vinner fortsatt.
    expect(kildeForForesporsel({ ...basis, pathname: '/soppforhold/bergen', referer: 'https://www.telenor.no/', fraEgenEpostrute: true, utmSource: 'bergen-snf' })).toBe('bergen-snf');
  });

  it('gclid uten utm teller som Google-annonse', () => {
    expect(kildeForForesporsel({ ...basis, pathname: '/', referer: null, harGclid: true })).toBe('google/annonse');
  });
});
