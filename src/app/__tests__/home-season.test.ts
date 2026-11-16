import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import nb from '../../../messages/nb.json';
import sv from '../../../messages/sv.json';

/**
 * The front page may state SEASON plainly — that is the validated half of the
 * model (~0.89 AUC) and it needs no location. It must not state WHERE, which is
 * near chance (~0.52). These tests pin the copy to that line.
 */
describe('the in-season section says season, not place', () => {
  const home = (locale: string) => ((locale === 'nb' ? nb : sv) as Record<string, Record<string, string>>).Home;

  // The six species used to be listed twice (a text list and an image grid)
  // with a third reminder about the poisonous ones in between. They are one
  // card now, followed by the red list — these are the strings those two use.
  it.each(['nb', 'sv'])('%s has every string the section needs', (locale) => {
    for (const key of [
      'inSeasonNow',
      'inSeasonWhy',
      'inSeasonAtPeak',
      'inSeasonInSeason',
      'inSeasonSeeAll',
      'seeFullCalendar',
      'seasonSafetyNote',
      'checkWithSoppkontrollen',
      'dangerousWarningTitle'
    ]) {
      expect(home(locale)[key], `missing ${key}`).toBeTruthy();
    }
  });

  it.each(['nb', 'sv'])('%s points forest questions at the map instead of answering them', (locale) => {
    expect(home(locale).inSeasonWhy).toMatch(/kartet|kartan/);
  });

  it.each(['nb', 'sv'])('%s never promises a find', (locale) => {
    const section = [home(locale).inSeasonNow, home(locale).inSeasonWhy, home(locale).inSeasonAtPeak]
      .join(' ')
      .toLowerCase();
    // "her finner du" is the phrasing the project walked back once already.
    expect(section).not.toMatch(/her finner du|här hittar du|garantert|garanterat/);
  });

  it.each(['nb', 'sv'])('%s keeps the dangerous species as a warning, not an invitation', (locale) => {
    const danger = home(locale).dangerousWarningTitle.toLowerCase();
    expect(danger).toMatch(/giftig|giftiga/);
    expect(danger).toMatch(/vær obs|var försiktig/);
  });

  it.each(['nb', 'sv'])('%s says the season list is a tip, never a reason to eat something', (locale) => {
    expect(home(locale).seasonSafetyNote.toLowerCase()).toMatch(/aldri spis|ät aldrig/);
  });
});

describe('the card explains what sharing a position buys', () => {
  const card = (locale: string) =>
    ((locale === 'nb' ? nb : sv) as Record<string, Record<string, string>>).MushroomDayCard;

  it.each(['nb', 'sv'])('%s states the benefit rather than just asking', (locale) => {
    expect(card(locale).sharePositionTitle).toBeTruthy();
    // Must say what changes, not merely "allow location".
    expect(card(locale).sharePositionBody.length).toBeGreaterThan(60);
    expect(card(locale).approximate).toBeTruthy();
  });

  it.each(['nb', 'sv'])('%s admits which area the default forecast is for', (locale) => {
    // The default follows the language (Oslo / Stockholm) and the card names the
    // area it actually shows — never a hard-coded «Sør-Norge» on a Swedish screen.
    expect(card(locale).sharePositionBody).toContain('{area}');
    expect(card(locale).sharePositionBody).not.toMatch(/Sør-Norge|södra Norge/);
  });

  it.each(['nb', 'sv'])('%s can label a position just outside the covered areas', (locale) => {
    expect(card(locale).nearestArea).toContain('{name}');
    expect(card(locale).nearestArea).toContain('{km}');
  });

  it('the Swedish fallback label is not a Norwegian region', () => {
    expect(card('sv').defaultRegion).not.toMatch(/Norge/);
  });
});

/**
 * «Sesongen din 2026» er brukerens EGEN logg, lest opp. Den skal ikke kunne
 * leses som et løfte om funn, og datoene er registreringsdager (found_at
 * settes av databasen når funnet lagres) — ikke plukkedager.
 */
describe('the season summary reads back the user\'s own log, nothing more', () => {
  const oversetter = (locale: 'nb' | 'sv') =>
    createTranslator({ locale, messages: (locale === 'nb' ? nb : sv) as typeof nb, namespace: 'Home' });

  it('nb: the lines as they are shown', () => {
    const t = oversetter('nb');
    // The year goes in as text; a number would be grouped as «2 026».
    expect(t('seasonSummaryTitle', { year: '2026' })).toBe('Sesongen din 2026');
    expect(t('seasonSummarySpan', { first: '14. august', last: '2. november' })).toBe(
      'Første funn registrert 14. august · siste 2. november'
    );
    expect(t('seasonSummaryOneDay', { date: '20. september' })).toBe('Registrert 20. september');
    expect(t('seasonSummaryMostFound', { species: 'Kantarell', count: 6 })).toBe('Oftest registrert: Kantarell (6 funn)');
    expect(t('seasonSummaryAllTime', { total: 34, species: 12 })).toBe('Totalt i Mycelet: 34 funn · 12 arter');
    expect(t('seasonSummaryAllTime', { total: 3, species: 1 })).toBe('Totalt i Mycelet: 3 funn · 1 art');
  });

  it('sv: real Swedish, not Norwegian word order', () => {
    const t = oversetter('sv');
    expect(t('seasonSummaryTitle', { year: '2026' })).toBe('Din säsong 2026');
    expect(t('seasonSummarySpan', { first: '14 augusti', last: '2 november' })).toBe(
      'Första fyndet registrerat 14 augusti · senaste 2 november'
    );
    expect(t('seasonSummaryOneDay', { date: '20 september' })).toBe('Registrerat 20 september');
    expect(t('seasonSummaryMostFound', { species: 'Kantarell', count: 6 })).toBe('Oftast registrerad: Kantarell (6 fynd)');
    expect(t('seasonSummaryAllTime', { total: 34, species: 12 })).toBe('Totalt i Mycelet: 34 fynd · 12 arter');
    expect(t('seasonSummaryAllTime', { total: 3, species: 1 })).toBe('Totalt i Mycelet: 3 fynd · 1 art');
  });

  const SUMMARY_KEYS = [
    'seasonSummaryTitle',
    'seasonSummarySpan',
    'seasonSummaryOneDay',
    'seasonSummaryMostFound',
    'seasonSummaryAllTime'
  ] as const;
  const home = (locale: string) => ((locale === 'nb' ? nb : sv) as Record<string, Record<string, string>>).Home;

  it.each(['nb', 'sv'])('%s says «registered», because the date is the day the find was entered', (locale) => {
    expect(home(locale).seasonSummarySpan).toMatch(/registrert|registrerat/);
    expect(home(locale).seasonSummaryOneDay).toMatch(/Registrert|Registrerat/);
  });

  it.each(['nb', 'sv'])('%s promises nothing about what is out there, and says nothing about eating', (locale) => {
    const text = SUMMARY_KEYS.map((key) => home(locale)[key]).join(' ').toLowerCase();
    expect(text).not.toMatch(/finner du|hittar du|vil finne|kommer du til|garantert|garanterat|neste år|nästa år/);
    expect(text).not.toMatch(/spis|ät |spiselig|ätlig|matsopp|matsvamp/);
  });
});
