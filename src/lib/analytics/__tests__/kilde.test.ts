import { describe, expect, it } from 'vitest';
import { classifyTrafficSource } from '../traffic-source';
import { kildeFraBesok, lesKildeCookie, normaliserKilde } from '../kilde';

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
