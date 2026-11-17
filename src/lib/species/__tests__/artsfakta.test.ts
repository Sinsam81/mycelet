import { describe, expect, it } from 'vitest';
import { byggArtsfakta, type ArtsfaktaRad } from '../artsfakta';
import { finnFrikjennendeFormuleringer } from '../forvekslingstekst';

/**
 * Radene er lest fra produksjon 10. november 2026 (bare lesing) og gjengitt
 * med de feltene modulen bruker. Poenget med modulen er hva som vises av det
 * som FAKTISK står i basen, så testene bruker ekte rader.
 */
const KANTARELL: ArtsfaktaRad = {
  edibility: 'edible',
  family: 'Cantharellaceae',
  habitat: ['barskog', 'blandingsskog', 'mose'],
  substrate: 'jord',
  mycorrhizal_partners: ['gran', 'furu', 'bjørk', 'eik'],
  commonality: 'very_common',
  cap_description: null,
  stem_description: null,
  gills_description: null,
  smell: null,
  synonyms: []
};

const GRONN_FLUESOPP: ArtsfaktaRad = {
  edibility: 'deadly',
  family: 'Amanitaceae',
  habitat: ['løvskog', 'eikeskog'],
  substrate: 'jord',
  mycorrhizal_partners: ['eik', 'bøk'],
  commonality: 'rare',
  synonyms: []
};

const KARBOLSJAMPINJONG: ArtsfaktaRad = {
  edibility: 'toxic',
  family: 'Agaricaceae',
  habitat: ['eng', 'beite', 'gressplen', 'park'],
  substrate: 'jord',
  mycorrhizal_partners: null,
  commonality: 'common',
  synonyms: ['Agaricus xanthoderma', 'Psalliota xanthoderma']
};

const PANTERMUSSERONG: ArtsfaktaRad = {
  edibility: 'toxic',
  family: 'Tricholomataceae',
  habitat: ['løvskog', 'edelløvskog'],
  substrate: 'jord',
  mycorrhizal_partners: ['eik', 'lind', 'osp'],
  commonality: 'rare',
  cap_description:
    '7–15 cm bred, først hvelvet, siden utflatet. Lys grå til sølvgrå, TØRR og tett dekket av mørkere gråbrune SKJELL som ligger takstein- eller ringformet utover fra midten. Skjellene kjenner du med neglen. Hatten er aldri glatt, blank eller klebrig.',
  stem_description:
    'Kraftig og fast, ofte 7–12 cm høy og 2–3 cm tykk, hvitaktig til lyst brunlig, uten ring. Foten er gjerne fortykket nederst. Ikke gult skjær øverst.',
  gills_description:
    'Hvite til gråhvite, ganske tettsittende og buktet tilvokst til stilken. Helt uten gult skjær. Gråmusserong har oftest et gult skjær i skivene, men det kan være svakt hos unge sopper — bruk det som støtte, ikke som fasit.',
  smell:
    'Melaktig, som nymalt mel. Den fine melduften er ingen trygghetsgaranti — det er nettopp derfor arten er farlig. Både brungul musserong, såpemusserong og denne giftige arten lukter mel.',
  synonyms: []
};

const KRITTOSTERSSOPP: ArtsfaktaRad = {
  edibility: 'inedible',
  family: 'Marasmiaceae',
  habitat: ['barskog', 'granskog', 'furuskog', 'gammelskog', 'hogstflate', 'plantet skog'],
  substrate: 'morken barved — stubber, røtter og liggende stammer og greiner av gran og furu',
  mycorrhizal_partners: null,
  commonality: 'uncommon',
  synonyms: []
};

describe('faktaradene på norsk', () => {
  it('viser det som står ført for kantarell', () => {
    expect(byggArtsfakta(KANTARELL, 'nb')).toEqual({
      habitat: ['barskog', 'blandingsskog', 'mose'],
      vertstraer: ['gran', 'furu', 'bjørk', 'eik'],
      substrat: 'jord',
      vanlighet: 'very_common',
      familie: 'Cantharellaceae',
      synonymer: [],
      kjennetegn: []
    });
  });

  it('viser de eldre vitenskapelige navnene der de finnes', () => {
    expect(byggArtsfakta(KARBOLSJAMPINJONG, 'nb').synonymer).toEqual(['Agaricus xanthoderma', 'Psalliota xanthoderma']);
  });

  it('viser fritekst-substratet ordrett', () => {
    expect(byggArtsfakta(KRITTOSTERSSOPP, 'nb').substrat).toBe(KRITTOSTERSSOPP.substrate);
  });

  it('gir ingen vertstre-rad til en art uten vertstrær', () => {
    expect(byggArtsfakta(KRITTOSTERSSOPP, 'nb').vertstraer).toEqual([]);
  });
});

describe('faktaradene på svensk', () => {
  it('oversetter de lukkede vokabularene', () => {
    const fakta = byggArtsfakta(KANTARELL, 'sv');
    expect(fakta.habitat).toEqual(['barrskog', 'blandskog', 'mossa']);
    expect(fakta.vertstraer).toEqual(['gran', 'tall', 'björk', 'ek']);
    expect(fakta.substrat).toBe('jord');
    expect(fakta.familie).toBe('Cantharellaceae');
  });

  it('viser ikke en norsk setning som substrat', () => {
    expect(byggArtsfakta(KRITTOSTERSSOPP, 'sv').substrat).toBeNull();
  });

  it('viser ikke vanlighet — kolonnen er ført for Norge', () => {
    expect(byggArtsfakta(KANTARELL, 'sv').vanlighet).toBeNull();
  });

  it('lar latinske synonymer stå, de er språknøytrale', () => {
    expect(byggArtsfakta(KARBOLSJAMPINJONG, 'sv').synonymer).toHaveLength(2);
  });
});

describe('vanlighet er aldri en beroligelse', () => {
  it('viser den ikke for en dødelig art', () => {
    // Basen sier «rare» om grønn fluesopp. «Sjelden» på den siden leses som
    // «da er det neppe den jeg har».
    expect(byggArtsfakta(GRONN_FLUESOPP, 'nb').vanlighet).toBeNull();
  });

  it('viser den ikke for en giftig art, heller ikke når den er vanlig', () => {
    expect(byggArtsfakta(KARBOLSJAMPINJONG, 'nb').vanlighet).toBeNull();
    expect(byggArtsfakta(PANTERMUSSERONG, 'nb').vanlighet).toBeNull();
  });

  it('viser den ikke når spiseligheten er ukjent eller mangler', () => {
    expect(byggArtsfakta({ ...KANTARELL, edibility: null }, 'nb').vanlighet).toBeNull();
    expect(byggArtsfakta({ ...KANTARELL, edibility: 'spiselig' }, 'nb').vanlighet).toBeNull();
  });

  it('viser den for uspiselige og betinget spiselige arter', () => {
    expect(byggArtsfakta(KRITTOSTERSSOPP, 'nb').vanlighet).toBe('uncommon');
    expect(byggArtsfakta({ ...KANTARELL, edibility: 'conditionally_edible' }, 'nb').vanlighet).toBe('very_common');
  });

  it('gir ingen rad for en verdi utenfor de fem tillatte', () => {
    expect(byggArtsfakta({ ...KANTARELL, commonality: 'vanlig' }, 'nb').vanlighet).toBeNull();
    expect(byggArtsfakta({ ...KANTARELL, commonality: null }, 'nb').vanlighet).toBeNull();
  });
});

describe('kjennetegn', () => {
  it('viser hatt, skiver, stilk og lukt i soppbokas rekkefølge, med hele teksten', () => {
    const { kjennetegn } = byggArtsfakta(PANTERMUSSERONG, 'nb');
    expect(kjennetegn.map((k) => k.del)).toEqual(['hatt', 'skiver', 'stilk', 'lukt']);
    expect(kjennetegn[0].tekst).toBe(PANTERMUSSERONG.cap_description);
    // Lukt-teksten bærer forbeholdet. Den skal aldri kortes ned.
    expect(kjennetegn[3].tekst).toContain('ingen trygghetsgaranti');
    expect(kjennetegn[3].tekst).toBe(PANTERMUSSERONG.smell);
  });

  it('gir ingen seksjon — og dermed ingen tom overskrift — når arten mangler tekstene', () => {
    expect(byggArtsfakta(KANTARELL, 'nb').kjennetegn).toEqual([]);
    expect(
      byggArtsfakta({ ...KANTARELL, cap_description: '   ', stem_description: '', gills_description: null }, 'nb')
        .kjennetegn
    ).toEqual([]);
  });

  it('viser bare delene som har tekst', () => {
    const { kjennetegn } = byggArtsfakta({ ...KANTARELL, flesh_description: 'Hvitt og fast.', smell: ' Aprikos. ' }, 'nb');
    expect(kjennetegn).toEqual([
      { del: 'kjott', tekst: 'Hvitt og fast.' },
      { del: 'lukt', tekst: 'Aprikos.' }
    ]);
  });

  it('viser aldri smak, selv om kolonnen er fylt', () => {
    const rad = { ...PANTERMUSSERONG, taste: 'Mild.' } as ArtsfaktaRad;
    const { kjennetegn } = byggArtsfakta(rad, 'nb');
    expect(kjennetegn.map((k) => k.tekst)).not.toContain('Mild.');
    expect(kjennetegn).toHaveLength(4);
  });

  it('vises ikke på svensk — teksten er norsk og sikkerhetsnær', () => {
    expect(byggArtsfakta(PANTERMUSSERONG, 'sv').kjennetegn).toEqual([]);
  });

  it('inneholder ingen formulering som frikjenner et funn', () => {
    for (const { tekst } of byggArtsfakta(PANTERMUSSERONG, 'nb').kjennetegn) {
      expect(finnFrikjennendeFormuleringer(tekst), tekst).toEqual([]);
    }
  });
});

describe('en rad som ikke er typet', () => {
  it('tåler at alt mangler', () => {
    expect(byggArtsfakta({}, 'nb')).toEqual({
      habitat: [],
      vertstraer: [],
      substrat: null,
      vanlighet: null,
      familie: null,
      synonymer: [],
      kjennetegn: []
    });
  });

  it('tåler felt med feil form', () => {
    const rar = {
      edibility: 'edible',
      habitat: 'barskog',
      mycorrhizal_partners: 'gran',
      substrate: ['jord'],
      family: 42,
      synonyms: 'Agaricus',
      commonality: 3
    } as ArtsfaktaRad;
    expect(byggArtsfakta(rar, 'nb')).toEqual({
      habitat: [],
      vertstraer: [],
      substrat: null,
      vanlighet: null,
      familie: null,
      synonymer: [],
      kjennetegn: []
    });
  });

  it('fjerner tomme og gjentatte synonymer', () => {
    expect(byggArtsfakta({ synonyms: ['Agaricus silvaticus', ' ', 'Agaricus silvaticus'] }, 'nb').synonymer).toEqual([
      'Agaricus silvaticus'
    ]);
  });
});
