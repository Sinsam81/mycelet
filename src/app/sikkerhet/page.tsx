import Link from 'next/link';
import { AlertTriangle, BookOpen, Phone, Shield } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';

export const metadata = {
  title: 'Sikkerhet og ansvar — SoppJakt',
  description: 'Slik bruker du SoppJakt trygt. Kontaktinfo til Soppkontrollen og Giftinformasjonen ved behov.'
};

export default function SikkerhetPage() {
  return (
    <PageWrapper>
      <section className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Sikkerhet og ansvar</h1>
          <p className="text-sm text-gray-700">Hvordan du bruker SoppJakt trygt.</p>
        </div>

        <article className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <Phone className="h-6 w-6 shrink-0 text-red-700" />
            <div className="space-y-1">
              <p className="text-base font-bold text-red-900">Akutt: mistanke om soppforgiftning</p>
              <p className="text-sm text-red-900">
                Ring{' '}
                <a href="tel:+4722591300" className="font-bold underline">
                  Giftinformasjonen 22 59 13 00
                </a>{' '}
                — døgnåpent.
              </p>
              <p className="text-sm text-red-900">
                Ring{' '}
                <a href="tel:113" className="font-bold underline">
                  113
                </a>{' '}
                ved bevisstløshet, kramper eller alvorlige symptomer.
              </p>
              <p className="pt-1 text-xs text-red-900">
                Ta vare på rester av soppen, oppkast og emballasje — det hjelper helsepersonell å identifisere giften.
              </p>
            </div>
          </div>
        </article>

        <article className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-forest-800" />
            <h2 className="font-semibold">Tre regler vi følger</h2>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-800">
            <li>
              <span className="font-medium">Ved tvil — la stå.</span> Det er aldri verdt risikoen. Hvis en sopp ligner
              både en spiselig og en giftig art, er det en sopp du går forbi.
            </li>
            <li>
              <span className="font-medium">AI er hjelpemiddel, ikke fasit.</span> Ingen bildemodell er treffsikker nok
              til å erstatte trent øye, smak og lukt. Bruk SoppJakt som start for læring, ikke som siste ord.
            </li>
            <li>
              <span className="font-medium">Soppkontrollen er gull verdt.</span> Erfarne mykologer i regionen din
              tilbyr gratis kontroll i sesong. Hvis du er usikker — bring soppen dit.
            </li>
          </ol>
        </article>

        <article className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-forest-800" />
            <h2 className="font-semibold">Soppkontroll i Norge</h2>
          </div>
          <p className="text-sm text-gray-800">
            Norges sopp- og nyttevekstforbund driver soppkontroll over hele landet i sesong. Listen oppdateres årlig
            med dato og sted for kontroll i din region.
          </p>
          <a
            href="https://soppognyttevekster.no/soppkontroll/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-forest-800 px-3 py-2 text-sm font-medium text-white hover:bg-forest-700"
          >
            Finn soppkontroll i din region →
          </a>
        </article>

        <article className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-700" />
            <h2 className="font-semibold">Vanlige norske farer</h2>
          </div>
          <ul className="space-y-2 text-sm text-gray-800">
            <li>
              <span className="font-semibold">Spiss giftslørsopp</span> forveksles med traktkantarell — har drept
              norske plukkere flere ganger. Symptomer på nyresvikt kan komme 2-3 uker etter inntak.
            </li>
            <li>
              <span className="font-semibold">Hvit fluesopp</span> forveksles med sjampinjong — inneholder amatoksin
              som gir akutt leversvikt 6-24 timer etter måltidet.
            </li>
            <li>
              <span className="font-semibold">Karbol-sjampinjong</span> ser ut som vanlig sjampinjong — gulner i
              kuttsåret og lukter karbol/blekk. Forårsaker kraftig kvalme og oppkast.
            </li>
            <li>
              <span className="font-semibold">Pluggsopp</span> ble lenge ansett som spiselig — vi vet nå at den kan
              utløse fatal immunreaksjon ved gjentatt inntak.
            </li>
          </ul>
          <Link href="/species" className="text-sm font-medium text-forest-800 hover:underline">
            Se alle registrerte arter →
          </Link>
        </article>

        <article className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Vår begrensning</h2>
          <p className="text-sm text-gray-800">
            SoppJakt er et hjelpemiddel for å lære og dele — ikke en autorisert kilde for matsopp-identifisering.
            Vi tar ikke ansvar for skade som følge av feilidentifisering. Bruk sunn fornuft, kryss-sjekk mot flere
            kilder, og bring tvilstilfeller til soppkontroll før du spiser.
          </p>
        </article>
      </section>
    </PageWrapper>
  );
}
