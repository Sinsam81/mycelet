import Link from 'next/link';
import { Bell } from 'lucide-react';

/**
 * Broen fra den delbare siden til soppvarselet: besøk → abonnent er hele
 * grunnen til at siden er en kanal og ikke bare en plakat.
 *
 * Løftet her MÅ matche det varselet faktisk gjør (se src/lib/alerts/decision.ts):
 * e-post når forholdene SNUR, aldri oftere enn én gang i uka. Ikke skriv om til
 * «daglige oppdateringer» eller noe annet varselet ikke holder.
 *
 * Språket følger landet siden gjelder (svensk side → svensk knapp). Selve
 * varselet er allerede tospråklig hele veien: profilkortet, e-posten og
 * avmeldingen finnes på svensk.
 */

const COPY = {
  NO: {
    heading: (navn?: string) => `Få beskjed når det snur${navn ? ` i ${navn}` : ''}`,
    brodtekst: (navn?: string, innlogget?: boolean) =>
      `Soppvarselet sender én e-post når forholdene${navn ? ` i ${navn}` : ' i området ditt'} krysser terskelen etter en reell bedring — og tier resten av tiden. Aldri oftere enn én gang i uka. ${innlogget ? 'Gratis.' : 'Gratis, ingen konto nødvendig.'}`,
    knapp: (innlogget?: boolean) => (innlogget ? 'Slå på soppvarsel' : 'Få soppvarsel')
  },
  SE: {
    heading: (navn?: string) => `Få besked när det vänder${navn ? ` i ${navn}` : ''}`,
    brodtekst: (navn?: string, innlogget?: boolean) =>
      `Svampvarningen skickar ett mejl när läget${navn ? ` i ${navn}` : ' i ditt område'} korsar tröskeln efter en verklig förbättring, och är tyst resten av tiden. Aldrig oftare än en gång i veckan. ${innlogget ? 'Gratis.' : 'Gratis, inget konto behövs.'}`,
    knapp: (innlogget?: boolean) => (innlogget ? 'Slå på svampvarning' : 'Få svampvarning')
  }
} as const;

export function VarselCta({
  regionNavn,
  land = 'NO',
  /**
   * true når leseren allerede er innlogget (forsiden): da går knappen til
   * profilkortet. Uinnlogget — de offentlige, delbare sidene — går til den
   * kontoløse påmeldingen på /soppvarsel med området forhåndsvalgt.
   *
   * Det sto «Gratis, med en konto» og lenket til /profile for alle. For en ny
   * leser var det innlogging → registrering → e-postbekreftelse → innlogging →
   * profil: fem steg mot ett skjema, på nettopp sidene presse og deling skal
   * sende folk til. Den kontoløse påmeldingen (#214) ble aldri koblet hit.
   */
  innlogget = false
}: {
  regionNavn?: string;
  land?: 'NO' | 'SE';
  innlogget?: boolean;
}) {
  const t = COPY[land];
  return (
    <section className="rounded-xl border border-forest-700 bg-forest-800 p-4 text-white">
      <h2 className="flex items-center gap-2 font-serif text-lg font-semibold">
        <Bell className="h-5 w-5" aria-hidden="true" />
        {t.heading(regionNavn)}
      </h2>
      <p className="mt-1 text-sm text-forest-50">{t.brodtekst(regionNavn, innlogget)}</p>
      <div className="mt-3">
        {/* Innlogget: søkeparameter, ikke #fragment — SoppvarselCard ruller seg
            selv inn i syne når ?vis=soppvarsel er satt. Uinnlogget: rett til
            det kontoløse skjemaet, med området ferdig valgt. */}
        <Link
          href={
            innlogget
              ? '/profile?vis=soppvarsel'
              : `/soppvarsel${regionNavn ? `?region=${encodeURIComponent(regionNavn)}` : ''}`
          }
          className="inline-block rounded-xl bg-white px-4 py-2 text-sm font-semibold text-forest-900 hover:bg-forest-50"
        >
          {t.knapp(innlogget)}
        </Link>
      </div>
    </section>
  );
}
