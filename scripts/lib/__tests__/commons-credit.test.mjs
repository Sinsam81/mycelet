import { describe, expect, it } from 'vitest';
import {
  buildPatch,
  commonsFileNameFromUrl,
  commonsTitle,
  creditFromExtMetadata,
  isPlaceholderCredit,
  normalizePhotographer,
  shouldWrite,
  stripHtml
} from '../commons-credit.mjs';

/**
 * Alle URL-ene og alle Artist-verdiene under er hentet ordrett fra
 * artsbildene våre (migrasjon 012 og 017, slått opp mot Commons' API).
 * Dette er ikke oppdiktede kanttilfeller — det er datasettet.
 */

describe('commonsFileNameFromUrl', () => {
  it('tar filnavnet fra thumb-URL-er, ikke skaleringssegmentet', () => {
    // Den nærliggende feilen er å ta siste segment. Det gir «330px-…», som
    // ikke finnes som fil på Commons — hvert eneste oppslag ville bommet.
    expect(
      commonsFileNameFromUrl(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Fichten-Reizker_Lactarius_deterrimus.jpg/330px-Fichten-Reizker_Lactarius_deterrimus.jpg'
      )
    ).toBe('Fichten-Reizker Lactarius deterrimus.jpg');
  });

  it('tåler original-URL-er uten thumb-ledd', () => {
    expect(commonsFileNameFromUrl('https://upload.wikimedia.org/wikipedia/commons/6/66/Boletus_pinophilus3.JPG')).toBe(
      'Boletus pinophilus3.JPG'
    );
  });

  it('beholder store bokstaver i filendelsen — Commons skiller på dem', () => {
    expect(
      commonsFileNameFromUrl(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Russula_cyanoxantha.JPG/330px-Russula_cyanoxantha.JPG'
      )
    ).toBe('Russula cyanoxantha.JPG');
  });

  it('dekoder prosentkoding og punktum i filnavn', () => {
    expect(
      commonsFileNameFromUrl(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Suill.var.jpg/330px-Suill.var.jpg'
      )
    ).toBe('Suill.var.jpg');
    expect(
      commonsFileNameFromUrl(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Fr%C3%BChjahrslorchel.JPG/330px-Fr%C3%BChjahrslorchel.JPG'
      )
    ).toBe('Frühjahrslorchel.JPG');
  });

  it('avviser alt som ikke er en Commons-fil', () => {
    // Lokale wiki-opplastinger ligger IKKE på Commons — et oppslag der ville
    // gitt «missing» og sett ut som et tomt svar i stedet for en uløst URL.
    expect(commonsFileNameFromUrl('https://upload.wikimedia.org/wikipedia/en/a/ab/Foo.jpg')).toBeNull();
    // Kindwise sine similar_images og våre egne Storage-bilder.
    expect(commonsFileNameFromUrl('https://mushroom-id.ams3.cdn.digitaloceanspaces.com/a.jpg')).toBeNull();
    expect(commonsFileNameFromUrl('')).toBeNull();
    expect(commonsFileNameFromUrl(null)).toBeNull();
    expect(commonsFileNameFromUrl('ikke en url')).toBeNull();
  });

  it('setter File:-prefikset i tittelen API-et vil ha', () => {
    expect(commonsTitle('Suill.var.jpg')).toBe('File:Suill.var.jpg');
  });
});

describe('stripHtml', () => {
  it('fjerner tagger og dekoder entiteter', () => {
    expect(stripHtml('<a href="//commons.wikimedia.org/wiki/User:X">Kari &amp; Ola</a>')).toBe('Kari & Ola');
  });

  it('lar blokkelementer bli mellomrom, ikke ordsammenskriving', () => {
    expect(stripHtml('<p>Foto</p><p>Kari</p>')).toBe('Foto Kari');
  });

  it('deler ikke et navn i to på inline-tagger', () => {
    // <b> og <span> står ofte MIDT i et navn — et mellomrom der ville
    // gjort «Leduc» til «Le duc».
    expect(stripHtml('<span class="fn value">Jean-Pierre <b>Le</b>duc</span>')).toBe('Jean-Pierre Leduc');
  });

  it('kaster innholdet i style/script, ikke bare tagene', () => {
    expect(stripHtml('<style>.a{color:red}</style>Kari')).toBe('Kari');
  });
});

describe('normalizePhotographer', () => {
  it('pakker navnet ut av «No machine-readable author provided»-malen', () => {
    expect(
      normalizePhotographer(
        'No machine-readable author provided. <a href="//commons.wikimedia.org/wiki/User:Archenzo" title="User:Archenzo">Archenzo</a> assumed (based on copyright claims).'
      )
    ).toBe('Archenzo');
  });

  it('pakker navnet ut av Mushroom Observer-malen', () => {
    // Uten dette ville artssiden vist en hel avsnittslang setning som
    // «fotograf» — malen står på fem av bildene våre.
    expect(
      normalizePhotographer(
        'This image was created by user <a href="https://mushroomobserver.org/observer/show_user/1">Ron Pastorino (Ronpast)</a> at <a href="https://mushroomobserver.org">Mushroom Observer</a>, a source for mycological images. You can contact this user here.'
      )
    ).toBe('Ron Pastorino (Ronpast)');
  });

  it('beholder hvilken wiki et overført bilde kom fra', () => {
    expect(
      normalizePhotographer(
        'The original uploader was <a href="https://en.wikipedia.org/wiki/User:Michaelll">Michaelll</a> at <a href="https://en.wikipedia.org/wiki/">English Wikipedia</a>.'
      )
    ).toBe('Michaelll (English Wikipedia)');
  });

  it('fjerner originalfilnavnet fra bearbeidede filer, men beholder begge personene', () => {
    // CC krever at BÅDE opphavspersonen og bearbeidingen kommer fram.
    expect(normalizePhotographer('2009-11-19_Flammulina_sp_biolib.cz.jpg: František ŠARŽÍK derivative work: Ak ccm')).toBe(
      'František ŠARŽÍK derivative work: Ak ccm'
    );
  });

  it('fjerner «User:»-prefikset', () => {
    expect(normalizePhotographer('<a href="x" title="User:Strobilomyces">User:Strobilomyces</a>')).toBe('Strobilomyces');
  });

  it('beholder avsluttende punktum som hører til navnet', () => {
    // «Pavel N.» er en ekte kreditering i settet vårt. En generell
    // punktum-strippekode ville gjort den om til feil navn.
    expect(normalizePhotographer('Pavel N.')).toBe('Pavel N.');
  });

  it('gir null for en henvisning i stedet for et navn', () => {
    // Østerssoppbildet vårt har bokstavelig talt dette i Artist-feltet.
    // Skrevet inn ville linja lydt «Foto: voir ci-dessous / see below».
    expect(normalizePhotographer('voir ci-dessous / see below')).toBeNull();
    expect(normalizePhotographer('See below')).toBeNull();
    expect(normalizePhotographer('Unknown author')).toBeNull();
  });

  it('fjerner interwiki-prefikset på overførte brukersider', () => {
    expect(
      normalizePhotographer('<a href="https://en.wikipedia.org/wiki/User:Ben_DeRoy" title="en:User:Ben DeRoy">en:User:Ben DeRoy</a>')
    ).toBe('Ben DeRoy');
    expect(normalizePhotographer('ja:User:Σ64')).toBe('Σ64');
  });

  it('gir null for tomt felt — ikke en tom streng', () => {
    // En tom streng i basen ville rendret som «Foto:  (CC BY-SA 3.0)».
    expect(normalizePhotographer('')).toBeNull();
    expect(normalizePhotographer('   ')).toBeNull();
    expect(normalizePhotographer(null)).toBeNull();
  });
});

describe('creditFromExtMetadata', () => {
  it('leser fotograf og lisenskortnavn', () => {
    expect(
      creditFromExtMetadata({
        Artist: { value: '<a href="x">Holger Krisp</a>' },
        LicenseShortName: { value: 'CC BY 3.0' },
        AttributionRequired: { value: 'true' }
      })
    ).toEqual({ photographer: 'Holger Krisp', license: 'CC BY 3.0', attributionRequired: true });
  });

  it('bruker ALDRI Credit som fotograf', () => {
    // Credit er «source», ikke person: verdiene der er «Own work»,
    // «Self-photographed» og filnavn. Skrevet inn som fotograf ville de vært
    // en falsk kreditering — riktig svar er null, så bildet havner i
    // rapporten over det som må krediteres for hånd.
    const credit = creditFromExtMetadata({
      Credit: { value: 'Own work' },
      LicenseShortName: { value: 'CC BY-SA 3.0' },
      AttributionRequired: { value: 'true' }
    });
    expect(credit.photographer).toBeNull();
    expect(credit.attributionRequired).toBe(true);
  });

  it('faller tilbake på UsageTerms, så License, når kortnavnet mangler', () => {
    expect(creditFromExtMetadata({ UsageTerms: { value: 'Creative Commons Attribution-Share Alike 3.0' } }).license).toBe(
      'Creative Commons Attribution-Share Alike 3.0'
    );
    expect(creditFromExtMetadata({ License: { value: 'cc-by-sa-3.0' } }).license).toBe('cc-by-sa-3.0');
  });

  it('tåler at hele extmetadata mangler', () => {
    expect(creditFromExtMetadata(undefined)).toEqual({
      photographer: null,
      license: null,
      attributionRequired: false
    });
  });
});

describe('isPlaceholderCredit', () => {
  it('regner seedingens verdier som «mangler»', () => {
    // Det er nettopp disse backfillen skal overskrive: «Wikimedia Commons»
    // er en kilde, ikke en lisens — og ikke en fotograf.
    expect(isPlaceholderCredit('Wikimedia Commons')).toBe(true);
    expect(isPlaceholderCredit('CC BY-SA / public domain')).toBe(true);
    expect(isPlaceholderCredit(null)).toBe(true);
    expect(isPlaceholderCredit('')).toBe(true);
  });

  it('regner en ekte kreditering som satt', () => {
    expect(isPlaceholderCredit('Holger Krisp')).toBe(false);
    expect(isPlaceholderCredit('CC BY-SA 4.0')).toBe(false);
  });
});

describe('shouldWrite', () => {
  it('overskriver plassholderne fra seedingen', () => {
    expect(shouldWrite('Wikimedia Commons', 'CC BY-SA 4.0')).toBe(true);
    expect(shouldWrite(null, 'Holger Krisp')).toBe(true);
  });

  it('rører ikke en ekte kreditering — backfillen skal kunne kjøres om igjen', () => {
    // Har noen rettet en kreditering for hånd, skal en ny kjøring ikke
    // trampe over den.
    expect(shouldWrite('Kari Nordmann', 'Ola Nordmann')).toBe(false);
    expect(shouldWrite('Kari Nordmann', 'Ola Nordmann', true)).toBe(true);
  });

  it('sletter aldri en ekte kreditering fordi Commons manglet forfatter', () => {
    expect(shouldWrite('Kari Nordmann', null)).toBe(false);
    expect(shouldWrite(null, null)).toBe(false);
  });

  it('rydder bort en plassholder selv når Commons ikke ga noe å sette i stedet', () => {
    // Fire rader satt igjen med `photographer = 'Wikimedia Commons'` etter
    // første kjøring — et fotografnavn som utgir en organisasjon for en
    // person. Uten denne regelen ville de blitt stående for alltid.
    expect(shouldWrite('Wikimedia Commons', null)).toBe(true);
    expect(shouldWrite('', null)).toBe(true);
  });

  it('skriver ikke når verdien allerede er riktig — kjøring nummer to er en no-op', () => {
    expect(shouldWrite('CC BY-SA 4.0', 'CC BY-SA 4.0')).toBe(false);
  });
});

describe('buildPatch', () => {
  const CREDIT = {
    photographer: 'Holger Krisp',
    license: 'CC BY 3.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Parasol.jpg'
  };
  const PHOTO_COLUMNS = { photographer: 'photographer', license: 'license', sourceUrl: 'source_url' };
  const SPECIES_COLUMNS = {
    photographer: 'primary_image_photographer',
    license: 'primary_image_license',
    sourceUrl: 'primary_image_source_url'
  };

  it('fyller en fersk species_photos-rad slik seedingen etterlot den', () => {
    expect(
      buildPatch({ photographer: null, license: 'Wikimedia Commons', source_url: null }, CREDIT, PHOTO_COLUMNS)
    ).toEqual({
      photographer: 'Holger Krisp',
      license: 'CC BY 3.0',
      source_url: 'https://commons.wikimedia.org/wiki/File:Parasol.jpg'
    });
  });

  it('bruker de denormaliserte kolonnenavnene på mushroom_species', () => {
    expect(buildPatch({}, CREDIT, SPECIES_COLUMNS)).toEqual({
      primary_image_photographer: 'Holger Krisp',
      primary_image_license: 'CC BY 3.0',
      primary_image_source_url: 'https://commons.wikimedia.org/wiki/File:Parasol.jpg'
    });
  });

  it('gir null når raden allerede er riktig — så ingen unødig skriving skjer', () => {
    expect(
      buildPatch(
        { photographer: 'Holger Krisp', license: 'CC BY 3.0', source_url: CREDIT.sourceUrl },
        CREDIT,
        PHOTO_COLUMNS
      )
    ).toBeNull();
  });

  it('endrer bare feltene som faktisk mangler', () => {
    expect(
      buildPatch(
        { photographer: 'Holger Krisp', license: 'Wikimedia Commons', source_url: CREDIT.sourceUrl },
        CREDIT,
        PHOTO_COLUMNS
      )
    ).toEqual({ license: 'CC BY 3.0' });
  });
});
