import Link from 'next/link';
import { Bell } from 'lucide-react';
import { regionSlug } from '@/lib/prediction/region-slug';
import { COPY as PAMELDINGSTEKST } from '@/app/soppvarsel/tekst';

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
 *
 * ── SKJEMAET STÅR HER, IKKE ETT SIDEHOPP UNNA ───────────────────────────────
 *
 * På en områdeside er området alt kjent, og påmeldingen er en ren skjema-POST
 * med ett felt igjen å fylle ut. Likevel var boksen bare en lenke til
 * /soppvarsel, der leseren måtte lese en ny side og finne skjemaet — på
 * nettopp sidene presse, deling og søk sender folk til. Nå står e-postfeltet i
 * boksen: fortsatt serverkomponent, null klient-JS, og svaret kommer tilbake
 * hit (retur=<slug> → /soppforhold/<slug>?status=…#varsel, se påmeldingsruta).
 *
 * Adressen er persondata og flyten er dobbel opt-in, så samtykkesetningen og
 * lenka til personvernerklæringen følger med skjemaet. Ordlyden LESES fra
 * /soppvarsel sin teksttabell (src/app/soppvarsel/tekst.ts) i stedet for å stå
 * skrevet her også — det er ett samtykke, og to kopier ville glidd fra
 * hverandre.
 */

const COPY = {
  NO: {
    heading: (navn?: string) => `Få beskjed når det snur${navn ? ` i ${navn}` : ''}`,
    brodtekst: (navn?: string, innlogget?: boolean) =>
      `Soppvarselet sender én e-post når forholdene${navn ? ` i ${navn}` : ' i området ditt'} krysser terskelen etter en reell bedring — og tier resten av tiden. Aldri oftere enn én gang i uka. ${innlogget ? 'Gratis.' : 'Gratis, ingen konto nødvendig.'}`,
    knapp: (innlogget?: boolean) => (innlogget ? 'Slå på soppvarsel' : 'Få soppvarsel'),
    slikVirker: 'Slik virker varselet'
  },
  SE: {
    heading: (navn?: string) => `Få besked när det vänder${navn ? ` i ${navn}` : ''}`,
    brodtekst: (navn?: string, innlogget?: boolean) =>
      `Svampvarningen skickar ett mejl när läget${navn ? ` i ${navn}` : ' i ditt område'} korsar tröskeln efter en verklig förbättring, och är tyst resten av tiden. Aldrig oftare än en gång i veckan. ${innlogget ? 'Gratis.' : 'Gratis, inget konto behövs.'}`,
    knapp: (innlogget?: boolean) => (innlogget ? 'Slå på svampvarning' : 'Få svampvarning'),
    slikVirker: 'Så fungerar varningen'
  }
} as const;

export function VarselCta({
  regionNavn,
  land = 'NO',
  /**
   * true når leseren allerede er innlogget (forsiden): da går knappen til
   * profilkortet. Uinnlogget — de offentlige, delbare sidene — er det den
   * kontoløse påmeldingen: skjemaet rett i boksen når området er kjent, ellers
   * en lenke til /soppvarsel.
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
  const sprak = land === 'SE' ? 'sv' : 'nb';
  const skjema = PAMELDINGSTEKST[sprak];
  return (
    <section className="rounded-xl border border-forest-700 bg-forest-800 p-4 text-white">
      <h2 className="flex items-center gap-2 font-serif text-lg font-semibold">
        <Bell className="h-5 w-5" aria-hidden="true" />
        {t.heading(regionNavn)}
      </h2>
      <p className="mt-1 text-sm text-forest-50">{t.brodtekst(regionNavn, innlogget)}</p>
      {!innlogget && regionNavn ? (
        // Samme rute og samme felt som skjemaet på /soppvarsel. Området og
        // språket er gitt av siden; `retur` ber ruta sende svaret tilbake hit.
        // Ruta godtar bare `retur` når den er slugen til nettopp dette området.
        <form method="post" action="/api/soppvarsel/pamelding" className="mt-3">
          <input type="hidden" name="region" value={regionNavn} />
          <input type="hidden" name="locale" value={sprak} />
          <input type="hidden" name="retur" value={regionSlug(regionNavn)} />
          <label className="block text-sm font-medium">
            {skjema.epost}
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-forest-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
              placeholder="deg@example.com"
            />
          </label>
          <button
            type="submit"
            className="mt-3 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-forest-900 hover:bg-forest-50"
          >
            {t.knapp(false)}
          </button>
          <p className="mt-3 text-xs leading-relaxed text-forest-50">
            {skjema.samtykke}{' '}
            <Link href="/personvern" className="underline">
              {skjema.personvern}
            </Link>
            {' · '}
            {/* Den som vil lese først, lander med området ferdig valgt der også. */}
            <Link href={`/soppvarsel?region=${encodeURIComponent(regionNavn)}`} className="underline">
              {t.slikVirker}
            </Link>
          </p>
        </form>
      ) : (
        <div className="mt-3">
          {/* Innlogget: søkeparameter, ikke #fragment — SoppvarselCard ruller seg
              selv inn i syne når ?vis=soppvarsel er satt. Uinnlogget uten kjent
              område: til det kontoløse skjemaet, der området velges. */}
          <Link
            href={innlogget ? '/profile?vis=soppvarsel' : '/soppvarsel'}
            className="inline-block rounded-xl bg-white px-4 py-2 text-sm font-semibold text-forest-900 hover:bg-forest-50"
          >
            {t.knapp(innlogget)}
          </Link>
        </div>
      )}
    </section>
  );
}
