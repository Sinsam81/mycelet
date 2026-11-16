import { describe, expect, it } from 'vitest';
import { buildWhatToLookFor } from '@/lib/prediction/what-to-look-for';
import { byggSeEtterLinje, type SeEtterRad } from '../se-etter';

/**
 * Radene er lest fra produksjon 16. november 2026 (bare lesing), med feltene
 * linja bygges av. Den viktigste halvdelen av denne fila er den andre:
 * artene som IKKE skal ha noen linje.
 */
const KANTARELL: SeEtterRad = {
  edibility: 'edible',
  norwegian_name: 'Kantarell',
  swedish_name: 'Kantarell',
  genus: 'Cantharellus',
  habitat: ['barskog', 'blandingsskog', 'mose'],
  mycorrhizal_partners: ['gran', 'furu', 'bjørk', 'eik'],
  substrate: 'jord'
};

const RODSKRUBB: SeEtterRad = {
  edibility: 'conditionally_edible',
  norwegian_name: 'Rødskrubb',
  swedish_name: 'Aspsopp',
  genus: 'Leccinum',
  habitat: ['løvskog', 'blandingsskog'],
  mycorrhizal_partners: ['osp', 'bjørk'],
  substrate: 'jord'
};

const GRONN_FLUESOPP: SeEtterRad = {
  edibility: 'deadly',
  norwegian_name: 'Grønn fluesopp',
  swedish_name: 'Lömsk flugsvamp',
  genus: 'Amanita',
  habitat: ['løvskog', 'eikeskog'],
  mycorrhizal_partners: ['eik', 'bøk'],
  substrate: 'jord'
};

const KARBOLSJAMPINJONG: SeEtterRad = {
  edibility: 'toxic',
  norwegian_name: 'Karbol-sjampinjong',
  swedish_name: 'Giftchampinjon',
  genus: 'Agaricus',
  habitat: ['eng', 'beite', 'gressplen', 'park'],
  mycorrhizal_partners: null,
  substrate: 'jord'
};

const FALSK_KANTARELL: SeEtterRad = {
  edibility: 'inedible',
  norwegian_name: 'Falsk kantarell',
  swedish_name: 'Narrkantarell',
  genus: 'Hygrophoropsis',
  habitat: ['barskog', 'blandingsskog'],
  mycorrhizal_partners: null,
  substrate: 'død ved eller jord'
};

/** Samme rad slik modulen bak tar den, uten porten foran. */
function utenPort(rad: SeEtterRad, locale: 'nb' | 'sv' = 'nb'): string | null {
  return buildWhatToLookFor(rad as Parameters<typeof buildWhatToLookFor>[0], locale);
}

describe('matsopp får linja', () => {
  it('gir setningen fra artens egne felt, på norsk', () => {
    expect(byggSeEtterLinje(KANTARELL, 'nb')).toBe(
      'Kantarell står i symbiose med blant annet gran, furu og bjørk — se i kanten mot lysninger og langs stier, sjelden inne i tett, mørk skog.'
    );
  });

  it('gir den på svensk, med svensk artsnavn og svenske trær', () => {
    expect(byggSeEtterLinje(RODSKRUBB, 'sv')).toBe(
      'Aspsopp lever i symbios med asp och björk — den står gärna ensam i halvöppen skog och i kantzoner.'
    );
    expect(byggSeEtterLinje(KANTARELL, 'sv')).toContain('gran, tall och björk');
  });

  it('gjelder også betinget spiselige arter', () => {
    expect(byggSeEtterLinje(RODSKRUBB, 'nb')).toBe(
      'Rødskrubb står i symbiose med osp og bjørk — den står gjerne enkeltvis i halvåpen skog og i kantsoner.'
    );
  });

  it('sier aldri noe om et bestemt sted', () => {
    // Setningen handler om hvordan arten vokser. Ingen «her», «nær deg» eller
    // «i dette området» — den romlige modellen bærer ikke det.
    for (const locale of ['nb', 'sv'] as const) {
      for (const rad of [KANTARELL, RODSKRUBB]) {
        expect(byggSeEtterLinje(rad, locale)).not.toMatch(/\bher\b|\bhär\b|nær deg|nära dig|dette området|det här området/i);
      }
    }
  });
});

describe('ingen søkeinvitasjon for arter som ikke er matsopp', () => {
  it('gir ingen linje for en dødelig art', () => {
    // Modulen bak ville skrevet «… — gå sakte langs stier, bestandskanter og
    // små åpninger, der du ser bakken best» om grønn fluesopp.
    expect(utenPort(GRONN_FLUESOPP)).toContain('gå sakte langs stier');
    expect(byggSeEtterLinje(GRONN_FLUESOPP, 'nb')).toBeNull();
    expect(byggSeEtterLinje(GRONN_FLUESOPP, 'sv')).toBeNull();
  });

  it('gir ingen linje for en giftig art', () => {
    expect(utenPort(KARBOLSJAMPINJONG)).toContain('gå sakte over den åpne marka');
    expect(byggSeEtterLinje(KARBOLSJAMPINJONG, 'nb')).toBeNull();
    expect(byggSeEtterLinje(KARBOLSJAMPINJONG, 'sv')).toBeNull();
  });

  it('gir ingen linje for en uspiselig art', () => {
    expect(utenPort(FALSK_KANTARELL)).not.toBeNull();
    expect(byggSeEtterLinje(FALSK_KANTARELL, 'nb')).toBeNull();
  });

  it('stenger porten når spiseligheten er ukjent, mangler eller er feilstavet', () => {
    for (const edibility of [null, undefined, '', 'unknown', 'spiselig', 'Edible', ' edible ', 42, ['edible']]) {
      const rad = { ...KANTARELL, edibility };
      expect(utenPort(rad), String(edibility)).not.toBeNull();
      expect(byggSeEtterLinje(rad, 'nb'), String(edibility)).toBeNull();
    }
  });

  it('gir samme svar på begge språk — språket åpner aldri porten', () => {
    for (const rad of [KANTARELL, RODSKRUBB, GRONN_FLUESOPP, KARBOLSJAMPINJONG, FALSK_KANTARELL]) {
      expect(byggSeEtterLinje(rad, 'nb') === null).toBe(byggSeEtterLinje(rad, 'sv') === null);
    }
  });
});

describe('en rad som ikke er typet', () => {
  it('gir ingen linje uten rad', () => {
    expect(byggSeEtterLinje(null, 'nb')).toBeNull();
    expect(byggSeEtterLinje(undefined, 'nb')).toBeNull();
    expect(byggSeEtterLinje({}, 'nb')).toBeNull();
  });

  it('gir ingen linje når arten verken har trær, substrat eller habitat', () => {
    expect(byggSeEtterLinje({ edibility: 'edible', norwegian_name: 'Testsopp' }, 'nb')).toBeNull();
  });

  it('tåler felt med feil form uten å kaste', () => {
    const rar: SeEtterRad = {
      edibility: 'edible',
      norwegian_name: 'Testsopp',
      swedish_name: 7,
      genus: { navn: 'Boletus' },
      habitat: 'barskog',
      mycorrhizal_partners: ['gran', null, 3, '  '],
      substrate: ['død ved']
    };
    expect(byggSeEtterLinje(rar, 'nb')).toBe('Testsopp står i symbiose med gran.');
    expect(byggSeEtterLinje(rar, 'sv')).toBe('Testsopp lever i symbios med gran.');
  });

  it('faller tilbake på norsk for et språk den ikke kjenner', () => {
    expect(byggSeEtterLinje(KANTARELL, 'de')).toBe(byggSeEtterLinje(KANTARELL, 'nb'));
    expect(byggSeEtterLinje(KANTARELL, '')).toBe(byggSeEtterLinje(KANTARELL, 'nb'));
  });
});
