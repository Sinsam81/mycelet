import { describe, it, expect } from 'vitest';

/**
 * Sikkerhetsinvarianter for bildesammenligningen («Ligner det på …?»).
 *
 * Faremodusen er kjent fra felt: brukeren sammenligner sitt bilde med et
 * pent referansefoto, blir overbevist — og overser at en giftig
 * forvekslingsart ser nesten identisk ut. Seksjonen skal derfor aldri
 * inneholde noe som kan leses som en trygghetserklæring, og den skal si
 * eksplisitt fra når bilder mangler.
 *
 * Samme teknikk som edibility-asymmetry.test.ts: ingen komponenttest-
 * infrastruktur i repoet, så vi låser reglene ved å lese kilden.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs') as typeof import('node:fs');
const source = fs.readFileSync(new URL('../ReferencePhotos.tsx', import.meta.url), 'utf8');
const pageSource = fs.readFileSync(
  new URL('../../../app/identify/result/page.tsx', import.meta.url),
  'utf8'
);

describe('bildesammenligningen i AI-resultatet', () => {
  it('viser aldri spiselighetsmerker ved siden av likheten', () => {
    // Et grønt stempel ved siden av «bildene ligner!» er nøyaktig
    // kombinasjonen som forgifter folk. Spiselighet leses i kortlista
    // (med asymmetrien) og på artssiden — aldri her.
    expect(source).not.toContain('EdibilityBadge');
    expect(source).not.toContain('edibility');
  });

  it('sier eksplisitt at likhet ikke er bekreftelse', () => {
    expect(source).toContain("t('disclaimer')");
  });

  it('peker ikke på en artsside som ikke finnes', () => {
    // Arter utenfor katalogen (ingen speciesId) har ingen artsside — rådet
    // «sjekk artssiden» er da uoppfyllbart, akkurat for artene vi vet minst
    // om. Da skal rådet peke på soppkontroll i stedet.
    expect(source).toMatch(/suggestion\.speciesId\s*\?\s*t\('disclaimer'\)\s*:\s*t\('disclaimerNoSpeciesPage'\)/);
  });

  it('krediterer bare kildene som faktisk vises', () => {
    // 8 av 80 arter mangler kuratert foto, og Kindwise kan la være å sende
    // similar_images — kildelinja skal utledes av hva som faktisk står der.
    expect(source).toContain("'sourcesBoth'");
    expect(source).toContain("'sourcesCurated'");
    expect(source).toContain("'sourcesSimilar'");
    expect(source).not.toContain("t('sources')");
  });

  it('sier eksplisitt fra når referansebilder mangler', () => {
    // En seksjon som stille forsvinner leses som «ingenting å sammenligne
    // med» — men sannheten er «vi mangler bilder», og det skal stå.
    expect(source).toContain("t('noPhotos')");
  });

  it('rendres FØR forvekslingssjekken, så den farlige tvillingen får siste ord', () => {
    const compareAt = pageSource.indexOf('<ReferencePhotos');
    const lookAlikeAt = pageSource.indexOf('<LookAlikeCheck');
    expect(compareAt).toBeGreaterThan(-1);
    expect(lookAlikeAt).toBeGreaterThan(compareAt);
  });

  it('har alle tekstene i begge språk, med spørsmål — ikke dom — som overskrift', () => {
    for (const locale of ['nb', 'sv'] as const) {
      const messages = JSON.parse(
        fs.readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8')
      );
      const ns = messages.ReferencePhotos;
      expect(ns).toBeTruthy();
      // Overskriften skal SPØRRE om likheten, aldri konstatere den.
      expect(ns.heading).toContain('?');
      expect(ns.heading).toContain('{name}');
      expect(ns.disclaimer.length).toBeGreaterThan(20);
      // Katalog-varianten peker på artssiden; utenfor-katalog-varianten må
      // ikke gjøre det — den skal peke på soppkontroll.
      expect(ns.disclaimerNoSpeciesPage.length).toBeGreaterThan(20);
      expect(ns.disclaimerNoSpeciesPage).not.toContain(locale === 'nb' ? 'artssiden' : 'artsidan');
    }
  });
});
