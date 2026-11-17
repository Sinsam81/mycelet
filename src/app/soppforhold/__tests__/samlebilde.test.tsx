import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BANDFARGE_PA_MORK, SAMLEBILDE_TEKST, samlebilde } from '../samlebilde';
import type { SoppforholdRegion } from '../hent-regioner';
import { REGION_BAND_HEX, REGION_CONDITION_THRESHOLDS } from '@/lib/prediction/region-score';

/**
 * Delingsbildet for /soppforhold hentes av skrapere uten språkcookie. Det sa
 * «Soppforhold i Norge i dag» og «Best akkurat nå: <norsk område>» til alle —
 * også når en svensk leser delte siden, som for hen er svensk med Sverige
 * først. Bildet kan ikke følge leseren, så det skal være riktig for begge.
 *
 * Tegningen er vanlige <div>-er, så den kan leses som tekst her uten å lage et
 * bilde.
 */

const region = (name: string, country: 'NO' | 'SE', score: number): SoppforholdRegion => ({
  name,
  country,
  score,
  cells: 20,
  leadingSpecies: 'Kantarell',
  leadingInSeason: true,
  verdict: 'Nå er det kantarell 🍄'
});

const SESONG = [region('Göteborg', 'SE', 88), region('Trondheim', 'NO', 84), region('Stockholm', 'SE', 70), region('Oslo', 'NO', 61)];
const VINTER = [region('Bergen', 'NO', 4), region('Göteborg', 'SE', 3), region('Oslo', 'NO', 2)];

const tegn = (args: Partial<Parameters<typeof samlebilde>[0]> = {}) =>
  renderToStaticMarkup(samlebilde({ tileDate: '2026-09-15', regions: SESONG, iHovedsesong: true, ...args }));

/** Teksten slik den står i bildet, uten markup. */
const tekst = (html: string) => html.replace(/<[^>]+>/g, '|').replace(/&amp;/g, '&');

describe('samlebilde', () => {
  it('viser det beste området i BEGGE land — ikke bare Norge', () => {
    const t = tekst(tegn());
    expect(t).toContain('Norge');
    expect(t).toContain('Trondheim');
    expect(t).toContain('|84|');
    expect(t).toContain('Sverige');
    expect(t).toContain('Göteborg');
    expect(t).toContain('|88|');
    // Norge først, fast — bildet er det samme for alle.
    expect(t.indexOf('Norge')).toBeLessThan(t.indexOf('Sverige'));
    // Bare de to beste: ikke en tabell.
    expect(t).not.toContain('Stockholm');
    expect(t).not.toContain('Oslo');
  });

  it('sier ikke lenger «Soppforhold i Norge i dag» — etiketten står på begge språk', () => {
    const t = tekst(tegn());
    expect(t).toContain('Soppforhold i dag · Svampläget idag');
    expect(t).not.toContain('i Norge i dag');
    expect(t).not.toContain('Best akkurat nå');
  });

  it('datoen står som tall, så den leses likt på norsk og svensk', () => {
    expect(tekst(tegn())).toContain('Soppforhold i dag · Svampläget idag · 15.09.2026');
    expect(tekst(tegn({ tileDate: null }))).toContain('|Soppforhold i dag · Svampläget idag|');
  });

  it('bærer forbeholdet på begge språk: tallet gjelder et område, ikke skogen der du står', () => {
    const t = tekst(tegn());
    expect(t).toContain('Vær, sesong og skogtype for området, ikke skogen der du står');
    expect(t).toContain('Väder, säsong och skogstyp för området, inte skogen där du står');
  });

  it('bruker ingen dom og ingen artsnavn — de er setninger på ett språk', () => {
    const t = tekst(tegn());
    expect(t).not.toMatch(/kantarell/i);
    expect(t).not.toContain('🍄');
  });

  it('tallet får BÅNDET fra regionstigen — samme stige som prikken og dommen på siden', () => {
    const { excellent, moderate } = REGION_CONDITION_THRESHOLDS;
    const farge = (score: number) => /color:(#[0-9a-fA-F]{6})">\d+<\/div>/.exec(tegn({ regions: [region('Oslo', 'NO', score)] }))?.[1];
    expect(farge(excellent)).toBe(BANDFARGE_PA_MORK.green);
    expect(farge(excellent - 1)).toBe(BANDFARGE_PA_MORK.amber);
    expect(farge(moderate)).toBe(BANDFARGE_PA_MORK.amber);
    expect(farge(moderate - 1)).toBe(BANDFARGE_PA_MORK.grey);
  });

  it('alle tre båndfargene er lesbare mot bildets mørke bakgrunn (minst 4,5:1)', () => {
    // Stigens egen grønn (#4d7c3a) gir 2,8:1 mot #1A3409: toppdommen var det
    // tallet i bildet som var vanskeligst å lese. WCAG-kontrast, regnet her.
    const lys = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const kontrast = (a: string, b: string) => {
      const [hoy, lav] = [lys(a), lys(b)].sort((x, y) => y - x);
      return (hoy + 0.05) / (lav + 0.05);
    };
    const BAKGRUNN = '#1A3409';
    expect(tegn()).toContain(`background-color:${BAKGRUNN}`);
    for (const [band, hex] of Object.entries(BANDFARGE_PA_MORK)) {
      expect(kontrast(hex, BAKGRUNN), band).toBeGreaterThanOrEqual(4.5);
    }
    // Premisset: stigens grønn holder ikke her. Ryker denne, kan tabellen gå.
    expect(kontrast(REGION_BAND_HEX.green, BAKGRUNN)).toBeLessThan(3);
    // Gult og grått er stigens egne.
    expect(BANDFARGE_PA_MORK.amber).toBe(REGION_BAND_HEX.amber);
    expect(BANDFARGE_PA_MORK.grey).toBe(REGION_BAND_HEX.grey);
  });

  it('et land uten tall i dagens raster får ingen rad — det andre vises som vanlig', () => {
    const bareNorge = tekst(tegn({ regions: SESONG.filter((r) => r.country === 'NO') }));
    expect(bareNorge).toContain('Trondheim');
    expect(bareNorge).not.toContain('Sverige');
    const bareSverige = tekst(tegn({ regions: SESONG.filter((r) => r.country === 'SE') }));
    expect(bareSverige).toContain('Göteborg');
    expect(bareSverige).not.toContain('Norge');
  });

  it('utenom sesongen: sier det rett ut på begge språk i stedet for å plakatere «4 av 100»', () => {
    const t = tekst(tegn({ regions: VINTER, iHovedsesong: false, tileDate: '2026-01-15' }));
    expect(t).toContain('Utenom hovedsesongen — stille i alle områdene nå');
    expect(t).toContain('Utanför högsäsongen — stilla i alla områden nu');
    expect(t).not.toContain('Bergen');
    expect(t).not.toContain('av 100');
  });

  it('en tørr uke I sesongen er ikke «utenom sesongen»: da står tallene', () => {
    const t = tekst(tegn({ regions: VINTER, iHovedsesong: true }));
    expect(t).not.toContain('Utenom hovedsesongen');
    expect(t).toContain('Bergen');
    expect(t).toContain('|4|');
  });

  it('en god dag utenom kalendersesongen er fortsatt en god dag', () => {
    const t = tekst(tegn({ iHovedsesong: false }));
    expect(t).not.toContain('Utenom hovedsesongen');
    expect(t).toContain('Trondheim');
  });

  it('uten tall overhodet: ingen oppdiktede rader, bare at siden oppdateres — på begge språk', () => {
    const t = tekst(tegn({ regions: [], tileDate: null }));
    expect(t).toContain('Oppdateres hver morgen · Uppdateras varje morgon');
    expect(t).not.toContain('av 100');
    // «22 områder» sto hardkodet her. Antallet skal ikke påstås uten tall.
    expect(t).not.toMatch(/\d+ områder/);
  });

  it('tegnemotoren (Satori) krever display: flex på hver <div> med innhold', () => {
    const html = tegn();
    const diver = html.match(/<div[^>]*>/g) ?? [];
    // De to flatene i soppmerket er tomme og trenger det ikke.
    const utenFlex = diver.filter((d) => !d.includes('display:flex'));
    expect(utenFlex).toHaveLength(2);
    for (const d of utenFlex) expect(d).toContain('background-color');
  });

  it('norsk og svensk linje står parvis i teksttabellen', () => {
    expect(SAMLEBILDE_TEKST.utenomSesong).toHaveLength(2);
    expect(SAMLEBILDE_TEKST.forbehold).toHaveLength(2);
    expect(SAMLEBILDE_TEKST.utenomSesong[1]).not.toMatch(/[æøÆØ]/);
    expect(SAMLEBILDE_TEKST.forbehold[1]).not.toMatch(/[æøÆØ]/);
  });
});
