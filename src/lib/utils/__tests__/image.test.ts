import { describe, expect, it } from 'vitest';
import { base64ToBlob, dataUrlToBlob } from '../image';

// «hei» as base64 — 3 known bytes so we can assert exact content.
const HEI_BASE64 = 'aGVp';

describe('base64ToBlob', () => {
  it('decodes base64 to a Blob with the given mime type', async () => {
    const blob = base64ToBlob(HEI_BASE64, 'image/jpeg');
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBe(3);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes)).toEqual([104, 101, 105]); // h e i
  });

  it('handles empty input', () => {
    const blob = base64ToBlob('', 'image/png');
    expect(blob.size).toBe(0);
    expect(blob.type).toBe('image/png');
  });
});

describe('dataUrlToBlob', () => {
  it('parses mime type and payload from a data URL', async () => {
    const blob = dataUrlToBlob(`data:image/jpeg;base64,${HEI_BASE64}`);
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBe(3);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes)).toEqual([104, 101, 105]);
  });

  it('falls back to octet-stream when the header has no mime type', () => {
    const blob = dataUrlToBlob(`data:;base64,${HEI_BASE64}`);
    expect(blob.type).toBe('application/octet-stream');
    expect(blob.size).toBe(3);
  });

  it('throws on input without a payload', () => {
    expect(() => dataUrlToBlob('ikke-en-data-url')).toThrow();
  });
});
