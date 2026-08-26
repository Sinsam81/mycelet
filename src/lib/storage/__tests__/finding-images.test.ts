import { describe, it, expect } from 'vitest';
import { findingImagePaths } from '../finding-images';

const BASE = 'https://abcdefgh.supabase.co/storage/v1/object/public/finding-images';
const USER = '11111111-2222-3333-4444-555555555555';
const ANNEN = '99999999-8888-7777-6666-555555555555';

describe('findingImagePaths', () => {
  it('gir én sti når bilde og miniatyr peker på samme fil', () => {
    expect(
      findingImagePaths({
        user_id: USER,
        image_url: `${BASE}/${USER}/a.jpg`,
        thumbnail_url: `${BASE}/${USER}/a.jpg`
      })
    ).toEqual([`${USER}/a.jpg`]);
  });

  it('gir begge stiene når de faktisk er to filer', () => {
    expect(
      findingImagePaths({
        user_id: USER,
        image_url: `${BASE}/${USER}/full.jpg`,
        thumbnail_url: `${BASE}/${USER}/mini.jpg`
      })
    ).toEqual([`${USER}/full.jpg`, `${USER}/mini.jpg`]);
  });

  it('gir tom liste for funn uten bilde', () => {
    expect(findingImagePaths({ user_id: USER, image_url: null, thumbnail_url: null })).toEqual([]);
  });

  /**
   * Kjernevakten. imageUrl kommer fra nettleseren, så en bruker kan legge en
   * ANNENS bilde-URL i sitt eget funn. Slettes funnet, skal den filen bli
   * liggende.
   */
  it('rører ikke en annen brukers fil, selv om den står i raden', () => {
    expect(
      findingImagePaths({
        user_id: USER,
        image_url: `${BASE}/${ANNEN}/hemmelig.jpg`,
        thumbnail_url: `${BASE}/${ANNEN}/hemmelig.jpg`
      })
    ).toEqual([]);
  });

  it('rører ikke filer i en annen bøtte', () => {
    expect(
      findingImagePaths({
        user_id: USER,
        image_url: `https://abcdefgh.supabase.co/storage/v1/object/public/forum-images/${USER}/a.jpg`,
        thumbnail_url: null
      })
    ).toEqual([]);
  });

  it('gir tom liste for en eierløs rad', () => {
    expect(
      findingImagePaths({ user_id: null, image_url: `${BASE}/${USER}/a.jpg`, thumbnail_url: null })
    ).toEqual([]);
  });
});
