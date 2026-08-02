import { describe, it, expect } from 'vitest';
import {
  buildAreaReport,
  summariseNeighbourhood,
  areaReportToText,
  type AreaReportInput
} from '@/lib/prediction/area-report';

/**
 * Områderapporten erstatter den trange popupen med verdict + score.
 *
 * Testene her holder fast i to ting samtidig:
 *   1. at rapporten faktisk sier det den har data for (skog, avstand, forhold,
 *      og en ærlig sammenligning med nabolaget), og
 *   2. at den IKKE sier noe den ikke har data for. Manglende felt skal gi
 *      FÆRRE setninger, aldri oppdiktede. «Eldre barskog med fuktig mosebunn»
 *      er den setningen modulen ikke skal kunne produsere: alder er alltid
 *      null i SR16-adapteren, og bunnvegetasjon finnes ikke i noen kilde.
 */

/** Et sted med alt vi kan ha: norsk skog, vær, sesong, funn og et nabolag. */
const FULLT: AreaReportInput = {
  score: 62,
  forest: { forestType: 'gran', productivity: 17, volumePerHa: 214, source: 'sr16', distanceKm: 0 },
  weather: {
    temperatureC: 13.4,
    humidityPct: 82,
    humidityEstimated: false,
    rain3dMm: 4.2,
    rain7dMm: 19,
    rain14dMm: 41.6,
    soilMoistureIndex: 0.62
  },
  season: { topSpecies: ['Kantarell', 'Steinsopp'] },
  nearbyFindings: { count: 12, radiusKm: 1 },
  habitatReasons: ['Treslag (gran) matcher artens partnere.'],
  neighbourhood: {
    scoredCellCount: 18,
    medianScore: 59,
    dominantForestType: 'gran',
    medianProductivity: 16,
    cellSizeKm: { widthKm: 1.4, heightKm: 1.4 }
  },
  locale: 'nb'
};

function text(input: AreaReportInput): string {
  return areaReportToText(buildAreaReport(input));
}

function section(input: AreaReportInput, id: 'forest' | 'conditions' | 'distinctive') {
  return buildAreaReport(input).sections.find((s) => s.id === id);
}

describe('områderapporten — de tre delene', () => {
  it('har skogen, forholdene nå og hvorfor-delen, i den rekkefølgen', () => {
    const ids = buildAreaReport(FULLT).sections.map((s) => s.id);
    expect(ids).toEqual(['forest', 'conditions', 'distinctive']);
  });

  it('navngir skogtype, bonitet og volum', () => {
    const lines = section(FULLT, 'forest')!.lines.join(' ');
    expect(lines).toContain('granskog');
    expect(lines).toContain('Bonitet 17');
    expect(lines).toContain('214 m³ per hektar');
  });

  it('tar med fuktighet, nedbør og sesongen for de aktuelle artene', () => {
    const lines = section(FULLT, 'conditions')!.lines.join(' ');
    expect(lines).toContain('42 mm nedbør siste 14 døgn');
    expect(lines).toContain('4 mm de siste tre døgnene');
    expect(lines).toContain('Markfukt 0,62');
    expect(lines).toContain('Luftfuktighet 82 %');
    expect(lines).toContain('Kantarell, Steinsopp');
  });
});

describe('hvor langt unna skogdataene er målt', () => {
  it('sier «i selve punktet» bare når avstanden faktisk er null', () => {
    const lines = section(FULLT, 'forest')!.lines.join(' ');
    expect(lines).toContain('målt i selve punktet');
  });

  it('navngir avstanden når skogen er målt et stykke unna', () => {
    const lines = section(
      { ...FULLT, forest: { ...FULLT.forest!, distanceKm: 1.11 } },
      'forest'
    )!.lines.join(' ');
    // Nesodden-tilfellet: 1,11 km unna er ikke «her».
    expect(lines).toContain('1,1 km unna punktet');
    expect(lines).not.toContain('i selve punktet');
  });

  it('runder korte avstander til hele hundre meter', () => {
    const lines = section(
      { ...FULLT, forest: { ...FULLT.forest!, distanceKm: 0.34 } },
      'forest'
    )!.lines.join(' ');
    expect(lines).toContain('300 m unna punktet');
  });

  it('sier ingenting om avstand når feltet mangler', () => {
    const lines = section(
      { ...FULLT, forest: { ...FULLT.forest!, distanceKm: null } },
      'forest'
    )!.lines.join(' ');
    expect(lines).toContain('Skogtype: granskog');
    expect(lines).not.toContain('unna');
    expect(lines).not.toContain('i selve punktet');
  });
});

describe('hvorfor akkurat dette området', () => {
  it('sier ærlig fra når ruta ligner nabolaget, og legger til regionens forhold', () => {
    // 62 mot median 59 er tre poeng — innenfor støyen valideringen målte.
    const lines = section(FULLT, 'distinctive')!.lines;
    expect(lines.join(' ')).toContain('skiller seg lite fra nabolaget');
    expect(lines.join(' ')).toContain('62 mot median 59 for de 18 rutene');
    expect(lines.join(' ')).toContain('Forholdene i regionen er gode nå');
  });

  it('sier hva som er annerledes bare når ruta faktisk skiller seg ut', () => {
    const skiller = section(
      {
        ...FULLT,
        score: 78,
        forest: { ...FULLT.forest!, forestType: 'lauv', productivity: 22 },
        neighbourhood: { ...FULLT.neighbourhood!, dominantForestType: 'furu', medianProductivity: 14 }
      },
      'distinctive'
    )!.lines.join(' ');
    expect(skiller).toContain('78 mot median 59');
    expect(skiller).toContain('Ruta er løvskog; de fleste målte rutene rundt er furuskog');
    expect(skiller).toContain('Bonitet 22 her mot median 14');

    // Samme skogforskjell, men uten forskjell i score: da er det ingen forskjell
    // å forklare, og forklaringen skal ikke skrives.
    const likner = section(
      {
        ...FULLT,
        score: 60,
        forest: { ...FULLT.forest!, forestType: 'lauv', productivity: 22 },
        neighbourhood: { ...FULLT.neighbourhood!, dominantForestType: 'furu', medianProductivity: 14 }
      },
      'distinctive'
    )!.lines.join(' ');
    expect(likner).not.toContain('de fleste målte rutene rundt');
    expect(likner).not.toContain('her mot median');
  });

  it('sier hvor stor rute punktet står for', () => {
    const lines = section(FULLT, 'distinctive')!.lines.join(' ');
    expect(lines).toContain('1,4 × 1,4 km');
    expect(lines).toContain('ikke om et enkelt tre');
  });

  it('innrømmer at nabolaget er for tynt målt i stedet for å finne på en forskjell', () => {
    const lines = section({ ...FULLT, neighbourhood: null }, 'distinctive')!.lines.join(' ');
    expect(lines).toContain('for få målte ruter rundt');
    expect(lines).not.toContain('median');
  });

  it('rammer inn registrerte funn som et hint om hvor folk går', () => {
    const lines = section(FULLT, 'distinctive')!.lines.join(' ');
    expect(lines).toContain('12 registrerte funn innenfor 1,0 km');
    expect(lines).toContain('følger stier og veier');
  });
});

describe('manglende data gir færre setninger, ikke oppdiktede', () => {
  it('utelater hele skog-seksjonen når det ikke finnes skogdata', () => {
    const report = buildAreaReport({ ...FULLT, forest: null, habitatReasons: [] });
    expect(report.sections.find((s) => s.id === 'forest')).toBeUndefined();
    const full = areaReportToText(report);
    expect(full).not.toContain('Bonitet');
    expect(full).not.toContain('m³');
    expect(full).not.toContain('granskog');
  });

  it('utelater bonitet og volum når kilden bare har skogtype, og sier hvorfor', () => {
    const lines = section(
      {
        ...FULLT,
        forest: { forestType: 'bar', productivity: null, volumePerHa: null, source: 'corine', distanceKm: 0 }
      },
      'forest'
    )!.lines.join(' ');
    expect(lines).toContain('barskog');
    expect(lines).toContain('CORINE måler bare skogtype');
    expect(lines).not.toContain('Bonitet');
    expect(lines).not.toContain('m³');
  });

  it('oppgir ikke en fuktprosent ingen stasjon har målt', () => {
    const lines = section(
      { ...FULLT, weather: { ...FULLT.weather!, humidityPct: 75, humidityEstimated: true } },
      'conditions'
    )!.lines.join(' ');
    expect(lines).not.toContain('75 %');
    expect(lines).toContain('måler ikke luftfuktighet');
  });

  it('faller tilbake på det korteste nedbørsvinduet vi har, uten å oppgi de andre', () => {
    const lines = section(
      { ...FULLT, weather: { rain3dMm: 6, rain7dMm: null, rain14dMm: null } },
      'conditions'
    )!.lines.join(' ');
    expect(lines).toContain('6 mm nedbør siste 3 døgn');
    expect(lines).not.toContain('14 døgn');
    expect(lines).not.toContain('Av det kom');
  });

  it('utelater forholds-seksjonen helt når verken vær eller sesong er kjent', () => {
    const report = buildAreaReport({ ...FULLT, weather: null, season: null });
    expect(report.sections.find((s) => s.id === 'conditions')).toBeUndefined();
  });

  it('krymper til én ærlig setning når vi bare har en score', () => {
    const report = buildAreaReport({ score: 40, locale: 'nb' });
    expect(report.sections).toHaveLength(1);
    expect(report.sections[0].id).toBe('distinctive');
    expect(report.sections[0].lines).toEqual([
      'Vi har for få målte ruter rundt til å si hva som skiller dette området fra nabolaget.'
    ]);
  });

  it('skriver aldri om alder, bunnvegetasjon, helning eller sol', () => {
    // Feltene finnes ikke i noen kilde vi leser (SR16-adapteren henter bare
    // treslag/bonitet/volum, og `ageYears` er alltid null), så ordene skal
    // ikke kunne oppstå — heller ikke i den fullstendige rapporten.
    const full = `${text(FULLT)} ${text({ ...FULLT, locale: 'sv' })}`.toLowerCase();
    for (const forbudt of [
      'alder',
      ' år',
      'gammel',
      'eldre',
      'äldre',
      'mose',
      'mossa',
      'lyng',
      'ljung',
      'helning',
      'lutning',
      'sollys',
      'solsid'
    ]) {
      expect(full).not.toContain(forbudt);
    }
  });
});

describe('språk', () => {
  it('skriver svensk når leseren er svensk', () => {
    const full = text({ ...FULLT, locale: 'sv' });
    expect(full).toContain('Förhållandena nu');
    expect(full).toContain('Varför just det här området');
    expect(full).toContain('nederbörd');
    expect(full).toContain('skiljer sig lite från grannskapet');
    expect(full).not.toContain('nedbør');
    expect(full).not.toContain('nabolaget');
  });

  it('kaller furuskog «tallskog» på svensk, slik forklaringslinjene gjør', () => {
    const full = text({
      ...FULLT,
      locale: 'sv',
      forest: { ...FULLT.forest!, forestType: 'furu' }
    });
    expect(full).toContain('tallskog');
  });

  it('bruker norsk når språket ikke er oppgitt', () => {
    expect(text({ ...FULLT, locale: undefined })).toContain('Forholdene nå');
  });
});

describe('summariseNeighbourhood', () => {
  it('regner median, vanligste skogtype og medianbonitet av de målte rutene', () => {
    const hood = summariseNeighbourhood(
      [
        { score: 40, forestType: 'gran', productivity: 14 },
        { score: 60, forestType: 'gran', productivity: 18 },
        { score: 50, forestType: 'furu', productivity: null }
      ],
      { cellSizeKm: { widthKm: 1.4, heightKm: 1.4 } }
    );
    expect(hood).toEqual({
      scoredCellCount: 3,
      medianScore: 50,
      dominantForestType: 'gran',
      medianProductivity: 16,
      cellSizeKm: { widthKm: 1.4, heightKm: 1.4 }
    });
  });

  it('gir null når ingen ruter ble målt', () => {
    expect(summariseNeighbourhood([])).toBeNull();
  });

  it('lar bonitet være null når ingen rute har den', () => {
    const hood = summariseNeighbourhood([
      { score: 30, forestType: 'bar', productivity: null },
      { score: 50, forestType: 'bar', productivity: null }
    ]);
    expect(hood?.medianProductivity).toBeNull();
  });
});
