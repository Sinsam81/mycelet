import { describe, expect, it } from 'vitest';
import nb from '../../../messages/nb.json';
import sv from '../../../messages/sv.json';

/**
 * The front page may state SEASON plainly — that is the validated half of the
 * model (~0.89 AUC) and it needs no location. It must not state WHERE, which is
 * near chance (~0.52). These tests pin the copy to that line.
 */
describe('the in-season section says season, not place', () => {
  const home = (locale: string) => ((locale === 'nb' ? nb : sv) as Record<string, Record<string, string>>).Home;

  it.each(['nb', 'sv'])('%s has every string the section needs', (locale) => {
    for (const key of [
      'inSeasonTitle',
      'inSeasonWhy',
      'inSeasonAtPeak',
      'inSeasonInSeason',
      'inSeasonSeeAll',
      'inSeasonDangerous'
    ]) {
      expect(home(locale)[key], `missing ${key}`).toBeTruthy();
    }
  });

  it.each(['nb', 'sv'])('%s points forest questions at the map instead of answering them', (locale) => {
    expect(home(locale).inSeasonWhy).toMatch(/kartet|kartan/);
  });

  it.each(['nb', 'sv'])('%s never promises a find', (locale) => {
    const section = [home(locale).inSeasonTitle, home(locale).inSeasonWhy].join(' ').toLowerCase();
    // "her finner du" is the phrasing the project walked back once already.
    expect(section).not.toMatch(/her finner du|här hittar du|garantert|garanterat/);
  });

  it.each(['nb', 'sv'])('%s keeps the dangerous species as a warning, not an invitation', (locale) => {
    const danger = home(locale).inSeasonDangerous.toLowerCase();
    expect(danger).toMatch(/giftig|giftiga/);
    expect(danger).toMatch(/les deg opp|läs på/);
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

  it.each(['nb', 'sv'])('%s admits the default is regional', (locale) => {
    expect(card(locale).sharePositionBody).toMatch(/Sør-Norge|södra Norge/);
  });
});
