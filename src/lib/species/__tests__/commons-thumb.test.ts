import { describe, expect, it } from 'vitest';
import { COMMONS_TRINN, commonsBredde, commonsFilnavn, commonsSrcSet, commonsThumb, commonsUtgaver } from '../commons-thumb';

/**
 * URL-ene er slik de står i basen (lest 16. november 2026): 36 bilder lagret
 * 330 brede, 36 lagret 500 brede, alle på upload.wikimedia.org.
 */
const KANTARELL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Chanterelle_Cantharellus_cibarius.jpg/330px-Chanterelle_Cantharellus_cibarius.jpg';
const SANDMORKEL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Fr%C3%BChjahrslorchel.JPG/500px-Fr%C3%BChjahrslorchel.JPG';
const HONNINGSOPP =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Armillaria_mellea%2C_Honey_Fungus%2C_UK_1.jpg/330px-Armillaria_mellea%2C_Honey_Fungus%2C_UK_1.jpg';

describe('commonsThumb', () => {
  it('bytter bare bredden — samme fil, samme vert', () => {
    expect(commonsThumb(KANTARELL, 960)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Chanterelle_Cantharellus_cibarius.jpg/960px-Chanterelle_Cantharellus_cibarius.jpg'
    );
    expect(commonsThumb(KANTARELL, 1280)).toContain('/1280px-Chanterelle_Cantharellus_cibarius.jpg');
    expect(new URL(commonsThumb(KANTARELL, 1280)).hostname).toBe('upload.wikimedia.org');
  });

  it('klemmer ønsket bredde opp til nærmeste faste trinn', () => {
    // Commons svarer 400 på en bredde utenfor de faste trinnene (700 px målt
    // 16. november 2026).
    expect(COMMONS_TRINN).toEqual([330, 500, 960, 1280]);
    expect(commonsThumb(KANTARELL, 700)).toContain('/960px-');
    expect(commonsThumb(KANTARELL, 56)).toContain('/330px-');
    expect(commonsThumb(KANTARELL, 331)).toContain('/500px-');
    expect(commonsThumb(KANTARELL, 500)).toContain('/500px-');
    expect(commonsThumb(KANTARELL, 4000)).toContain('/1280px-');
  });

  it('returnerer den lagrede URL-en uendret når bredden allerede stemmer', () => {
    expect(commonsThumb(KANTARELL, 330)).toBe(KANTARELL);
    expect(commonsThumb(SANDMORKEL, 400)).toBe(SANDMORKEL);
  });

  it('rører ikke kodingen i filnavnet', () => {
    expect(commonsThumb(SANDMORKEL, 960)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Fr%C3%BChjahrslorchel.JPG/960px-Fr%C3%BChjahrslorchel.JPG'
    );
    expect(commonsThumb(HONNINGSOPP, 500)).toContain('/500px-Armillaria_mellea%2C_Honey_Fungus%2C_UK_1.jpg');
  });

  it('finner bredden også når siste ledd har et ledd foran den', () => {
    const tif =
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Sopp.tif/lossy-page1-500px-Sopp.tif.jpg';
    expect(commonsBredde(tif)).toBe(500);
    expect(commonsThumb(tif, 960)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Sopp.tif/lossy-page1-960px-Sopp.tif.jpg'
    );
  });

  it('tar bredden i starten av leddet, ikke et «px-» lenger ute i filnavnet', () => {
    const rar = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Sopp-12px-utsnitt.jpg/330px-Sopp-12px-utsnitt.jpg';
    expect(commonsBredde(rar)).toBe(330);
    expect(commonsThumb(rar, 960)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Sopp-12px-utsnitt.jpg/960px-Sopp-12px-utsnitt.jpg'
    );
  });

  it('lar alt som ikke er en Commons-miniatyr gå uendret gjennom', () => {
    const andre = [
      'https://abc.supabase.co/storage/v1/object/public/findings/x/330px-bilde.jpg',
      'https://plant.id.kindwise.com/media/images/330px-abc.jpg',
      // Originalen, ikke en miniatyr: ingen bredde å bytte.
      'https://upload.wikimedia.org/wikipedia/commons/9/9a/Chanterelle_Cantharellus_cibarius.jpg',
      // Rett vert i stien er ikke rett vert.
      'https://example.com/upload.wikimedia.org/wikipedia/commons/thumb/9/9a/A.jpg/330px-A.jpg',
      'http://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/A.jpg/330px-A.jpg',
      'ikke en url',
      ''
    ];
    for (const url of andre) {
      expect(commonsThumb(url, 960), url).toBe(url);
      expect(commonsSrcSet(url), url).toBeUndefined();
      expect(commonsBredde(url), url).toBeNull();
      expect(commonsFilnavn(url), url).toBeNull();
    }
    expect(commonsThumb(null, 960)).toBeNull();
    expect(commonsThumb(undefined, 960)).toBeUndefined();
    expect(commonsSrcSet(null)).toBeUndefined();
  });

  it('lar URL-en stå når ønsket bredde ikke er et tall å regne med', () => {
    for (const bredde of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(commonsThumb(KANTARELL, bredde), String(bredde)).toBe(KANTARELL);
    }
  });

  it('beholder en spørring bak filnavnet', () => {
    expect(commonsThumb(`${KANTARELL}?utm=1`, 500)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Chanterelle_Cantharellus_cibarius.jpg/500px-Chanterelle_Cantharellus_cibarius.jpg?utm=1'
    );
  });
});

describe('commonsFilnavn', () => {
  it('gir filnavnet slik Commons kjenner det — dekodet, med mellomrom', () => {
    expect(commonsFilnavn(KANTARELL)).toBe('Chanterelle Cantharellus cibarius.jpg');
    expect(commonsFilnavn(SANDMORKEL)).toBe('Frühjahrslorchel.JPG');
    expect(commonsFilnavn(HONNINGSOPP)).toBe('Armillaria mellea, Honey Fungus, UK 1.jpg');
  });
});

describe('commonsSrcSet', () => {
  it('tilbyr den lagrede utgaven og trinnene over den', () => {
    expect(commonsSrcSet(KANTARELL)).toBe(
      [
        `${KANTARELL} 330w`,
        'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Chanterelle_Cantharellus_cibarius.jpg/500px-Chanterelle_Cantharellus_cibarius.jpg 500w',
        'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Chanterelle_Cantharellus_cibarius.jpg/960px-Chanterelle_Cantharellus_cibarius.jpg 960w',
        'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Chanterelle_Cantharellus_cibarius.jpg/1280px-Chanterelle_Cantharellus_cibarius.jpg 1280w'
      ].join(', ')
    );
  });

  it('gjentar ikke den lagrede bredden', () => {
    const sett = commonsSrcSet(SANDMORKEL) ?? '';
    expect(sett.match(/ 500w/g)).toHaveLength(1);
    expect(sett.startsWith(`${SANDMORKEL} 500w, `)).toBe(true);
    expect(sett).not.toContain('330w');
  });

  it('går aldri bredere enn originalen', () => {
    // Commons skalerer OPP et trinn som er bredere enn originalen: flere byte,
    // ingen nye detaljer. Originalens bredde er taket.
    const bredder = (originalBredde: number) =>
      (commonsSrcSet(KANTARELL, originalBredde) ?? '').split(', ').map((kandidat) => kandidat.split(' ').pop());
    expect(bredder(1264)).toEqual(['330w', '500w', '960w']);
    expect(bredder(1280)).toEqual(['330w', '500w', '960w', '1280w']);
    expect(bredder(800)).toEqual(['330w', '500w']);
    expect(bredder(960)).toEqual(['330w', '500w', '960w']);
  });

  it('gir ingen srcset når den lagrede utgaven er alt originalen har', () => {
    // 400 piksler bred original, lagret som 330: ingenting bredere å by på.
    expect(commonsSrcSet(KANTARELL, 400)).toBeUndefined();
    expect(commonsSrcSet(SANDMORKEL, 800)).toBeUndefined();
  });

  it('har ikke noe tak når originalens bredde er ukjent', () => {
    for (const ukjent of [null, undefined, 0, -1, Number.NaN]) {
      expect(commonsSrcSet(KANTARELL, ukjent), String(ukjent)).toContain('1280w');
    }
  });

  it('skriver kandidater nettleseren kan lese, også med komma i filnavnet', () => {
    // srcset deles på komma FULGT AV mellomrom; et komma inne i en URL er lov
    // så lenge URL-en ikke slutter med det. Basen har kommaene prosentkodet
    // (%2C); et bokstavelig komma skal tåles like godt.
    for (const url of [HONNINGSOPP, HONNINGSOPP.replaceAll('%2C', ',')]) {
      const kandidater = (commonsSrcSet(url) ?? '').split(/,\s+/);
      expect(kandidater).toHaveLength(4);
      for (const kandidat of kandidater) {
        expect(kandidat).toMatch(/^https:\/\/upload\.wikimedia\.org\/\S+ \d+w$/);
        expect(kandidat.split(' ')[0].endsWith(',')).toBe(false);
      }
    }
  });
});

describe('commonsUtgaver', () => {
  it('lister utgavene smalest først, med den lagrede URL-en ordrett', () => {
    const utgaver = commonsUtgaver(KANTARELL, 1000);
    expect(utgaver.map((u) => u.bredde)).toEqual([330, 500, 960]);
    expect(utgaver[0].url).toBe(KANTARELL);
    expect(utgaver[2].url).toContain('/960px-');
  });

  it('har bare den lagrede utgaven når originalen ikke har mer', () => {
    expect(commonsUtgaver(KANTARELL, 400)).toEqual([{ bredde: 330, url: KANTARELL }]);
  });

  it('er tom for alt som ikke er en Commons-miniatyr', () => {
    expect(commonsUtgaver('https://abc.supabase.co/storage/v1/object/public/arter/1.jpg')).toEqual([]);
    expect(commonsUtgaver(null)).toEqual([]);
    expect(commonsUtgaver(undefined)).toEqual([]);
  });
});
