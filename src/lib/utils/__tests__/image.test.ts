import { describe, expect, it } from 'vitest';
import { BildeFeil, base64ToBlob, bildeFeilKode, dataUrlToBlob } from '../image';

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

  it('kaster en BildeFeil med kode — kallstedet oversetter, ikke denne fila', () => {
    let feil: unknown;
    try {
      dataUrlToBlob('ikke-en-data-url');
    } catch (e) {
      feil = e;
    }
    expect(feil).toBeInstanceOf(BildeFeil);
    expect(bildeFeilKode(feil)).toBe('ugyldig-data');
  });
});

/**
 * Bildefunksjonene kastet `new Error('Kunne ikke lese bilde.')`, og sidene
 * viste `err.message` rått — norsk til svenske brukere. Koden er det sidene
 * oversetter fra.
 */
describe('BildeFeil', () => {
  it('bærer koden, og er fortsatt en Error', () => {
    const feil = new BildeFeil('ulesbart');
    expect(feil).toBeInstanceOf(Error);
    expect(feil.name).toBe('BildeFeil');
    expect(feil.kode).toBe('ulesbart');
  });

  it('meldingen er den samme norske setningen som før', () => {
    // Kallsteder som ikke er flyttet ennå viser err.message. De skal vise det
    // de alltid har vist, ikke en intern kode — og Sentry skal kunne leses.
    expect(new BildeFeil('ulesbart').message).toBe('Kunne ikke lese bilde.');
    expect(new BildeFeil('canvas').message).toBe('Kunne ikke initialisere canvas.');
    expect(new BildeFeil('komprimering').message).toBe('Kunne ikke komprimere bilde.');
    expect(new BildeFeil('ugyldig-data').message).toBe('Ugyldig bilde-data.');
  });
});

describe('bildeFeilKode', () => {
  it('gir koden for en BildeFeil', () => {
    expect(bildeFeilKode(new BildeFeil('komprimering'))).toBe('komprimering');
  });

  it('leser feltet, ikke klassen — en feil som har krysset en modulgrense teller også', () => {
    expect(bildeFeilKode({ kode: 'ulesbart', message: 'x' })).toBe('ulesbart');
  });

  it('gir null for alt som ikke er en bildefeil', () => {
    expect(bildeFeilKode(new Error('Kunne ikke lese bilde.'))).toBeNull();
    expect(bildeFeilKode(new TypeError('Load failed'))).toBeNull();
    expect(bildeFeilKode({ kode: 'kamera-avslatt' })).toBeNull();
    expect(bildeFeilKode({ kode: 42 })).toBeNull();
    expect(bildeFeilKode('ulesbart')).toBeNull();
    expect(bildeFeilKode(null)).toBeNull();
    expect(bildeFeilKode(undefined)).toBeNull();
  });

  it('lar seg ikke lure av navn alle objekter har', () => {
    // `'toString' in {}` er sant. En kode må stå i tabellen selv.
    expect(bildeFeilKode({ kode: 'toString' })).toBeNull();
    expect(bildeFeilKode({ kode: 'constructor' })).toBeNull();
  });
});
