import { describe, expect, it } from 'vitest';
import { buildReferencePhotos, MAX_REFERENCE_PHOTOS } from '../reference-photos';

const CURATED = 'https://upload.wikimedia.org/wikipedia/commons/thumb/x/500px-kantarell.jpg';
const SIMILAR = [
  'https://mushroom-id.ams3.cdn.digitaloceanspaces.com/a.jpg',
  'https://mushroom-id.ams3.cdn.digitaloceanspaces.com/b.jpg',
  'https://mushroom-id.ams3.cdn.digitaloceanspaces.com/c.jpg'
];

describe('buildReferencePhotos', () => {
  it('tåler manglende forslag og tomme kilder', () => {
    expect(buildReferencePhotos(null)).toEqual([]);
    expect(buildReferencePhotos(undefined)).toEqual([]);
    expect(buildReferencePhotos({ imageUrl: null, similarImages: [] })).toEqual([]);
  });

  it('setter det kuraterte fotoet først — det er verifisert, AI-bildene er det ikke', () => {
    const photos = buildReferencePhotos({ imageUrl: CURATED, similarImages: SIMILAR });
    expect(photos[0]).toEqual({ url: CURATED, kind: 'curated' });
    expect(photos.slice(1).every((p) => p.kind === 'similar')).toBe(true);
  });

  it('holder totalen på maks tre bilder', () => {
    const photos = buildReferencePhotos({ imageUrl: CURATED, similarImages: SIMILAR });
    expect(photos).toHaveLength(MAX_REFERENCE_PHOTOS);
    // Kuratert + de to første AI-bildene; det tredje ofres.
    expect(photos.map((p) => p.url)).toEqual([CURATED, SIMILAR[0], SIMILAR[1]]);
  });

  it('bruker alle AI-bildene når kuratert foto mangler (8 av 80 arter mangler foto)', () => {
    const photos = buildReferencePhotos({ imageUrl: null, similarImages: SIMILAR });
    expect(photos.map((p) => p.url)).toEqual(SIMILAR);
    expect(photos.every((p) => p.kind === 'similar')).toBe(true);
  });

  it('hopper over duplikater og tomme strenger', () => {
    const photos = buildReferencePhotos({
      imageUrl: CURATED,
      similarImages: [CURATED, '', SIMILAR[0], SIMILAR[0]]
    });
    expect(photos.map((p) => p.url)).toEqual([CURATED, SIMILAR[0]]);
  });
});
