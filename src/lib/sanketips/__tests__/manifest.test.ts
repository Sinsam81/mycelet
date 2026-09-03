import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SANKETIPS } from '../manifest.generated';
import { byggLlmsTekst } from '../llms';
import { ORGANISASJON } from '@/lib/seo/organisasjon';

/**
 * Vaktest for det som gikk galt i august 2026: sitemap.xml og llms.txt
 * listet seks artikler mens det fantes atten. Manifestet er nå kilden for
 * begge — og denne testen sikrer at manifestet selv ikke kan sakke akterut.
 * Kjør `node scripts/build-articles.mjs` hvis den feiler etter en ny artikkel.
 */
const ROT = join(__dirname, '../../../..');
const KILDER = join(ROT, 'content/sanketips');
const BYGD = join(ROT, 'public/landing/sanketips');

const kildeSlugs = readdirSync(KILDER)
  .filter((f) => f.endsWith('.md') && !/ \d+\.md$/.test(f)) // iCloud-dubletter
  .map((f) => f.replace(/\.md$/, ''))
  .sort();

describe('sanketips-manifestet', () => {
  it('dekker nøyaktig artiklene i content/sanketips', () => {
    expect(SANKETIPS.map((a) => a.slug).sort()).toEqual(kildeSlugs);
  });

  it('har hreflang-par som peker begge veier, til motsatt språk', () => {
    const per = new Map(SANKETIPS.map((a) => [a.slug, a]));
    for (const a of SANKETIPS) {
      if (!a.alternate) continue;
      const b = per.get(a.alternate);
      expect(b, `${a.slug} → ${a.alternate} finnes ikke`).toBeDefined();
      expect(b!.alternate, `${b!.slug} peker ikke tilbake`).toBe(a.slug);
      expect(b!.lang).not.toBe(a.lang);
    }
  });

  it('har spørsmål og svar i hver artikkel (FAQPage-schema)', () => {
    for (const a of SANKETIPS) expect(a.faq, a.slug).toBeGreaterThanOrEqual(2);
  });

  it('har dato og sammendrag på alle', () => {
    for (const a of SANKETIPS) {
      expect(a.published, a.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(a.summary.length, a.slug).toBeGreaterThan(40);
    }
  });
});

describe('de bygde artikkelsidene', () => {
  it('finnes for hver artikkel og bærer FAQPage + Organization med sameAs', () => {
    for (const a of SANKETIPS) {
      const sti = join(BYGD, `${a.slug}.html`);
      expect(existsSync(sti), sti).toBe(true);
      const html = readFileSync(sti, 'utf8');
      expect(html, a.slug).toContain('"@type":"FAQPage"');
      // Byggeskriptet har en kopi av ORGANISASJON — her fanges drift.
      expect(html, a.slug).toContain(JSON.stringify(ORGANISASJON.sameAs));
      expect(html, a.slug).toContain(`"logo":"${ORGANISASJON.logo}"`);
      expect(html).toContain(`<html lang="${a.lang}">`);
    }
  });

  it('tar ikke med iCloud-dubletter (« 2.md») som egne artikler', () => {
    // Disken kan ha dem — iCloud legger dem tilbake når som helst. Manifestet
    // skal aldri ha dem; det er byggeskriptets filter som testes her.
    for (const a of SANKETIPS) expect(a.slug).not.toMatch(/ \d+$/);
  });
});

describe('llms.txt', () => {
  it('lenker til hver eneste artikkel, med dato', () => {
    const tekst = byggLlmsTekst(SANKETIPS);
    for (const a of SANKETIPS) {
      expect(tekst).toContain(`https://www.mycelet.com/sanketips/${a.slug})`);
      expect(tekst).toContain(`(${a.updated ?? a.published})`);
    }
    expect(tekst).toContain('/llms-full.txt');
    expect(tekst).toContain('https://www.mycelet.com/om');
  });
});
