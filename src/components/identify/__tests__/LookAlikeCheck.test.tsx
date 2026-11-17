// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { timeZoneForLocale } from '@/i18n/config';
import type { IdentifyLookAlike, IdentifySuggestion } from '@/types/identify';
import { LookAlikeCheck } from '../LookAlikeCheck';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Forvekslingstekstene i identifiseringen kommer fra look_alikes og finnes bare
 * på norsk. En svensk leser skal fortsatt se dem — skilleteksten er
 * sikkerhetsteksten — men de skal være merket som norske, og leseren skal få
 * vite det. Norske lesere ser ingen endring.
 */

const LIKHET = 'Begge er hvite med ring og hvite skiver.';
const SKILLE = 'Grav opp HELE stilken: hvit fluesopp har en sekk (volva) ved roten.';

const forveksling = (felter: Partial<IdentifyLookAlike> = {}): IdentifyLookAlike => ({
  name: 'Hvit fluesopp',
  danger: 'critical',
  speciesId: 16,
  imageUrl: null,
  edibility: 'deadly',
  whySimilar: LIKHET,
  howToTell: SKILLE,
  ...felter
});

const forslag = (lookAlike: IdentifyLookAlike, felter: Partial<IdentifySuggestion> = {}): IdentifySuggestion => ({
  name: 'Agaricus arvensis',
  norwegianName: 'Snøballsjampinjong',
  commonNames: [],
  probability: 0.8,
  edibility: 'edible',
  description: null,
  taxonomy: null,
  similarImages: [],
  dangerousLookAlikes: [lookAlike],
  ...felter
});

function rendrer(locale: 'nb' | 'sv', lookAlike = forveksling(), felter: Partial<IdentifySuggestion> = {}) {
  return render(
    <NextIntlClientProvider locale={locale} timeZone={timeZoneForLocale(locale)} messages={locale === 'sv' ? sv : nb}>
      <LookAlikeCheck suggestion={forslag(lookAlike, felter)} />
    </NextIntlClientProvider>
  );
}

afterEach(() => cleanup());

describe('norsk forvekslingstekst', () => {
  it('svensk: tekstene vises, merket lang="nb", med én svensk linje om at de er norske', () => {
    rendrer('sv');
    expect(screen.getByText(LIKHET).getAttribute('lang')).toBe('nb');
    expect(screen.getByText(SKILLE).getAttribute('lang')).toBe('nb');
    // Etikettene er svenske og ikke merket som norske.
    expect(screen.getByText(sv.LookAlikeCheck.howToTell).closest('[lang="nb"]')).toBeNull();

    const linje = screen.getByText(sv.LookAlikeCheck.norwegianTextNote);
    expect(linje.closest('[lang="nb"]')).toBeNull();
    // Linja står etter tekstene den handler om.
    expect(screen.getByText(SKILLE).compareDocumentPosition(linje) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('svensk, bare skilleteksten: den vises fortsatt, og linja står der', () => {
    rendrer('sv', forveksling({ whySimilar: null }));
    expect(screen.getByText(SKILLE)).toBeTruthy();
    expect(screen.getByText(sv.LookAlikeCheck.norwegianTextNote)).toBeTruthy();
  });

  it('svensk uten tekst: ingen linje om en tekst som ikke står der', () => {
    rendrer('sv', forveksling({ whySimilar: null, howToTell: null }));
    expect(screen.queryByText(sv.LookAlikeCheck.norwegianTextNote)).toBeNull();
  });

  it('norsk: ingen linje og ingen lang-merking', () => {
    const { container } = rendrer('nb');
    expect(screen.getByText(SKILLE)).toBeTruthy();
    expect(screen.queryByText(nb.LookAlikeCheck.norwegianTextNote)).toBeNull();
    expect(container.querySelector('[lang]')).toBeNull();
  });
});

/**
 * Merket på dobbeltgjengeren. Den kuraterte forvekslingsarten beholder det
 * rå merket når den ikke er mat — det ER advarselen. Et grønt «Spiselig» under
 * «Farlig dobbeltgjenger» skal derimot aldri vises, uansett hvor resultatet
 * kom fra (serveren sender ikke lenger speilrader mot en matsopp, men et
 * resultat lagt i økta før den regelen kan fortsatt ha en).
 */
describe('merket på dobbeltgjengeren', () => {
  it.each(['nb', 'sv'] as const)('%s: en dødelig dobbeltgjenger får sitt røde merke', (locale) => {
    rendrer(locale);
    const katalog = locale === 'sv' ? sv : nb;
    expect(screen.getByText(katalog.EdibilityBadge.deadly)).toBeTruthy();
  });

  it.each(['nb', 'sv'] as const)(
    '%s: en matsopp under «Farlig dobbeltgjenger» får ikke et grønt «Spiselig»',
    (locale) => {
      // Speilraden falsk kantarell → kantarell, slik den kom fra serveren før.
      rendrer(
        locale,
        forveksling({ name: 'Kantarell', danger: 'high', speciesId: 1, edibility: 'edible' }),
        { name: 'Hygrophoropsis aurantiaca', norwegianName: 'Falsk kantarell', edibility: 'inedible' }
      );
      const katalog = locale === 'sv' ? sv : nb;
      expect(screen.getByText(katalog.LookAlikeCheck.dangerousLookAlike)).toBeTruthy();
      expect(screen.queryByText(katalog.EdibilityBadge.edible)).toBeNull();
      // Forslagets eget merke står fortsatt.
      expect(screen.getByText(katalog.EdibilityBadge.inedible)).toBeTruthy();
    }
  );

  it('heller ikke «Spiselig — giftig rå» på en dobbeltgjenger som er mat', () => {
    rendrer('nb', forveksling({ name: 'Rødnende fluesopp', danger: 'high', speciesId: 55, edibility: 'conditionally_edible' }));
    expect(screen.queryByText(nb.EdibilityBadge.conditionallyEdible)).toBeNull();
  });
});
