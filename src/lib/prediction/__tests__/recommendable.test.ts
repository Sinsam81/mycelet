import { describe, expect, it } from 'vitest';
import { isHazardSpecies, isRecommendableSpecies } from '../recommendable';

describe('only pickable species may be recommended', () => {
  it.each(['edible', 'conditionally_edible'])('recommends %s', (e) => {
    expect(isRecommendableSpecies(e)).toBe(true);
  });

  it.each(['toxic', 'deadly', 'inedible'])('never recommends %s', (e) => {
    expect(isRecommendableSpecies(e)).toBe(false);
  });

  it('fails closed on missing or unrecognised values', () => {
    // A row with no edibility must not slip into a "go here" list.
    for (const value of [null, undefined, '', 'ukjent', 'EDIBLE?', 'probably fine']) {
      expect(isRecommendableSpecies(value)).toBe(false);
    }
  });
});

describe('the species that were actually being recommended in July', () => {
  // Real catalogue rows. Before the filter these all passed the season-only
  // gate and could be printed under "🍄 Riktig skog + sesong for …" next to a
  // navigation link.
  const julyCatalogue = [
    { name: 'Kantarell', edibility: 'edible' },
    { name: 'Steinsopp', edibility: 'edible' },
    { name: 'Smørsopp', edibility: 'edible' },
    { name: 'Skjeggriske', edibility: 'conditionally_edible' },
    { name: 'Galleboletus', edibility: 'inedible' },
    { name: 'Rød fluesopp', edibility: 'toxic' },
    { name: 'Giftkremle', edibility: 'toxic' },
    { name: 'Pluggsopp', edibility: 'toxic' },
    { name: 'Rødnende trådsopp', edibility: 'toxic' },
    { name: 'Hvit fluesopp', edibility: 'deadly' }
  ];

  it('lets the food species through', () => {
    const recommended = julyCatalogue.filter((s) => isRecommendableSpecies(s.edibility)).map((s) => s.name);
    expect(recommended).toEqual(['Kantarell', 'Steinsopp', 'Smørsopp', 'Skjeggriske']);
  });

  it('keeps the deadly one out — this is the whole point', () => {
    // Amanita virosa is in season in July and was reachable by the old filter.
    expect(isRecommendableSpecies('deadly')).toBe(false);
    const recommended = julyCatalogue.filter((s) => isRecommendableSpecies(s.edibility)).map((s) => s.name);
    expect(recommended).not.toContain('Hvit fluesopp');
    expect(recommended).not.toContain('Rødnende trådsopp');
  });

  it('separates hazards from recommendations without overlap', () => {
    for (const s of julyCatalogue) {
      expect(isRecommendableSpecies(s.edibility) && isHazardSpecies(s.edibility)).toBe(false);
    }
    const hazards = julyCatalogue.filter((s) => isHazardSpecies(s.edibility)).map((s) => s.name);
    expect(hazards).toContain('Hvit fluesopp');
    // Inedible is neither: bitter is not dangerous, and it is not food either.
    expect(hazards).not.toContain('Galleboletus');
  });
});
