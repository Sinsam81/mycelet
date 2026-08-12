import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * SafetyWarning viser en «Digital soppkontroll»-lenke KUN når katalogen har
 * både URL og etikett (norsk har det; Sverige har ingen nasjonal digital
 * kontroll, så der er nøklene tomme med vilje — vi finner ikke på tjenester).
 *
 * Testene låser kontrakten komponenten hviler på:
 *  1. nøklene finnes i begge kataloger (next-intl kaster på manglende nøkler)
 *  2. tomme strenger kommer gjennom som tomme strenger, ikke som feil —
 *     det er dét som slår lenken av for svensk
 *  3. norsk har et konsistent par (begge satt), svensk et konsistent tomt par
 */

describe('SafetyWarning-katalogen: digital kontroll', () => {
  it('nøklene finnes i begge kataloger', () => {
    for (const katalog of [nb, sv]) {
      expect(katalog.Safety).toHaveProperty('digitalControlUrl');
      expect(katalog.SafetyWarning).toHaveProperty('digitalCheck');
    }
  });

  it('norsk har både URL og etikett; svensk har begge tomme', () => {
    expect(nb.Safety.digitalControlUrl).toBe('https://soppkontroll.no');
    expect(nb.SafetyWarning.digitalCheck.length).toBeGreaterThan(0);
    expect(sv.Safety.digitalControlUrl).toBe('');
    expect(sv.SafetyWarning.digitalCheck).toBe('');
  });

  it('next-intl håndterer den tomme svenske etiketten uten å kaste', () => {
    const t = createTranslator({ locale: 'sv', messages: sv as never, namespace: 'SafetyWarning' });
    expect(t('digitalCheck')).toBe('');
  });

  it('den norske etiketten kommer ordrett gjennom next-intl', () => {
    const t = createTranslator({ locale: 'nb', messages: nb as never, namespace: 'SafetyWarning' });
    expect(t('digitalCheck')).toContain('Digital soppkontroll');
  });
});
