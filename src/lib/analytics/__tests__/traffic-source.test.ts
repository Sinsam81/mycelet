import { describe, expect, it } from 'vitest';
import { classifyTrafficSource } from '../traffic-source';

const OSS = 'www.mycelet.com';

describe('classifyTrafficSource', () => {
  it('kjenner igjen søkemotorene, også de norske domenene', () => {
    for (const r of [
      'https://www.google.no/',
      'https://www.google.com/search?q=soppkart',
      'https://duckduckgo.com/',
      'https://www.bing.com/search?q=sopp',
      'https://www.kvasir.no/'
    ]) {
      expect(classifyTrafficSource(r, OSS).kind, r).toBe('søk');
    }
  });

  it('kjenner igjen Facebook også gjennom lenkeomdirigeringene deres', () => {
    // Facebook sender folk via l.facebook.com og lm.facebook.com (mobil).
    // Uten disse ville alle klikk fra Facebook-grupper — den viktigste
    // kanalen for denne appen — havnet under «henvisning».
    for (const r of ['https://www.facebook.com/', 'https://l.facebook.com/', 'https://lm.facebook.com/', 'https://m.facebook.com/']) {
      expect(classifyTrafficSource(r, OSS).kind, r).toBe('sosialt');
    }
    expect(classifyTrafficSource('https://t.co/abc123', OSS).kind).toBe('sosialt');
  });

  it('skiller interne klikk fra ekte henvisninger', () => {
    // Uten dette ville hvert klikk inne på siden telt som en ny besøkende
    // utenfra, og alle tall vært verdiløse.
    expect(classifyTrafficSource('https://www.mycelet.com/pricing', OSS).kind).toBe('intern');
    expect(classifyTrafficSource('https://mycelet.com/sanketips/les-terrenget', OSS).kind).toBe('intern');
  });

  it('kaller ukjente nettsteder henvisning, og tar vare på verten', () => {
    const t = classifyTrafficSource('https://soppogsopp.no/lenker', OSS);
    expect(t.kind).toBe('henvisning');
    expect(t.host).toBe('soppogsopp.no');
  });

  it('lagrer aldri mer enn vertsnavnet', () => {
    // Selve adressen kan bære søkeord eller noe personlig. Bare verten beholdes.
    const t = classifyTrafficSource('https://www.google.com/search?q=hvem+er+personen', OSS);
    expect(t.host).toBe('google.com');
    expect(JSON.stringify(t)).not.toMatch(/personen|search|\?/);
  });

  it('behandler manglende og ugyldig henvisning som direkte', () => {
    expect(classifyTrafficSource(null, OSS).kind).toBe('direkte');
    expect(classifyTrafficSource('', OSS).kind).toBe('direkte');
    expect(classifyTrafficSource('ikke-en-url', OSS).kind).toBe('direkte');
  });

  it('tar med kampanjemerkingen når lenka har den', () => {
    const t = classifyTrafficSource('https://l.facebook.com/', OSS, 'fb-gruppe-soppjakt');
    expect(t.kind).toBe('sosialt');
    expect(t.campaign).toBe('fb-gruppe-soppjakt');
  });

  it('lar en lang kampanjestreng ikke svelle loggen', () => {
    const t = classifyTrafficSource(null, OSS, 'a'.repeat(500));
    expect(t.campaign).toHaveLength(60);
  });
});
