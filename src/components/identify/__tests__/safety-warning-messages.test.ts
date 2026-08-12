import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * SafetyWarning viser en «Digital soppkontroll»-lenke KUN for norsk locale —
 * tjenesten er norsk (appen Digital soppkontroll, soppkontroll.no), og Sverige
 * har ingen nasjonal motsvarighet vi kan vise til. Gaten ligger i komponenten
 * (useLocale() === 'nb'), IKKE i katalogene: paritets- og tomhetsvaktene i
 * messages.test.ts krever at nøklene finnes med ekte verdier på begge språk.
 *
 * Testene låser kontrakten komponenten hviler på:
 *  1. nøklene finnes i begge kataloger med innhold (next-intl kaster på
 *     manglende nøkler, og en tom streng ville rendret som blank etikett)
 *  2. den norske etiketten peker faktisk på Digital soppkontroll
 */

describe('SafetyWarning-katalogen: digital kontroll', () => {
  it('nøklene finnes i begge kataloger med innhold', () => {
    for (const katalog of [nb, sv]) {
      expect(katalog.Safety.digitalControlUrl).toBe('https://soppkontroll.no');
      expect(katalog.SafetyWarning.digitalCheck.length).toBeGreaterThan(0);
    }
  });

  it('etikettene kommer ordrett gjennom next-intl og nevner tjenesten', () => {
    for (const [locale, katalog] of [
      ['nb', nb],
      ['sv', sv]
    ] as const) {
      const t = createTranslator({ locale, messages: katalog as never, namespace: 'SafetyWarning' });
      expect(t('digitalCheck')).toContain('Digital soppkontroll');
    }
  });
});
