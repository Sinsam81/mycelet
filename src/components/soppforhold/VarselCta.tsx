import Link from 'next/link';
import { Bell } from 'lucide-react';

/**
 * Broen fra den delbare siden til soppvarselet: besøk → abonnent er hele
 * grunnen til at siden er en kanal og ikke bare en plakat.
 *
 * Løftet her MÅ matche det varselet faktisk gjør (se src/lib/alerts/decision.ts):
 * e-post når forholdene SNUR, aldri oftere enn én gang i uka. Ikke skriv om til
 * «daglige oppdateringer» eller noe annet varselet ikke holder.
 */
export function VarselCta({ regionNavn }: { regionNavn?: string }) {
  return (
    <section className="rounded-xl border border-forest-700 bg-forest-800 p-4 text-white">
      <h2 className="flex items-center gap-2 font-serif text-lg font-semibold">
        <Bell className="h-5 w-5" aria-hidden="true" />
        Få beskjed når det snur{regionNavn ? ` i ${regionNavn}` : ''}
      </h2>
      <p className="mt-1 text-sm text-forest-50">
        Soppvarselet sender én e-post når forholdene{regionNavn ? ` i ${regionNavn}` : ' i området ditt'} krysser
        terskelen etter en reell bedring — og tier resten av tiden. Aldri oftere enn én gang i uka. Gratis, med
        en konto.
      </p>
      <div className="mt-3">
        {/* Søkeparameter, ikke #fragment: fragmenter overlever ikke
            innloggings-omdirigeringen (de sendes aldri til serveren), og
            målgruppen her er nettopp uinnloggede. SoppvarselCard ruller seg
            selv inn i syne når ?vis=soppvarsel er satt. */}
        <Link
          href="/profile?vis=soppvarsel"
          className="inline-block rounded-xl bg-white px-4 py-2 text-sm font-semibold text-forest-900 hover:bg-forest-50"
        >
          Slå på soppvarsel
        </Link>
      </div>
    </section>
  );
}
