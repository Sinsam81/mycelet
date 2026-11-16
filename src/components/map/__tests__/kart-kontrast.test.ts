import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import colors from 'tailwindcss/colors';
import config from '../../../../tailwind.config';
import {
  SPISELIGHET_MARKORFARGE,
  SPISELIGHET_TEKSTFARGE,
  UKJENT_TEKSTFARGE
} from '@/lib/map/spiselighetsfarger';

/**
 * Tekst på kartet skal kunne leses ute i dagslys.
 *
 * Premium-låsen sto i hvitt på amber-500 (2,15:1), gruppeoverskriftene i søket
 * og tallene i ukesutsikten i gray-400 (2,54:1), og popupen på et registrert
 * funn skrev «Arten regnes som: Betinget spiselig» i markørens gule farge
 * (2,15:1). WCAG AA krever 4,5:1 for tekst i disse størrelsene.
 *
 * Forholdene regnes ut av de faktiske fargeverdiene (Tailwinds standardpalett
 * og forest-paletten i tailwind.config.ts), så et fargebytte ikke kan senke
 * dem igjen uten at denne testen blir rød.
 */

const forest = (config.theme?.extend?.colors as { forest: Record<string, string> }).forest;

function hex(token: string): string {
  if (token === 'white') return '#ffffff';
  const [navn, trinn] = token.split('-');
  const farge = navn === 'forest' ? forest[trinn] : (colors as unknown as Record<string, Record<string, string>>)[navn]?.[trinn];
  if (!farge) throw new Error(`Ukjent farge: ${token}`);
  return farge;
}

function luminans(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function kontrast(a: string, b: string): number {
  const [lys, mork] = [luminans(a), luminans(b)].sort((x, y) => y - x);
  return (lys + 0.05) / (mork + 0.05);
}

const MAPPE = new URL('..', import.meta.url);
const kildefiler = readdirSync(MAPPE).filter((navn) => /\.(ts|tsx)$/.test(navn));
const les = (navn: string) => readFileSync(new URL(navn, MAPPE), 'utf8');
const KART = les('MushroomMap.tsx');

describe('regnestykket', () => {
  it('gir kjente forhold', () => {
    expect(kontrast('#ffffff', '#000000')).toBeCloseTo(21, 1);
    // De gamle, for svake parene — holder regnestykket ærlig.
    expect(kontrast(hex('amber-500'), '#ffffff')).toBeLessThan(2.5);
    expect(kontrast(hex('gray-400'), '#ffffff')).toBeLessThan(3);
  });
});

describe('Premium-låsen over de lovende områdene', () => {
  const start = KART.indexOf("topAccess === 'free_limited' && topSpots ? (");
  // Klassene står enten som en ren streng eller i en mal (className={`…`}).
  const treff = KART.slice(start, KART.indexOf("t('seeAll12Premium')", start)).match(/className=(?:"([^"]+)"|\{`([^`]+)`\})/);
  const klasser = treff?.[1] ?? treff?.[2] ?? '';

  it('står i kildekoden der testen leter', () => {
    expect(start).toBeGreaterThan(-1);
    expect(klasser).toContain('rounded-full');
  });

  it('har mørk tekst på gul flate, minst 4,5:1', () => {
    expect(klasser).toMatch(/\bbg-amber-400\b/);
    expect(klasser).toMatch(/\btext-forest-900\b/);
    expect(kontrast(hex('amber-400'), hex('forest-900'))).toBeGreaterThanOrEqual(4.5);
  });

  it('holder kontrasten også når pekeren står over — amber-600 med mørk tekst gjør det ikke', () => {
    const hover = klasser.match(/\bhover:bg-(amber-\d+)\b/)?.[1];
    expect(hover).toBe('amber-500');
    expect(kontrast(hex(hover!), hex('forest-900'))).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(hex('amber-600'), hex('forest-900'))).toBeLessThan(4.5);
  });
});

describe('grå tekst i kartkomponentene', () => {
  it('bruker ikke gray-400 — 2,54:1 mot hvitt', () => {
    const treff = kildefiler.filter((navn) => /\btext-gray-400\b/.test(les(navn)));
    expect(treff).toEqual([]);
  });

  it('bruker ikke #9ca3af i popupene som bygges som HTML', () => {
    const treff = kildefiler.filter((navn) => /color:\s*#9ca3af/i.test(les(navn)));
    expect(treff).toEqual([]);
  });

  it('gray-600, som erstattet den, holder mot både hvitt og den kremfargede bakgrunnen', () => {
    expect(kontrast(hex('gray-600'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(hex('gray-600'), '#F5F0E8')).toBeGreaterThanOrEqual(4.5);
    // gray-500 holder ikke mot krem, derfor 600.
    expect(kontrast(hex('gray-500'), '#F5F0E8')).toBeLessThan(4.5);
  });
});

describe('sesongfilteret når det er på', () => {
  it('har hvit tekst på en flate som er mørk nok', () => {
    const klasser = KART.match(/occSeason \? '([^']+)'/)?.[1] ?? '';
    const bg = klasser.match(/\bbg-([a-z]+-\d+)\b/)?.[1];
    expect(klasser).toMatch(/\btext-white\b/);
    expect(bg).toBeTruthy();
    expect(kontrast(hex(bg!), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('spiseligheten i popupen på et registrert funn', () => {
  it('har en tekstfarge for hver klasse markørene har', () => {
    expect(Object.keys(SPISELIGHET_TEKSTFARGE).sort()).toEqual(Object.keys(SPISELIGHET_MARKORFARGE).sort());
  });

  for (const [klasse, farge] of Object.entries(SPISELIGHET_TEKSTFARGE)) {
    it(`${klasse}: teksten har minst 4,5:1 mot hvitt`, () => {
      expect(kontrast(farge, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('reservefargen holder også', () => {
    expect(kontrast(UKJENT_TEKSTFARGE, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('markørfargene alene holder ikke som tekst — derfor to sett', () => {
    expect(kontrast(SPISELIGHET_MARKORFARGE.conditionally_edible, '#ffffff')).toBeLessThan(3);
    expect(kontrast(SPISELIGHET_MARKORFARGE.edible, '#ffffff')).toBeLessThan(4.5);
  });

  it('popupen skriver etiketten i tekstfargen, og markøren tegnes i markørfargen', () => {
    const popup = KART.slice(KART.indexOf('const byggPopup = (o: OccRow): string => {'), KART.indexOf('for (const o of points) {'));
    expect(popup).toContain('SPISELIGHET_TEKSTFARGE[edi]');
    expect(popup).not.toContain('SPISELIGHET_MARKORFARGE');
    const tegning = KART.slice(KART.indexOf('for (const o of points) {'), KART.indexOf('lastOccDrawRef.current = {'));
    expect(tegning).toContain('SPISELIGHET_MARKORFARGE[edi]');
  });

  it('giftig og dødelig står fortsatt i rødt, og spiselig i grønt', () => {
    // Rødt = mye mer rødt enn grønt og blått. Hindrer at en «mørkere» farge
    // en dag byttes til noe som ikke lenger leses som advarsel.
    const rodOverskudd = (h: string) =>
      parseInt(h.slice(1, 3), 16) - Math.max(parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));
    expect(rodOverskudd(SPISELIGHET_TEKSTFARGE.toxic)).toBeGreaterThan(90);
    expect(rodOverskudd(SPISELIGHET_TEKSTFARGE.deadly)).toBeGreaterThan(90);
    expect(rodOverskudd(SPISELIGHET_TEKSTFARGE.edible)).toBeLessThan(0);
  });
});
