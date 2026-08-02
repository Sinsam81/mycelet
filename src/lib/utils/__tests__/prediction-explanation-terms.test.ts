import { describe, it, expect } from 'vitest';
import { buildExplanation } from '@/lib/utils/prediction-explanation';

/**
 * `mushroom_species.habitat` og `.mycorrhizal_partners` er norske ord i
 * databasen. De limes rett inn i forklaringsmalene, som ELLERS er oversatt —
 * så en svensk leser fikk «Föredraget habitat: barskog, blandingsskog, mose»
 * og «Följer gran/furu/bjørk/eik». «bjørk» kan ikke engang skrives på svensk.
 */

const WEATHER = {
  temperatureC: 14,
  humidityPct: 82,
  rain3dMm: 8,
  rain7dMm: 18,
  rain14dMm: 40,
  minTemp7dC: 9,
  maxTemp7dC: 19
};

// Verdiene er hentet ordrett fra artsradene i migrasjon 009/012/017.
const KANTARELL = {
  norwegianName: 'Kantarell',
  swedishName: 'Kantarell',
  latinName: 'Cantharellus cibarius',
  genus: 'Cantharellus',
  seasonStart: 7,
  seasonEnd: 10,
  peakSeasonStart: 8,
  peakSeasonEnd: 9,
  habitat: ['barskog', 'blandingsskog', 'mose'],
  mycorrhizalPartners: ['gran', 'furu', 'bjørk', 'eik']
};

function textFor(locale: 'nb' | 'sv', category: string): string {
  const lines = buildExplanation({ weather: WEATHER, species: KANTARELL, month: 8, locale });
  return lines.filter((l) => l.category === category).map((l) => l.text).join(' | ');
}

describe('habitat- og partnerord i forklaringen', () => {
  it('oversetter habitat-taggene for svenske lesere', () => {
    const text = textFor('sv', 'habitat');
    expect(text).toContain('barrskog');
    expect(text).toContain('blandskog');
    expect(text).toContain('mossa');
    expect(text).not.toContain('blandingsskog');
  });

  it('oversetter vertstrærne for svenske lesere', () => {
    const text = textFor('sv', 'mycorrhizal');
    expect(text).toContain('tall');
    expect(text).toContain('björk');
    expect(text).toContain('ek');
    // «bjørk» finnes ikke i svensk rettskriving.
    expect(text).not.toContain('bjørk');
    expect(text).not.toContain('furu');
  });

  it('lar norsk stå nøyaktig som før', () => {
    expect(textFor('nb', 'habitat')).toContain('barskog, blandingsskog, mose');
    expect(textFor('nb', 'mycorrhizal')).toContain('gran/furu/bjørk/eik');
  });

  it('slipper ukjente verdier gjennom i stedet for å droppe linja', () => {
    const lines = buildExplanation({
      weather: WEATHER,
      species: { ...KANTARELL, habitat: ['et helt nytt habitatord'], mycorrhizalPartners: ['ukjenttre'] },
      month: 8,
      locale: 'sv'
    });
    const joined = lines.map((l) => l.text).join(' | ');
    expect(joined).toContain('et helt nytt habitatord');
    expect(joined).toContain('ukjenttre');
  });
});
