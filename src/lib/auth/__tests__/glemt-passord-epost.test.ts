import { describe, expect, it } from 'vitest';
import { byggGlemtPassordEpost, lagResetLenke } from '../glemt-passord-epost';

describe('glemt passord-e-posten', () => {
  it('lenka går til /auth/reset på fast opphav med kodet token', () => {
    expect(lagResetLenke('a+b/c=')).toBe('https://www.mycelet.com/auth/reset?token_hash=a%2Bb%2Fc%3D');
  });

  it('norsk og svensk er ulike, og begge bærer lenka i tekst og html', () => {
    const lenke = lagResetLenke('abc');
    const nb = byggGlemtPassordEpost(lenke, 'nb');
    const sv = byggGlemtPassordEpost(lenke, 'sv');
    for (const e of [nb, sv]) {
      expect(e.tekst).toContain(lenke);
      expect(e.html).toContain(`href="${lenke}"`);
    }
    expect(nb.emne).toContain('passord');
    expect(sv.emne).toContain('lösenord');
    expect(sv.tekst).not.toContain('passordet');
    expect(nb.html).toContain('lang="nb"');
    expect(sv.html).toContain('lang="sv"');
  });

  it('sier at e-posten kan ignoreres, og har ingen avmeldingslenke', () => {
    const nb = byggGlemtPassordEpost(lagResetLenke('abc'), 'nb');
    expect(nb.tekst).toMatch(/se bort fra/);
    expect(nb.html).not.toMatch(/avmeld/i);
  });
});
