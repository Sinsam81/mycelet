import { describe, expect, it } from 'vitest';
import { buildPhotoCredit, photoCreditFromSpeciesRow } from '../photo-credit';

describe('buildPhotoCredit', () => {
  it('gir «Foto: {fotograf} ({lisens})» når vi har begge deler', () => {
    expect(
      buildPhotoCredit({
        photographer: 'Holger Krisp',
        license: 'CC BY 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Parasol.jpg'
      })
    ).toEqual({
      shape: { key: 'full', values: { photographer: 'Holger Krisp', license: 'CC BY 3.0' } },
      href: 'https://commons.wikimedia.org/wiki/File:Parasol.jpg'
    });
  });

  it('nekter å rendre seedingens plassholdere som lisens', () => {
    // DETTE er hele poenget med funksjonen. Migrasjon 012 og 017 skrev
    // `license = 'Wikimedia Commons'` — en KILDE, ikke en lisens. Rendret
    // rått ville artssiden påstått at bildet er lisensiert under «Wikimedia
    // Commons»: en falsk lisenspåstand, verre enn ingen linje. Rader som
    // ennå ikke er etterfylt skal derfor være helt tause.
    expect(buildPhotoCredit({ photographer: null, license: 'Wikimedia Commons' })).toBeNull();
    expect(buildPhotoCredit({ photographer: 'Wikimedia Commons', license: 'CC BY-SA / public domain' })).toBeNull();
  });

  it('viser fotografen alene når lisensen mangler', () => {
    expect(buildPhotoCredit({ photographer: 'Alan Rockefeller', license: null })?.shape).toEqual({
      key: 'photographerOnly',
      values: { photographer: 'Alan Rockefeller' }
    });
  });

  it('viser lisensen alene når Commons ikke har fotograf', () => {
    // Tre av bildene våre har CC BY-SA uten maskinlesbar forfatter. Lisensen
    // er fortsatt en opplysning brukeren har krav på, og lenka til filsiden
    // fører til den fulle krediteringen.
    expect(buildPhotoCredit({ photographer: null, license: 'CC BY-SA 3.0' })?.shape).toEqual({
      key: 'licenseOnly',
      values: { license: 'CC BY-SA 3.0' }
    });
  });

  it('tier helt når vi ikke har noe å kreditere med', () => {
    expect(buildPhotoCredit({ photographer: null, license: null })).toBeNull();
    expect(buildPhotoCredit({ photographer: '   ', license: '' })).toBeNull();
    expect(buildPhotoCredit(null)).toBeNull();
    expect(buildPhotoCredit(undefined)).toBeNull();
  });

  it('lenker bare til http(s) — en databasekolonne skal ikke kunne bli et javascript:-lenkemål', () => {
    const credit = { photographer: 'Kari', license: 'CC BY 4.0' };
    expect(buildPhotoCredit({ ...credit, sourceUrl: 'javascript:alert(1)' })?.href).toBeNull();
    expect(buildPhotoCredit({ ...credit, sourceUrl: 'ikke en url' })?.href).toBeNull();
    expect(buildPhotoCredit({ ...credit, sourceUrl: null })?.href).toBeNull();
    expect(buildPhotoCredit({ ...credit, sourceUrl: 'http://commons.wikimedia.org/wiki/File:X.jpg' })?.href).toBe(
      'http://commons.wikimedia.org/wiki/File:X.jpg'
    );
  });

  it('trimmer verdiene — mellomrom rundt navnet skal ikke inn i teksten', () => {
    expect(buildPhotoCredit({ photographer: '  Pavel N. ', license: ' CC BY-SA 3.0 ' })?.shape).toEqual({
      key: 'full',
      values: { photographer: 'Pavel N.', license: 'CC BY-SA 3.0' }
    });
  });
});

describe('photoCreditFromSpeciesRow', () => {
  it('plukker krediteringen ut av de denormaliserte kolonnene', () => {
    expect(
      photoCreditFromSpeciesRow({
        primary_image_photographer: 'Jörg Hempel',
        primary_image_license: 'CC BY-SA 3.0 de',
        primary_image_source_url: 'https://commons.wikimedia.org/wiki/File:Laccaria.jpg'
      })
    ).toEqual({
      photographer: 'Jörg Hempel',
      license: 'CC BY-SA 3.0 de',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Laccaria.jpg'
    });
  });

  it('gir null i stedet for en tom kreditering', () => {
    // Ellers ville hvert eneste AI-forslag båret med seg
    // {photographer: null, license: null, sourceUrl: null} ut til klienten.
    expect(photoCreditFromSpeciesRow({})).toBeNull();
    expect(photoCreditFromSpeciesRow(null)).toBeNull();
    // Rader som ennå ikke er etterfylt: bare plassholderen fra seedingen.
    expect(photoCreditFromSpeciesRow({ primary_image_license: 'Wikimedia Commons' })).toBeNull();
  });
});
