import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Spiselighetsmerket er den ENESTE sikkerhetsinformasjonen som følger arten
 * overalt. `edibility_notes` vises bare på artsdetaljsiden — målt 2026-08-04 er
 * det fraværende i artslista, i kalenderen (SeasonNow, YearTable) og i
 * AI-resultatet, som er skjermen der noen står med soppen i hånda.
 *
 * Derfor må etiketten selv bære advarselen. «Betinget spiselig» sier bare at det
 * finnes et vilkår, ikke at vilkåret er «rå vil den skade deg».
 */
const meldinger = (lg: 'nb' | 'sv') =>
  JSON.parse(readFileSync(`messages/${lg}.json`, 'utf8')).EdibilityBadge as Record<string, string>;

describe('spiselighetsmerket', () => {
  it('advarer om rå tilstand på betinget spiselige arter', () => {
    // Alle sju artene i klassen har notater som sier «rå er den giftig»,
    // «må kokes minst 15 min» eller «må forvelles». Merket må si det samme.
    for (const lg of ['nb', 'sv'] as const) {
      const tekst = meldinger(lg).conditionallyEdible;
      expect(tekst.toLowerCase(), `${lg}: må nevne rå tilstand`).toMatch(/rå/);
      expect(tekst.toLowerCase(), `${lg}: må nevne faren`).toMatch(/giftig/);
    }
  });

  it('holder de farlige klassene tydelig atskilt fra de spiselige', () => {
    for (const lg of ['nb', 'sv'] as const) {
      const m = meldinger(lg);
      const alle = [m.edible, m.conditionallyEdible, m.inedible, m.toxic, m.deadly];
      // Ingen to klasser skal ha samme etikett — da kan de ikke skilles.
      expect(new Set(alle).size, `${lg}`).toBe(alle.length);
      // «Spiselig» alene skal aldri stå på noe annet enn den trygge klassen.
      expect(m.toxic.toLowerCase()).not.toBe(m.edible.toLowerCase());
      expect(m.deadly.toLowerCase()).not.toBe(m.edible.toLowerCase());
    }
  });
});
