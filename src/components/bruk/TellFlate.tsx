'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { tellNokkel, type TellbarFlate } from '@/lib/bruk/tell';

/**
 * Usynlig: melder «denne skjermen ble åpnet» til /api/tell (migrasjon 070) —
 * anonymt, uten konto. Monteres BARE inne i det native skallet (pakk den i
 * <NativeOnly>), på første skjerm (/soppforhold) og registreringsskjemaet.
 *
 * Hvorfor bare i appen: nettsiden har alt GA4 for utloggede besøk, og
 * App Store-installasjonene er de vi ikke ser noe av før konto. Én telling
 * per flate og økt (sessionStorage; kald start = ny økt), og serveren setter
 * dagen. Ingen ID sendes — bare flate og språk.
 *
 * Teller bare UTLOGGEDE: sesjonen sjekkes lokalt (ingen nettverkskall) som i
 * RegistrerBruksdag. En innlogget bruker som åpner /soppforhold har alt en
 * bruksdag, og rapportens rad heter «utlogget» — den skal være sann.
 *
 * Automatiserte nettlesere (navigator.webdriver) teller ikke, som for
 * bruksdagene: QA-løpet skal ikke stå som «første skjerm åpnet».
 */
export function TellFlate({ flate }: { flate: TellbarFlate }) {
  const locale = useLocale();

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;
    let avbrutt = false;
    const nokkel = tellNokkel(flate);
    try {
      if (sessionStorage.getItem(nokkel)) return;
    } catch {
      // Privat modus o.l. — da sender vi bare.
    }
    const supabase = createClient();
    supabase.auth
      .getSession()
      .catch(() => ({ data: { session: null } }))
      .then(({ data }) => {
        if (avbrutt || data.session) return;
        fetch('/api/tell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flate, sprak: locale }),
          keepalive: true
        })
          .then(() => {
            try {
              sessionStorage.setItem(nokkel, '1');
            } catch {
              // se over
            }
          })
          .catch(() => {
            // Målingen feiler stille. Den skal aldri vises for brukeren.
          });
      });
    return () => {
      avbrutt = true;
    };
  }, [flate, locale]);

  return null;
}
