import { describe, expect, it } from 'vitest';
import { lagringsBeskjed, serverFeiltekst } from '../funn-svar';

describe('serverFeiltekst', () => {
  it('slipper gjennom rategrensens oversatte tekst på en 429, selv uten code', () => {
    const svar = { error: 'För många förfrågningar — försök igen om en stund', retryAfterSeconds: 30 };
    expect(serverFeiltekst(svar, { status: 429 })).toBe('För många förfrågningar — försök igen om en stund');
    expect(serverFeiltekst(svar, { status: 429, medDetaljer: true })).toBe('För många förfrågningar — försök igen om en stund');
    // Uten statusen, med en annen status eller uten rategrensens form: katalogen.
    expect(serverFeiltekst(svar)).toBeNull();
    expect(serverFeiltekst(svar, { status: 500 })).toBeNull();
    expect(serverFeiltekst({ error: 'Too Many Requests' }, { status: 429 })).toBeNull();
    expect(serverFeiltekst({ error: '', retryAfterSeconds: 30 }, { status: 429 })).toBeNull();
  });


  it('gir rutas oversatte tekst når svaret har en kode', () => {
    expect(serverFeiltekst({ error: 'Hittade inte fyndet', code: 'not_found' })).toBe('Hittade inte fyndet');
  });

  it('gir null for et svar som ikke er rutas eget', () => {
    expect(serverFeiltekst({ error: 'upstream connect error' })).toBeNull();
    expect(serverFeiltekst(null)).toBeNull();
    expect(serverFeiltekst('<html>502</html>')).toBeNull();
    expect(serverFeiltekst({ code: 'save_failed' })).toBeNull();
    expect(serverFeiltekst({ code: 'save_failed', error: 42 })).toBeNull();
  });

  it('gir details bare når kallstedet ber om det', () => {
    const svar = { error: 'Funksjonen er ikke slått på ennå', details: 'Funnet ditt er trygt og IKKE slettet.', code: 'feature_not_enabled' };
    expect(serverFeiltekst(svar)).toBe('Funksjonen er ikke slått på ennå');
    expect(serverFeiltekst(svar, { medDetaljer: true })).toBe('Funnet ditt er trygt og IKKE slettet.');
    expect(serverFeiltekst({ ...svar, details: '' }, { medDetaljer: true })).toBe('Funksjonen er ikke slått på ennå');
  });
});

describe('lagringsBeskjed', () => {
  it('leser notice fra et vellykket svar', () => {
    expect(lagringsBeskjed({ ok: true, notice: { code: 'zone_saved_private', message: 'Lagret som privat.' } })).toEqual({
      code: 'zone_saved_private',
      message: 'Lagret som privat.'
    });
  });

  it('gir null uten notice, eller når den ikke har formen', () => {
    expect(lagringsBeskjed({ ok: true, id: 'x' })).toBeNull();
    expect(lagringsBeskjed(null)).toBeNull();
    expect(lagringsBeskjed({ notice: 'Lagret som privat.' })).toBeNull();
    expect(lagringsBeskjed({ notice: { code: 'x' } })).toBeNull();
    expect(lagringsBeskjed({ notice: { code: 'x', message: '   ' } })).toBeNull();
    expect(lagringsBeskjed({ notice: { message: 'tekst' } })).toBeNull();
  });
});
