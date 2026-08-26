import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Nøkkelparitet mellom nb og sv er allerede dekket (src/lib/__tests__/messages.test.ts).
 * Det den testen IKKE fanger, er ugyldig ICU-syntaks: en plural-blokk med feil
 * form kaster først når meldingen faktisk formateres — altså på skjermen, hos
 * brukeren, ikke i CI. Historikklista har tre meldinger med argumenter, og de
 * formateres her i begge språk.
 */

const KATALOGER = [
  ['nb', nb],
  ['sv', sv]
] as const;

describe('Identifiseringer-tekstene formateres i begge språk', () => {
  for (const [locale, messages] of KATALOGER) {
    it(`${locale}: plural- og argumentmeldinger går gjennom`, () => {
      const t = createTranslator({ locale, messages, namespace: 'Identifiseringer' });

      for (const count of [0, 1, 2, 17]) {
        expect(t('summary', { count })).toContain(String(count));
        expect(t('photosAnalyzed', { count }).length).toBeGreaterThan(3);
      }
      expect(t('probability', { percent: 87 })).toContain('87');
      expect(t('nearPlace', { lat: '59.913', lng: '10.752' })).toContain('59.913');
    });

    it(`${locale}: sletteteksten sier at bildet går med, men at et lagret funn blir liggende`, () => {
      // Bekreftelsen må være ærlig om nøyaktig hva som forsvinner. Sier den
      // bare «slette?», tror brukeren enten at funnet ryker med, eller at
      // bildet blir liggende — begge er feil.
      const t = createTranslator({ locale, messages, namespace: 'Identifiseringer' });
      const tekst = t('deleteConfirm').toLowerCase();
      expect(tekst).toMatch(locale === 'nb' ? /bildet/ : /bilden/);
      expect(tekst).toMatch(locale === 'nb' ? /funn/ : /fynd/);
    });

    it(`${locale}: retensjonsnotisen nevner 12 måneder`, () => {
      const t = createTranslator({ locale, messages, namespace: 'Identifiseringer' });
      expect(t('retentionNote')).toContain('12');
    });

    it(`${locale}: personvernerklæringen sier at bildet lagres selv uten lagret funn`, () => {
      // Den reelle utvidelsen av hva vi lagrer. Den kan ikke skje stille.
      const t = createTranslator({ locale, messages, namespace: 'Personvern' });
      expect(t('collectImagesDesc')).toMatch(locale === 'nb' ? /IKKE lagrer/ : /INTE sparar/);
      expect(t('retentionIdentificationsDesc')).toContain('12');
    });
  }
});
