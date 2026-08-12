import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, MapPin, CalendarDays } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { SoppforholdForbehold } from '@/components/soppforhold/Forbehold';
import { VarselCta } from '@/components/soppforhold/VarselCta';
import { regionSlug } from '@/lib/prediction/region-slug';
import { farge, hentRegioner, norskDato } from './hent-regioner';

/**
 * «Soppforhold i Norge i dag» — den delbare siden.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVORFOR DENNE SIDEN FINNES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mycelet regner ut soppforholdene for 22 regioner hver eneste dag, og har
 * gjort det hele tiden — men bare bak innlogging. Samtidig skriver NSNFs egen
 * 2026-sesongside om tørken UTEN å gi én prognose, og ingen i Norge svarer på
 * spørsmålet folk faktisk stiller i august: «er det vits i å dra ut i helga?»
 *
 * Sindre kan ikke drive markedsføring i eget navn og vil være anonym. Da faller
 * den billigste kanalen bort — å være en hjelpsom person i soppgrupper over
 * tid. Det som er igjen, er å lage noe så nyttig at ANDRE deler det for deg.
 * Denne siden er den ene lenka noen kan lime inn i en gruppetråd uten at det
 * ser ut som reklame.
 *
 * Derfor er den:
 *  · offentlig — ingen innlogging, ingen betalingsmur, ingen registrering
 *  · serverrendret — tallene står i HTML-en, så de vises uten JavaScript og kan
 *    leses av søkemotorer og av delingsforhåndsvisninger
 *  · ærlig om hva tallet IKKE er (se ÆRLIGHET under)
 *
 * ⚠️ ÆRLIGHET ER HELE POENGET. Tallet er vær + sesong for et OMRÅDE. Det sier
 * ingenting om skogen der du står, og enda mindre om at noe er trygt å spise.
 * Konkurrentene selger kart som «her finner du sopp». Vår posisjon er den
 * motsatte, og den tåler at noen har flere brukere enn oss — men bare så lenge
 * vi faktisk holder oss til den. Ikke skriv om teksten til noe som lover mer.
 */

const BASE = 'https://www.mycelet.com';
/** Ny beregning kommer daglig; en time er rikelig og sparer oppslag. */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  // Delingsbildet versjoneres med rasterdatoen, ellers kan en deling vise
  // gårsdagens tall ved siden av dagens side — se hent-regioner.ts.
  const { tileDate } = await hentRegioner();
  const ogBilde = `${BASE}/soppforhold/opengraph-image${tileDate ? `?d=${tileDate}` : ''}`;

  return {
    // NB: rot-layouten har template '%s — Mycelet'. Skriv ALDRI merkenavnet her
    // også — da blir tittelen «… | Mycelet — Mycelet» i søketreff og delinger.
    title: 'Soppforhold i Norge i dag — oppdatert daglig',
    description:
      'Er det sopp i skogen nå? Daglig oversikt over soppforholdene i 22 norske og svenske områder, regnet ut fra nedbør, jordfuktighet, temperatur og sesong.',
    alternates: { canonical: `${BASE}/soppforhold` },
    openGraph: {
      title: 'Soppforhold i Norge i dag',
      description: 'Daglig oversikt over hvor forholdene ligger best an akkurat nå.',
      url: `${BASE}/soppforhold`,
      type: 'website',
      images: [{ url: ogBilde, width: 1200, height: 630 }]
    }
  };
}

export default async function SoppforholdPage() {
  const { tileDate, regions } = await hentRegioner();
  const norske = regions.filter((r) => r.country === 'NO');
  const svenske = regions.filter((r) => r.country === 'SE');
  const beste = norske[0] ?? null;

  return (
    <PageWrapper>
      <article className="space-y-8 py-6">
        <header className="space-y-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-forest-700">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {tileDate ? `Oppdatert ${norskDato(tileDate)}` : 'Oppdateres daglig'}
          </p>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-forest-900 sm:text-4xl">
            Soppforhold i Norge i dag
          </h1>
          {beste ? (
            <p className="text-lg text-gray-700">
              Forholdene ligger best an rundt <strong>{beste.name}</strong> akkurat nå
              {beste.leadingSpecies ? <> — der er det særlig {beste.leadingSpecies.toLowerCase()} som er i sesong</> : null}.
              Under ser du hvordan det står til i {regions.length} områder.
            </p>
          ) : (
            <p className="text-lg text-gray-700">
              Beregningen for i dag er ikke klar ennå. Prøv igjen om en liten stund.
            </p>
          )}
        </header>

        {norske.length > 0 ? (
          <section className="space-y-3">
            <h2 className="font-serif text-xl font-semibold text-forest-900">Norge</h2>
            <ul className="space-y-2">
              {norske.map((r) => (
                <li key={r.name}>
                  {/* Hele kortet er lenken: områdesiden er den delbare enheten. */}
                  <Link
                    href={`/soppforhold/${regionSlug(r.name)}`}
                    className="block rounded-xl border border-gray-200 bg-white p-3 transition-colors hover:border-forest-700"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex items-center gap-1.5 font-medium text-forest-900">
                        <MapPin className="h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
                        {r.name}
                      </span>
                      <span className="flex items-center gap-1 text-sm tabular-nums text-gray-600">
                        <strong className="text-base text-forest-900">{r.score}</strong> av 100
                        <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className={`h-full rounded-full ${farge(r.score)}`} style={{ width: `${r.score}%` }} />
                    </div>
                    {r.verdict ? <p className="mt-2 text-sm text-gray-700">{r.verdict}</p> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {svenske.length > 0 ? (
          <section className="space-y-3">
            <h2 className="font-serif text-xl font-semibold text-forest-900">Sverige</h2>
            <ul className="space-y-2">
              {/* Ikke lenket ennå — de svenske områdesidene publiseres først når
                  de kan gjøres på svensk, med svensk giftnummer (se
                  [omrade]/page.tsx). En norsk side med norsk nødnummer for
                  Göteborg er verre enn ingen side. */}
              {svenske.map((r) => (
                <li key={r.name} className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-1.5 font-medium text-forest-900">
                      <MapPin className="h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
                      {r.name}
                    </span>
                    <span className="text-sm tabular-nums text-gray-600">
                      <strong className="text-base text-forest-900">{r.score}</strong> av 100
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full rounded-full ${farge(r.score)}`} style={{ width: `${r.score}%` }} />
                  </div>
                  {r.verdict ? <p className="mt-2 text-sm text-gray-700">{r.verdict}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <VarselCta />

        <SoppforholdForbehold />

        <section className="rounded-xl border border-forest-700 bg-white p-4">
          <h2 className="font-serif text-lg font-semibold text-forest-900">Vil du ha det for ditt eget område?</h2>
          <p className="mt-1 text-sm text-gray-700">
            Tallene over er for 22 større områder. I appen regner vi det samme for stedet du faktisk står, viser
            428 000 registrerte funn på kart, og forteller hvilke arter som er i sesong akkurat nå.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/auth/register"
              className="rounded-xl bg-forest-800 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-700"
            >
              Prøv gratis
            </Link>
            <Link
              href="/sanketips/sopp-etter-regn"
              className="rounded-xl border border-forest-700 px-4 py-2 text-sm font-semibold text-forest-800 hover:bg-forest-50"
            >
              Hvorfor kommer soppen etter regn?
            </Link>
          </div>
        </section>

        <p className="text-xs text-gray-500">
          Datagrunnlag: MET Norway og SMHI (vær), NIBIO og CORINE (skog), GBIF og Artsdatabanken (funn). Se{' '}
          <Link href="/datakilder" className="underline">
            datakilder
          </Link>{' '}
          for lisenser og detaljer.
        </p>
      </article>
    </PageWrapper>
  );
}
