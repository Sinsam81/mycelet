import { describe, expect, it } from 'vitest';
import { erLavBildelikhet, LOW_SIMILARITY_MAX } from '../config';

describe('erLavBildelikhet', () => {
  it('er sann når ALLE de viste forslagene ligger under terskelen', () => {
    expect(erLavBildelikhet([{ probability: 4 }, { probability: 3 }, { probability: 1 }])).toBe(true);
    expect(erLavBildelikhet([{ probability: LOW_SIMILARITY_MAX - 1 }])).toBe(true);
  });

  it('er usann på og over terskelen', () => {
    expect(erLavBildelikhet([{ probability: LOW_SIMILARITY_MAX }])).toBe(false);
    expect(erLavBildelikhet([{ probability: 96 }, { probability: 2 }])).toBe(false);
  });

  it('bruker den HØYESTE likheten, ikke den første i lista', () => {
    // rankOrder sorterer om etter sesong og funn i nærheten, så et forslag med
    // lav bildelikhet kan stå øverst over ett med høy.
    expect(erLavBildelikhet([{ probability: 12 }, { probability: 71 }])).toBe(false);
  });

  it('en tom liste er ikke «lav likhet» — den har sin egen tilstand', () => {
    expect(erLavBildelikhet([])).toBe(false);
  });

  it('manglende eller ugyldige tall gir aldri en beskjed alene', () => {
    expect(erLavBildelikhet([{ probability: null }, {}, { probability: Number.NaN }])).toBe(false);
    // … men ett ekte, lavt tall ved siden av dem teller.
    expect(erLavBildelikhet([{ probability: null }, { probability: 5 }])).toBe(true);
  });
});
