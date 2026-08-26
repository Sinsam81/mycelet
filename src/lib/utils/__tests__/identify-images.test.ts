import { describe, expect, it } from 'vitest';
import {
  MAX_IDENTIFY_IMAGES,
  MAX_IMAGE_BASE64_CHARS,
  MAX_TOTAL_BASE64_CHARS,
  normalizeIdentifyImages
} from '../identify-images';

const BILDE = 'x'.repeat(500_000);

describe('normalizeIdentifyImages', () => {
  it('godtar den gamle enkeltbilde-formen — API-tester og åpne faner under deploy sender den', () => {
    const r = normalizeIdentifyImages({ image: BILDE });
    expect(r).toEqual({ ok: true, images: [BILDE] });
  });

  it('godtar flerbilde-formen og bevarer rekkefølgen (første bilde blir funnfoto og hero)', () => {
    const r = normalizeIdentifyImages({ images: ['a'.repeat(1000), 'b'.repeat(1000), 'c'.repeat(1000)] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.images.map((i) => i[0])).toEqual(['a', 'b', 'c']);
  });

  it('images-arrayet vinner over image-feltet når begge finnes', () => {
    const r = normalizeIdentifyImages({ image: 'gammel', images: [BILDE] });
    expect(r).toEqual({ ok: true, images: [BILDE] });
  });

  it('avviser tomt, for mange, og ikke-strenger', () => {
    expect(normalizeIdentifyImages({})).toEqual({ ok: false, error: 'missing_image' });
    expect(normalizeIdentifyImages({ images: [] })).toEqual({ ok: false, error: 'missing_image' });
    expect(normalizeIdentifyImages({ images: [BILDE, BILDE, BILDE, BILDE] })).toEqual({
      ok: false,
      error: 'too_many_images'
    });
    expect(normalizeIdentifyImages({ images: [BILDE, 42 as unknown as string] })).toEqual({
      ok: false,
      error: 'missing_image'
    });
    expect(normalizeIdentifyImages({ images: [''] })).toEqual({ ok: false, error: 'missing_image' });
  });

  it('avviser for store bilder — per bilde og totalt (Vercels 4,5 MB-tak svarer 413 med HTML)', () => {
    expect(normalizeIdentifyImages({ images: ['x'.repeat(MAX_IMAGE_BASE64_CHARS + 1)] })).toEqual({
      ok: false,
      error: 'image_too_large'
    });
    // Tre bilder som hver er lovlige, men som samlet passerer totaltaket.
    const stor = 'x'.repeat(MAX_IMAGE_BASE64_CHARS - 1000);
    expect(normalizeIdentifyImages({ images: [stor, stor, 'x'.repeat(1000)] })).toEqual({
      ok: false,
      error: 'image_too_large'
    });
  });

  it('takene ligger under Vercels 4,5 MB request-tak — ellers kan de aldri slå til i prod', () => {
    // Ett base64-tegn = én wire-byte. En «grense» over plattformtaket er død
    // kode: Vercel svarer 413 med HTML før ruta i det hele tatt kjører.
    const VERCEL_BODY_CAP_BYTES = 4_500_000;
    expect(MAX_TOTAL_BASE64_CHARS).toBeLessThan(VERCEL_BODY_CAP_BYTES);
    expect(MAX_IMAGE_BASE64_CHARS).toBeLessThanOrEqual(MAX_TOTAL_BASE64_CHARS);
  });

  it('taket er tre bilder — Kindwise sitt eget anbefalte antall', () => {
    expect(MAX_IDENTIFY_IMAGES).toBe(3);
  });
});
