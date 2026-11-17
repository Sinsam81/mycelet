// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { timeZoneForLocale } from '@/i18n/config';
import { art } from '@/lib/species/__tests__/artskatalog-fixture';
import { seasonFitForSpecies } from '@/lib/utils/identify-ranking';
import type { IdentifySuggestion } from '@/types/identify';
import { IdentifyResult } from '../IdentifyResult';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Sesongpilla ved hvert AI-forslag. Den var grønn og sa «Topp-sesong nå» også
 * ved et dødelig forslag i toppmåneden: hvit fluesopp i august fikk den samme
 * grønne pilla som en kantarell. Kalenderen gir aldri en farlig art grønt eller
 * «Topp-sesong» («topp» leses som en anbefaling — se SeasonNow og YearTable),
 * og AI-resultatet følger nå samme regel.
 *
 * Flaggene regnes ut med seasonFitForSpecies, slik enrich.ts gjør det for
 * ruta, mot artene fra katalogfixturen — «toppmåneden» er altså den ekte.
 */

const AUGUST = 8;
type Sprak = 'nb' | 'sv';
const katalog = (locale: Sprak) => (locale === 'sv' ? sv : nb);

function forslagFor(norskNavn: string, felter: Partial<IdentifySuggestion> = {}, maaned = AUGUST): IdentifySuggestion {
  const katalogArt = art(norskNavn);
  const sesong = seasonFitForSpecies(maaned, katalogArt);
  return {
    name: katalogArt.latin_name,
    norwegianName: katalogArt.norwegian_name,
    commonNames: [],
    probability: 72,
    edibility: katalogArt.edibility,
    description: null,
    taxonomy: null,
    similarImages: [],
    speciesId: katalogArt.id,
    inSeason: sesong.inSeason,
    peakSeason: sesong.peakSeason,
    lookAlikeData: 'none_recorded',
    ...felter
  };
}

function tegn(locale: Sprak, suggestions: IdentifySuggestion[]) {
  return render(
    <NextIntlClientProvider locale={locale} timeZone={timeZoneForLocale(locale)} messages={katalog(locale)}>
      <IdentifyResult suggestions={suggestions} />
    </NextIntlClientProvider>
  );
}

/** Pilla med denne teksten inne i kortet til arten. */
function pilleI(kort: HTMLElement, tekst: string): HTMLElement | null {
  return Array.from(kort.querySelectorAll('span')).find((span) => span.textContent === tekst) ?? null;
}

function kortFor(navn: string): HTMLElement {
  const kort = screen.getByRole('heading', { name: navn }).closest('article');
  if (!kort) throw new Error(`Fant ikke kortet til ${navn}`);
  return kort as HTMLElement;
}

afterEach(() => cleanup());

describe('sesongpilla på et farlig forslag', () => {
  it.each(['nb', 'sv'] as const)(
    '%s: hvit fluesopp i toppmåneden får en nøytral «I sesong nå», aldri «Topp-sesong»',
    (locale) => {
      const hvitFluesopp = forslagFor('Hvit fluesopp');
      // Forutsetningen: august ER toppsesong for arten, slik ruta regner det.
      expect(hvitFluesopp.edibility).toBe('deadly');
      expect(hvitFluesopp.inSeason).toBe(true);
      expect(hvitFluesopp.peakSeason).toBe(true);

      tegn(locale, [hvitFluesopp]);
      const k = katalog(locale);
      expect(screen.queryByText(k.IdentifyResult.peakSeasonNow)).toBeNull();
      const pille = screen.getByText(k.IdentifyResult.inSeasonNow);
      expect(pille.className).toContain('bg-gray-100');
      expect(pille.className).not.toMatch(/forest|green|emerald/);
    }
  );

  it.each([
    ['giftig', forslagFor('Rød fluesopp')],
    ['ukjent spiselighet', forslagFor('Kantarell', { edibility: 'unknown' })],
    ['spiselighet mangler', forslagFor('Kantarell', { edibility: null as unknown as string })]
  ])('%s: samme nøytrale pille', (_navn, forslag) => {
    expect(forslag.peakSeason).toBe(true);
    tegn('nb', [forslag]);
    expect(screen.queryByText(nb.IdentifyResult.peakSeasonNow)).toBeNull();
    expect(screen.getByText(nb.IdentifyResult.inSeasonNow).className).not.toMatch(/forest/);
  });

  it('utenom sesong er uendret for en farlig art', () => {
    const iJanuar = forslagFor('Hvit fluesopp', {}, 1);
    expect(iJanuar.inSeason).toBe(false);
    tegn('nb', [iJanuar]);
    expect(screen.getByText(nb.IdentifyResult.outOfSeason)).toBeTruthy();
    expect(screen.queryByText(nb.IdentifyResult.inSeasonNow)).toBeNull();
  });
});

describe('sesongpilla på et forslag som ikke er farlig', () => {
  it.each(['nb', 'sv'] as const)('%s: kantarell i toppmåneden får «Topp-sesong nå» i grønt, som før', (locale) => {
    const kantarell = forslagFor('Kantarell');
    expect(kantarell.peakSeason).toBe(true);
    tegn(locale, [kantarell]);
    const pille = screen.getByText(katalog(locale).IdentifyResult.peakSeasonNow);
    expect(pille.className).toContain('bg-forest-100');
  });

  it('uspiselig er ikke farlig: samme skille som kalenderen', () => {
    // isDangerousEdibility er giftig, dødelig og ukjent — falsk kantarell står
    // i kalenderens vanlige liste og får toppmerket der også.
    tegn('nb', [forslagFor('Falsk kantarell')]);
    expect(screen.getByText(nb.IdentifyResult.peakSeasonNow)).toBeTruthy();
  });

  it('side om side: hvert forslag får pilla som hører til arten', () => {
    tegn('nb', [forslagFor('Kantarell'), forslagFor('Hvit fluesopp')]);
    const kantarell = kortFor('Kantarell');
    const hvitFluesopp = kortFor('Hvit fluesopp');
    expect(pilleI(kantarell, nb.IdentifyResult.peakSeasonNow)).not.toBeNull();
    expect(pilleI(hvitFluesopp, nb.IdentifyResult.peakSeasonNow)).toBeNull();
    expect(pilleI(hvitFluesopp, nb.IdentifyResult.inSeasonNow)?.className).toContain('bg-gray-100');
  });
});
