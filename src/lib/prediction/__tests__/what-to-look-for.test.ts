import { describe, expect, it } from 'vitest';
import { buildWhatToLookFor, type WhatToLookForSpecies } from '../what-to-look-for';
import type { Locale } from '@/i18n/config';

/**
 * Radene under er kopiert fra migrasjonene som seeder `mushroom_species`
 * (009, 012, 017, 027) — samme feltverdier som står i produksjon. Poenget med
 * denne modulen er at HVER setning skal kunne spores til et felt, så testene
 * bruker ekte rader og ikke oppdiktede.
 */
const KANTARELL: WhatToLookForSpecies = {
  norwegian_name: 'Kantarell',
  swedish_name: 'Kantarell',
  genus: 'Cantharellus',
  mycorrhizal_partners: ['gran', 'furu', 'bjørk', 'eik'],
  habitat: ['barskog', 'blandingsskog', 'mose']
};

const TRAKTKANTARELL: WhatToLookForSpecies = {
  norwegian_name: 'Traktkantarell',
  swedish_name: 'Trattkantarell',
  genus: 'Craterellus',
  mycorrhizal_partners: ['gran'],
  habitat: ['granskog', 'moserik', 'fuktig']
};

const GRANMATRISKE: WhatToLookForSpecies = {
  norwegian_name: 'Granmatriske',
  swedish_name: 'Granblodriska',
  genus: 'Lactarius',
  mycorrhizal_partners: ['gran'],
  habitat: ['granskog', 'mose'],
  substrate: 'jord'
};

const GROVRISKE: WhatToLookForSpecies = {
  norwegian_name: 'Grovriske',
  swedish_name: 'Pepparriska',
  genus: 'Lactarius',
  mycorrhizal_partners: ['gran', 'bjørk'],
  habitat: ['barskog', 'løvskog', 'fuktig skog'],
  substrate: 'jord'
};

const VINTERSOPP: WhatToLookForSpecies = {
  norwegian_name: 'Vintersopp',
  swedish_name: 'Vinterskivling',
  genus: 'Flammulina',
  mycorrhizal_partners: null,
  habitat: ['løvskog'],
  substrate: 'død ved'
};

const BLOMKALSOPP: WhatToLookForSpecies = {
  norwegian_name: 'Blomkålsopp',
  swedish_name: 'Blomkålssvamp',
  genus: 'Sparassis',
  mycorrhizal_partners: ['furu'],
  habitat: ['furuskog'],
  substrate: 'ved rot/stubbe'
};

const NELLIKHATT: WhatToLookForSpecies = {
  norwegian_name: 'Nellikhatt',
  swedish_name: 'Nejlikbrosking',
  genus: 'Marasmius',
  mycorrhizal_partners: null,
  habitat: ['eng', 'plen', 'beite', 'gress'],
  substrate: 'jord'
};

const SKOGSJAMPINJONG: WhatToLookForSpecies = {
  norwegian_name: 'Skogsjampinjong',
  swedish_name: 'Skogschampinjon',
  genus: 'Agaricus',
  mycorrhizal_partners: null,
  habitat: ['barskog', 'granskog'],
  substrate: 'jord'
};

const SPISS_MORKEL: WhatToLookForSpecies = {
  norwegian_name: 'Spiss morkel',
  swedish_name: 'Spetsmurkla',
  genus: 'Morchella',
  mycorrhizal_partners: null,
  habitat: ['løvskog', 'barskog', 'brannfelt']
};

const VORTEROYKSOPP: WhatToLookForSpecies = {
  norwegian_name: 'Vorterøyksopp',
  swedish_name: 'Vårtig röksvamp',
  genus: 'Lycoperdon',
  mycorrhizal_partners: null,
  habitat: ['skog', 'eng', 'sti'],
  substrate: 'jord'
};

describe('setningen er avledet av artens egne felt', () => {
  it('navngir vertstrærne fra mycorrhizal_partners', () => {
    const line = buildWhatToLookFor(TRAKTKANTARELL, 'nb');
    expect(line).toBe(
      'Traktkantarell står i symbiose med gran — den vokser i tette flokker i mosen, så finner du én står det som regel flere rundt.'
    );
  });

  it('skriver «blant annet» når arten har flere partnere enn vi navngir', () => {
    // Kantarell har fire partnere i basen; setningen skal ikke late som den har tre.
    const line = buildWhatToLookFor(KANTARELL, 'nb');
    expect(line).toBe(
      'Kantarell står i symbiose med blant annet gran, furu og bjørk — se i kanten mot lysninger og langs stier, sjelden inne i tett, mørk skog.'
    );
  });

  it('lar substratet vinne over partnerlista når arten lever på ved', () => {
    // Blomkålsopp er ført med furu som «partner», men den lever på furuas rot.
    const line = buildWhatToLookFor(BLOMKALSOPP, 'nb');
    expect(line).toBe(
      'Blomkålsopp vokser ved rot og stubbe av furu — den kommer igjen på samme sted år etter år, så merk deg treet.'
    );
  });

  it('utleder løv eller bar for vedboende arter fra artens egne skogtagger', () => {
    expect(buildWhatToLookFor(VINTERSOPP, 'nb')).toBe(
      'Vintersopp vokser på død ved av løvtrær — se på stubber, nedfalne stammer og døde greiner, ofte står flere sammen på samme ved.'
    );
  });

  it('faller tilbake på habitat-taggene når arten ikke har vertstrær', () => {
    expect(buildWhatToLookFor(NELLIKHATT, 'nb')).toBe(
      'Nellikhatt vokser på eng, plen og beitemark — den danner buer og hekseringer i kortvokst gress.'
    );
    expect(buildWhatToLookFor(SKOGSJAMPINJONG, 'nb')).toBe(
      'Skogsjampinjong vokser i barskog og granskog — gå sakte langs stier, bestandskanter og små åpninger, der du ser bakken best.'
    );
  });

  it('bruker bare habitat-tagger som faktisk navngir et sted', () => {
    // 'brannfelt' er ikke et sted arten «vokser i» — det styrer søkerådet i stedet.
    const line = buildWhatToLookFor(SPISS_MORKEL, 'nb');
    expect(line).toBe('Spiss morkel vokser i løvskog og barskog — se etter brannfelt og annen forstyrret mark.');
  });

  it('gir ingen linje når raden verken har vertstrær, substrat eller habitat', () => {
    expect(buildWhatToLookFor({ norwegian_name: 'Ukjent art', genus: null }, 'nb')).toBeNull();
    expect(buildWhatToLookFor({ norwegian_name: 'Ukjent art', habitat: [], mycorrhizal_partners: [] }, 'nb')).toBeNull();
    // Bare modifikator-tagger: ingenting å peke på.
    expect(buildWhatToLookFor({ norwegian_name: 'Ukjent art', habitat: ['kalkrik', 'eldre bestand'] }, 'nb')).toBeNull();
  });

  it('gir ingen linje uten artsnavn', () => {
    expect(buildWhatToLookFor({ genus: 'Cantharellus', mycorrhizal_partners: ['gran'] }, 'nb')).toBeNull();
  });
});

describe('søkerådet velges per slekt, ellers per habitattype', () => {
  it('lar slekten gå foran habitattypen', () => {
    // Traktkantarell er både moserik og fuktig, men Craterellus-raden vinner.
    expect(buildWhatToLookFor(TRAKTKANTARELL, 'nb')).toContain('tette flokker i mosen');
  });

  it('bruker mose-taggen når slekten ikke står i tabellen', () => {
    expect(buildWhatToLookFor(GRANMATRISKE, 'nb')).toBe(
      'Granmatriske står i symbiose med gran — se i mosebunnen, der hatten så vidt kan stikke opp gjennom mosen.'
    );
  });

  it('lar fuktig skog og myr styre rådet foran den generelle skogen', () => {
    expect(buildWhatToLookFor(GROVRISKE, 'nb')).toBe(
      'Grovriske står i symbiose med gran og bjørk — se langs myrkanter og i fuktige partier.'
    );
  });

  it('gir skogsrådet, ikke engrådet, til arter som står i begge deler', () => {
    const line = buildWhatToLookFor(VORTEROYKSOPP, 'nb');
    expect(line).toContain('gå sakte langs stier, bestandskanter og små åpninger');
    expect(line).not.toContain('den åpne marka');
  });

  it('står forholdsleddet alene når vi verken har slekt eller habitattype', () => {
    // Partnere, men ingen habitat-tagger: da er det ikke noe søkeråd å slå opp.
    const line = buildWhatToLookFor(
      { norwegian_name: 'Testsopp', genus: 'Ukjentslekt', mycorrhizal_partners: ['bjørk'] },
      'nb'
    );
    expect(line).toBe('Testsopp står i symbiose med bjørk.');
  });
});

describe('svensk', () => {
  it('oversetter både artsnavn, vertstrær og søkeråd', () => {
    expect(buildWhatToLookFor(KANTARELL, 'sv')).toBe(
      'Kantarell lever i symbios med bland annat gran, tall och björk — leta i kanten mot gläntor och längs stigar, sällan inne i tät, mörk skog.'
    );
    expect(buildWhatToLookFor(GROVRISKE, 'sv')).toBe(
      'Pepparriska lever i symbios med gran och björk — leta längs myrkanter och i fuktiga partier.'
    );
  });

  it('oversetter habitat-taggene, ikke bare navnet', () => {
    expect(buildWhatToLookFor(SKOGSJAMPINJONG, 'sv')).toBe(
      'Skogschampinjon växer i barrskog och granskog — gå långsamt längs stigar, beståndskanter och små gläntor, där du ser marken bäst.'
    );
    expect(buildWhatToLookFor(NELLIKHATT, 'sv')).toBe(
      'Nejlikbrosking växer på äng, gräsmatta och betesmark — den bildar bågar och häxringar i kortvuxet gräs.'
    );
  });

  it('inneholder ingen norske vertstrenavn', () => {
    const line = buildWhatToLookFor(VINTERSOPP, 'sv');
    expect(line).toBe(
      'Vinterskivling växer på död ved av lövträd — leta på stubbar, liggande stammar och döda grenar, ofta står flera tillsammans på samma ved.'
    );
  });

  it('faller tilbake på det norske artsnavnet når swedish_name mangler', () => {
    const line = buildWhatToLookFor({ ...TRAKTKANTARELL, swedish_name: null }, 'sv');
    expect(line).toContain('Traktkantarell lever i symbios med gran');
  });
});

describe('robusthet', () => {
  it('tåler ukjent språk og faller tilbake på norsk', () => {
    expect(buildWhatToLookFor(GRANMATRISKE, 'de' as Locale)).toBe(buildWhatToLookFor(GRANMATRISKE, 'nb'));
  });

  it('bruker norsk når locale ikke er oppgitt', () => {
    expect(buildWhatToLookFor(KANTARELL)).toBe(buildWhatToLookFor(KANTARELL, 'nb'));
  });

  it('tåler tomme og whitespace-verdier i arraykolonnene', () => {
    const messy: WhatToLookForSpecies = {
      norwegian_name: 'Testsopp',
      genus: 'Ukjentslekt',
      mycorrhizal_partners: ['  Gran  ', '', '   '],
      habitat: ['  BARSKOG ', '']
    };
    expect(buildWhatToLookFor(messy, 'nb')).toBe(
      'Testsopp står i symbiose med gran — gå sakte langs stier, bestandskanter og små åpninger, der du ser bakken best.'
    );
  });

  it('skriver aldri mer enn én tankestrek i setningen', () => {
    // To tankestreker leser som to setninger klemt sammen; alle rådene er
    // skrevet med komma internt nettopp for å unngå det.
    const rows = [
      KANTARELL,
      TRAKTKANTARELL,
      GRANMATRISKE,
      GROVRISKE,
      VINTERSOPP,
      BLOMKALSOPP,
      NELLIKHATT,
      SKOGSJAMPINJONG,
      SPISS_MORKEL,
      VORTEROYKSOPP
    ];
    for (const locale of ['nb', 'sv'] as const) {
      for (const row of rows) {
        const line = buildWhatToLookFor(row, locale) ?? '';
        expect([line, (line.match(/—/g) ?? []).length]).toEqual([line, 1]);
        expect(line.endsWith('.')).toBe(true);
      }
    }
  });
});
