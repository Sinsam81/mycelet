'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { bruksdagNokkel, osloDag, type Flate } from '@/lib/bruk/bruksdag';

/**
 * Usynlig: melder «denne brukeren så soppforholdene i dag» til
 * /api/me/bruksdag (migrasjon 064). Monteres der prognosen faktisk vises —
 * forsidekortet, kartet og områdesidene.
 *
 * Hvorfor en klientkomponent og ikke en skriving i API-rutene: områdesidene
 * er statisk bufret (revalidate), forsiden og kartet er serverkomponenter, og
 * prognose-API-ene har ikke alltid en bruker. Én liten komponent gir én
 * kodesti for alle tre, uten å røre de varme rutene.
 *
 * Sjekker sesjonen LOKALT først (ingen nettverkskall) — utloggede besøkende
 * på de offentlige områdesidene skal ikke sende noe som helst. sessionStorage
 * hindrer ett kall per navigasjon; serveren dedupliserer uansett.
 */
export function RegistrerBruksdag({ flate, omrade = '' }: { flate: Flate; omrade?: string }) {
  useEffect(() => {
    let avbrutt = false;
    const nokkel = bruksdagNokkel(flate, omrade, osloDag(new Date()));
    try {
      if (sessionStorage.getItem(nokkel)) return;
    } catch {
      // Privat modus o.l. — da sender vi bare; serveren tåler duplikater.
    }
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (avbrutt || !data.session) return;
      fetch('/api/me/bruksdag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flate, omrade }),
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
  }, [flate, omrade]);

  return null;
}
