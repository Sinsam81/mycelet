// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
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

/** Teksten slik kortet formaterer den (ICU-argumentene fylt inn). */
function tekst(locale: Sprak, nokkel: string, verdier?: Record<string, string>): string {
  return createTranslator({ locale, messages: katalog(locale), namespace: 'IdentifyResult' })(nokkel as never, verdier as never);
}

/** Forvekslingsarten slik enrich.ts sender den: navnet på brukerens språk, spiseligheten fra katalogen. */
function forveksling(norskNavn: string, locale: Sprak, danger: 'high' | 'critical') {
  const katalogArt = art(norskNavn);
  return {
    name: locale === 'sv' ? (katalogArt.swedish_name ?? katalogArt.norwegian_name) : katalogArt.norwegian_name,
    danger,
    speciesId: katalogArt.id,
    edibility: katalogArt.edibility
  };
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

/**
 * «Vi har ikke ført inn forvekslingsarter for denne arten ennå» var usant under
 * et forslag som ikke er mat. enrich.ts filtrerer bort speilradene fra den
 * farlige siden (hvit fluesopp → sjampinjong osv.), og de fire artene under sto
 * da uten rader, med lookAlikeData 'none_recorded' — mens artssiden ett trykk
 * unna lister paret. Der er merket advarselen; forbeholdet står bare under et
 * forslag som er mat, der det fortsatt er sant og nødvendig.
 */
describe('«ikke ført inn ennå» bare under et forslag som er mat', () => {
  /** Merket kortet viser for en klasse som ikke er mat (EdibilityBadge via AiEdibilityBadge). */
  const merke = (locale: Sprak, klasse: string) =>
    (katalog(locale).EdibilityBadge as Record<string, string>)[klasse];

  for (const locale of ['nb', 'sv'] as const) {
    it.each(['Hvit fluesopp', 'Spiss giftslørsopp', 'Karbol-sjampinjong', 'Falsk kantarell'])(
      `${locale}: %s får ingen «ikke ført inn», men beholder merket sitt`,
      (navn) => {
        const forslag = forslagFor(navn);
        expect(forslag.lookAlikeData).toBe('none_recorded');
        expect(['deadly', 'toxic', 'inedible']).toContain(forslag.edibility);

        tegn(locale, [forslag]);
        const kort = kortFor(navn);
        expect(kort.textContent).not.toContain(katalog(locale).IdentifyResult.lookAlikeNoneRecorded);
        expect(pilleI(kort, merke(locale, forslag.edibility))).not.toBeNull();
      }
    );

    it.each(['Kantarell', 'Piggsopp', 'Rødskrubb'])(
      `${locale}: %s (mat, ingen rader) beholder forbeholdet`,
      (navn) => {
        tegn(locale, [forslagFor(navn)]);
        expect(kortFor(navn).textContent).toContain(katalog(locale).IdentifyResult.lookAlikeNoneRecorded);
      }
    );

    it(`${locale}: «vi vet ikke» står fortsatt, også under et forslag som ikke er mat`, () => {
      // 'unavailable' betyr at sjekken ikke ble gjort — det skal alltid sies.
      tegn(locale, [forslagFor('Hvit fluesopp', { lookAlikeData: 'unavailable' })]);
      expect(kortFor('Hvit fluesopp').textContent).toContain(katalog(locale).IdentifyResult.lookAlikeUnknown);
    });

    it(`${locale}: hvit fluesopp og sjampinjong side om side — advarselen under matsoppen, intet matsoppnavn under den dødelige`, () => {
      const dobbeltgjengere = [forveksling('Hvit fluesopp', locale, 'critical'), forveksling('Karbol-sjampinjong', locale, 'critical')];
      tegn(locale, [
        forslagFor('Hvit fluesopp'),
        forslagFor('Sjampinjong', { lookAlikeData: 'present', dangerousLookAlikes: dobbeltgjengere })
      ]);
      const hvitFluesopp = kortFor('Hvit fluesopp');
      expect(hvitFluesopp.textContent).not.toContain(katalog(locale).IdentifyResult.lookAlikeNoneRecorded);
      const sjampinjong = forveksling('Sjampinjong', locale, 'critical').name;
      expect(hvitFluesopp.textContent).not.toContain(sjampinjong);
      expect(kortFor('Sjampinjong').textContent).toContain(
        tekst(locale, 'lookAlikeWarning', { names: dobbeltgjengere.map((d) => d.name).join(', ') })
      );
    });
  }
});

/**
 * Den røde forvekslingslinja sa «sjekk nøye før du spiser» under hvert forslag
 * med dobbeltgjengere — også under svovelsopp (giftig) og honningsopp
 * (uspiselig), der radene mellom arter som ikke er mat står med vilje. Under et
 * giftig eller uspiselig forslag leses «før du spiser» som «spiselig om du er
 * nøye». Der står nå «ikke spis den»; matsoppene beholder sin linje.
 */
describe('forvekslingslinja følger forslagets egen klasse', () => {
  const FOR_DU_SPISER = { nb: /før du spiser/, sv: /innan du äter/ } as const;
  const navnene = (dobbeltgjengere: Array<{ name: string }>) => dobbeltgjengere.map((d) => d.name).join(', ');

  for (const locale of ['nb', 'sv'] as const) {
    it(`${locale}: svovelsopp (giftig) med honningsopp — «ikke spis den», aldri «før du spiser»`, () => {
      const dobbeltgjengere = [forveksling('Honningsopp', locale, 'high')];
      tegn(locale, [forslagFor('Svovelsopp', { lookAlikeData: 'present', dangerousLookAlikes: dobbeltgjengere })]);
      const kort = kortFor('Svovelsopp');
      expect(kort.textContent).toContain(tekst(locale, 'lookAlikeWarningNotFood', { names: navnene(dobbeltgjengere) }));
      expect(kort.textContent).not.toMatch(FOR_DU_SPISER[locale]);
    });

    it(`${locale}: honningsopp (uspiselig) med flatklokkehatt og svovelsopp — samme linje`, () => {
      const dobbeltgjengere = [forveksling('Flatklokkehatt', locale, 'critical'), forveksling('Svovelsopp', locale, 'high')];
      tegn(locale, [forslagFor('Honningsopp', { lookAlikeData: 'present', dangerousLookAlikes: dobbeltgjengere })]);
      const kort = kortFor('Honningsopp');
      expect(kort.textContent).toContain(tekst(locale, 'lookAlikeWarningNotFood', { names: navnene(dobbeltgjengere) }));
      expect(kort.textContent).not.toMatch(FOR_DU_SPISER[locale]);
    });

    it(`${locale}: kantarell med falsk kantarell beholder «sjekk nøye før du spiser»`, () => {
      const dobbeltgjengere = [forveksling('Falsk kantarell', locale, 'high')];
      tegn(locale, [forslagFor('Kantarell', { lookAlikeData: 'present', dangerousLookAlikes: dobbeltgjengere })]);
      const kort = kortFor('Kantarell');
      expect(kort.textContent).toContain(tekst(locale, 'lookAlikeWarning', { names: navnene(dobbeltgjengere) }));
      expect(kort.textContent).toMatch(FOR_DU_SPISER[locale]);
    });

    it(`${locale}: «ikke spis den» sier bare noe om forslaget — også når en gammel økt lister en matsopp`, () => {
      // Et resultat lagt i økta før speilregelen i enrich.ts kan fortsatt ha
      // kantarell under falsk kantarell. Linja skal ikke kalle kantarellen
      // uspiselig: den viser til forslaget, ikke til dobbeltgjengerne.
      const dobbeltgjengere = [forveksling('Kantarell', locale, 'high')];
      tegn(locale, [forslagFor('Falsk kantarell', { lookAlikeData: 'present', dangerousLookAlikes: dobbeltgjengere })]);
      expect(kortFor('Falsk kantarell').textContent).toContain(
        tekst(locale, 'lookAlikeWarningNotFood', { names: navnene(dobbeltgjengere) })
      );
      const setning = katalog(locale).IdentifyResult.lookAlikeWarningNotFood;
      expect(setning).toMatch(locale === 'sv' ? /— ät den inte\.$/ : /— ikke spis den\.$/);
      expect(setning).not.toMatch(/ingen av dem|inga av dem|matsopp|matsvamp/i);
    });
  }
});
