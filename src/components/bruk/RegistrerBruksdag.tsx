"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { bruksdagNokkel, osloDag, type Flate } from "@/lib/bruk/bruksdag";

/**
 * Usynlig: melder «denne brukeren så soppforholdene i dag» til
 * /api/me/bruksdag (migrasjon 064). Monteres der prognosen faktisk vises —
 * forsidekortet, kartet og områdesidene.
 *
 * Hvorfor en klientkomponent og ikke en skriving i API-rutene: forsidekortet
 * og områdesidene henter prognosen anonymt (ingen bruker i ruta), kartet går
 * gjennom /api/prediction som også svarer utloggede. Én liten komponent gir
 * én kodesti for alle tre, uten å røre de varme rutene.
 *
 * Sjekker sesjonen LOKALT først (ingen nettverkskall) — utloggede besøkende
 * på de offentlige områdesidene skal ikke sende noe som helst. sessionStorage
 * hindrer ett kall per navigasjon; serveren dedupliserer uansett.
 *
 * Automatiserte nettlesere (navigator.webdriver, som Playwright setter) teller
 * ikke: QA-løpet logger inn som en ekte bruker mot den ENE databasen vi har,
 * og ville ellers stått som «kom tilbake» i rapporten hver gang det kjørte.
 */
export function RegistrerBruksdag({
  flate,
  omrade = "",
}: {
  flate: Flate;
  omrade?: string;
}) {
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.webdriver) return;
    let avbrutt = false;
    const nokkel = bruksdagNokkel(flate, omrade, osloDag(new Date()));
    try {
      if (sessionStorage.getItem(nokkel)) return;
    } catch {
      // Privat modus o.l. — da sender vi bare; serveren tåler duplikater.
    }
    const supabase = createClient();
    supabase.auth
      .getSession()
      .catch(() => ({ data: { session: null } }))
      .then(({ data }) => {
        if (avbrutt || !data.session) return;
        fetch("/api/me/bruksdag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flate, omrade }),
          keepalive: true,
        })
          .then(() => {
            try {
              sessionStorage.setItem(nokkel, "1");
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
