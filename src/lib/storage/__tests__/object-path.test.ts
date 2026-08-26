import { describe, it, expect } from 'vitest';
import { storagePathFromPublicUrl, isOwnedByUser } from '../object-path';

const BASE = 'https://abcdefgh.supabase.co/storage/v1/object/public';
const USER = '11111111-2222-3333-4444-555555555555';

describe('storagePathFromPublicUrl', () => {
  it('henter stien ut av en ekte getPublicUrl-adresse', () => {
    expect(storagePathFromPublicUrl(`${BASE}/finding-images/${USER}/abc.jpg`, 'finding-images')).toBe(
      `${USER}/abc.jpg`
    );
  });

  it('dekoder prosentkoding', () => {
    expect(
      storagePathFromPublicUrl(`${BASE}/finding-images/${USER}/sopp%20i%20skogen.jpg`, 'finding-images')
    ).toBe(`${USER}/sopp i skogen.jpg`);
  });

  it('gir null for en annen bøtte', () => {
    expect(storagePathFromPublicUrl(`${BASE}/forum-images/${USER}/abc.jpg`, 'finding-images')).toBeNull();
  });

  it('gir null for en signert (ikke offentlig) adresse', () => {
    expect(
      storagePathFromPublicUrl(
        `https://abcdefgh.supabase.co/storage/v1/object/sign/finding-images/${USER}/abc.jpg?token=x`,
        'finding-images'
      )
    ).toBeNull();
  });

  it('gir null for søppel, tomt og manglende', () => {
    expect(storagePathFromPublicUrl('ikke en url', 'finding-images')).toBeNull();
    expect(storagePathFromPublicUrl('', 'finding-images')).toBeNull();
    expect(storagePathFromPublicUrl(null, 'finding-images')).toBeNull();
    expect(storagePathFromPublicUrl(undefined, 'finding-images')).toBeNull();
  });

  it('gir null for en tom sti etter bøttenavnet', () => {
    expect(storagePathFromPublicUrl(`${BASE}/finding-images/`, 'finding-images')).toBeNull();
  });

  /**
   * `new URL()` normaliserer bort `..` FØR vi ser stien, så en klatring ender
   * som en helt vanlig sti — her `annen/abc.jpg`. Den er ufarlig fordi
   * eierskapsvakten under avviser den: den ligger ikke i brukerens mappe.
   * Testen står her for å låse nettopp den kjeden — normalisering FØRST,
   * eierskap ETTERPÅ — så ingen senere bytter ut URL-parsingen med en
   * strengsplitt som ville sluppet `..` gjennom rått.
   */
  it('normaliserer bort stier som klatrer ut av mappa, og de faller på eierskapsvakten', () => {
    const path = storagePathFromPublicUrl(
      `${BASE}/finding-images/${USER}/../annen/abc.jpg`,
      'finding-images'
    );
    expect(path).toBe('annen/abc.jpg');
    expect(isOwnedByUser(path, USER)).toBe(false);
  });

  it('avviser en data:-adresse', () => {
    expect(storagePathFromPublicUrl('data:image/jpeg;base64,AAAA', 'finding-images')).toBeNull();
  });
});

describe('isOwnedByUser', () => {
  it('godtar brukerens egen mappe', () => {
    expect(isOwnedByUser(`${USER}/abc.jpg`, USER)).toBe(true);
  });

  /**
   * Kjernen i vakten: en bruker kan skrive en annens bilde-URL inn i sitt eget
   * funn (imageUrl kommer fra nettleseren), og uten dette ville slettingen av
   * eget funn tatt med seg en annens bilde.
   */
  it('avviser en annen brukers mappe', () => {
    expect(isOwnedByUser('99999999-0000-0000-0000-000000000000/abc.jpg', USER)).toBe(false);
  });

  it('avviser en mappe som bare LIGNER på brukerens', () => {
    expect(isOwnedByUser(`${USER}-annen/abc.jpg`, USER)).toBe(false);
  });

  it('avviser tomt og manglende', () => {
    expect(isOwnedByUser(null, USER)).toBe(false);
    expect(isOwnedByUser(`${USER}/abc.jpg`, '')).toBe(false);
  });
});
