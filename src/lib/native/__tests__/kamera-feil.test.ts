import { describe, expect, it } from 'vitest';
import { kameraFeil } from '../camera';

describe('kameraFeil — pluginens engelske avvisninger', () => {
  it('kjenner igjen de tre avvisningene brukeren kan gjøre noe med', () => {
    expect(kameraFeil(new Error('User denied access to camera'))).toBe('kamera-avslatt');
    expect(kameraFeil(new Error('User denied access to photos'))).toBe('bilder-avslatt');
    expect(kameraFeil(new Error('Error loading image'))).toBe('bilde-utilgjengelig');
  });

  it('alt annet faller gjennom til den generelle meldingen', () => {
    expect(kameraFeil(new Error('Unable to convert image to jpeg'))).toBeNull();
    expect(kameraFeil(undefined)).toBeNull();
  });
});
