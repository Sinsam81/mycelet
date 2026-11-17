import { describe, expect, it } from 'vitest';
import { byggBekreftelsesEpost } from '../email';

/**
 * Bekreftelses-eposten er porten i dobbel opt-in (migrasjon 057): uten en
 * fungerende lenke i begge språk kan ingen konto-løse abonnenter fullføre
 * påmeldingen — og feilen ville vært usynlig i det stille (e-posten sendes,
 * ingen klikker, ingen klager).
 */
describe('byggBekreftelsesEpost', () => {
  const url = 'https://www.mycelet.com/api/soppvarsel/bekreft?t=abc-123';

  it.each(['nb', 'sv'] as const)('%s: lenken står i både html og ren tekst', (locale) => {
    const { emne, html, tekst } = byggBekreftelsesEpost({ region: 'Oslo', locale, bekreftUrl: url });
    expect(html).toContain(url);
    expect(tekst).toContain(url);
    expect(emne).toContain('Oslo');
  });

  it('sv er faktisk svensk, ikke norsk fallback', () => {
    const { emne } = byggBekreftelsesEpost({ region: 'Stockholm', locale: 'sv', bekreftUrl: url });
    expect(emne).toContain('Bekräfta');
  });

  it('sier eksplisitt at ingenting sendes uten bekreftelse', () => {
    const { html } = byggBekreftelsesEpost({ region: 'Oslo', locale: 'nb', bekreftUrl: url });
    expect(html).toContain('uten bekreftelse sendes ingenting');
  });

  // Varselet fyrer bare når et område krysser terskelen, og det skjer i praksis
  // ikke om vinteren. Setningen er alltid sann (ingen datologikk i e-posten) og
  // lover ingenting om NÅR det snur.
  it.each([
    ['nb', 'Utenom sesongen kan det gå måneder mellom e-postene'],
    ['sv', 'Utanför säsongen kan det gå månader mellan mejlen']
  ] as const)('%s: sier at det kan gå måneder mellom e-postene utenom sesongen', (locale, setning) => {
    const { html, tekst } = byggBekreftelsesEpost({ region: 'Oslo', locale, bekreftUrl: url });
    expect(html).toContain(setning);
    expect(tekst).toContain(setning);
    expect(`${html} ${tekst}`).not.toMatch(/til sommeren|till sommaren|finner du|hittar du/i);
  });
});
