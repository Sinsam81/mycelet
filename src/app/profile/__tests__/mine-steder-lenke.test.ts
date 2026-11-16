import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Profilen viser de siste funnene bare til å se på. Siden forrige runde kan de
 * styres under Mine steder (deling, notat, sletting, angring), og profilen sier
 * nå det med en tydelig lenke under lista.
 */
const side = readFileSync(join(__dirname, '../page.tsx'), 'utf8');

describe('lenken fra profilens funn til Mine steder', () => {
  it('står under funnlista og går til /mine-steder', () => {
    const lenke = side.indexOf("t('manageFindings')");
    expect(lenke).toBeGreaterThan(side.indexOf("t('myLatestFindings')"));
    expect(lenke).toBeLessThan(side.indexOf("t('myPosts')"));
    expect(side.slice(side.lastIndexOf('<Link', lenke), lenke)).toContain('href="/mine-steder"');
  });

  it('sier hva man kan gjøre der, på begge språk', () => {
    expect(nb.Profile.manageFindings).toMatch(/deling.*notat.*slett.*Mine steder/);
    expect(sv.Profile.manageFindings).toMatch(/delning.*anteckning.*radera.*Mina platser/);
    // Navnet i lenka er det samme som sidens egen overskrift.
    expect(nb.Profile.manageFindings).toContain(nb.MineSteder.heading);
    expect(sv.Profile.manageFindings).toContain(sv.MineSteder.heading);
  });
});
