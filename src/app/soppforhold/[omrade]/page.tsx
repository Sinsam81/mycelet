import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, MapPin } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { SoppforholdForbehold } from '@/components/soppforhold/Forbehold';
import { VarselCta } from '@/components/soppforhold/VarselCta';
import { alleRegionSlugs, regionFromSlug } from '@/lib/prediction/region-slug';
import {
  SOPPFORHOLD_BASE,
  farge,
  hentRegioner,
  norskDato,
  type SoppforholdRegion
} from '../hent-regioner';

/**
 * «Soppforhold i {område} i dag» — én delbar side per region.
 *
 * Samlesiden (/soppforhold) svarer på «hvor i landet er det best?». Disse
 * svarer på det folk faktisk googler og deler i lokale grupper: «soppforhold
 * Oslo». En lokal lenke er delbar i en lokal tråd på en måte en rikstabell
 * aldri blir — og foreningsmailen kan lenke rett til mottakerens eget område.
 *
 * Samme regler som samlesiden: offentlig, serverrendret, og ærlig om hva
 * tallet ikke er (delt komponent — se Forbehold.tsx).
 */

export const revalidate = 3600;

/**
 * ⚠️ KUN NORSKE OMRÅDER FORELØPIG. De svenske sidene kan ikke publiseres som
 * norske sider med norsk giftnummer — Giftinformasjonen 22 59 13 00 er feil
 * land for en leser i Göteborg (samme feilklasse som H13 i lanserings-
 * revisjonen). De kommer i den svenske runden, med svensk tekst, svensk
 * Giftinformationscentralen og svenske vurderingslinjer. Ukjente og svenske
 * slugs gir 404 til da.
 */
export function generateStaticParams() {
  return alleRegionSlugs('NO').map((omrade) => ({ omrade }));
}

interface SideProps {
  params: Promise<{ omrade: string }>;
}

export async function generateMetadata({ params }: SideProps): Promise<Metadata> {
  const { omrade } = await params;
  const region = regionFromSlug(omrade);
  if (!region || region.country !== 'NO') return {};

  const beskrivelse = `Er det sopp i skogen rundt ${region.name} nå? Daglig oppdatert vurdering regnet ut fra nedbør, jordfuktighet, temperatur og sesong.`;
  const url = `${SOPPFORHOLD_BASE}/soppforhold/${omrade}`;

  // Delingsbildet versjoneres med rasterdatoen. Siden og bildet er to
  // uavhengige cache-oppføringer, så uten dette kunne en deling vist gårsdagens
  // (eller eldre) tall ved siden av dagens side. Ny dato → ny bilde-URL → både
  // vår cache og Facebooks/Slacks skraper henter ferskt bilde for dagens side.
  const { tileDate } = await hentRegioner();
  const ogBilde = `${url}/opengraph-image${tileDate ? `?d=${tileDate}` : ''}`;

  return {
    // NB: rot-layouten har template '%s — Mycelet'. Ikke skriv merkenavnet her.
    title: `Soppforhold i ${region.name} i dag — oppdatert daglig`,
    description: beskrivelse,
    alternates: { canonical: url },
    openGraph: {
      title: `Soppforhold i ${region.name} i dag`,
      description: beskrivelse,
      url,
      type: 'website',
      images: [{ url: ogBilde, width: 1200, height: 630 }]
    }
  };
}

/** Plassering blant landets regioner — «best i Norge i dag» er delbart i seg selv. */
function plassering(region: SoppforholdRegion, alle: SoppforholdRegion[]): { nr: number; av: number } {
  const iSammeLand = alle
    .filter((r) => r.country === region.country)
    .sort((a, b) => b.score - a.score);
  return { nr: iSammeLand.findIndex((r) => r.name === region.name) + 1, av: iSammeLand.length };
}

export default async function OmradePage({ params }: SideProps) {
  const { omrade } = await params;
  const regionDef = regionFromSlug(omrade);
  if (!regionDef || regionDef.country !== 'NO') notFound();

  const { tileDate, regions } = await hentRegioner();
  const region = regions.find((r) => r.name === regionDef.name) ?? null;
  const land = regionDef.country === 'NO' ? 'Norge' : 'Sverige';

  return (
    <PageWrapper>
      <article className="space-y-8 py-6">
        <header className="space-y-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-forest-700">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {tileDate ? `Oppdatert ${norskDato(tileDate)}` : 'Oppdateres daglig'}
          </p>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-forest-900 sm:text-4xl">
            Soppforhold i {regionDef.name} i dag
          </h1>
        </header>

        {region ? (
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-1.5 font-medium text-forest-900">
                <MapPin className="h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
                {region.name}, {land}
              </span>
              <span className="text-sm tabular-nums text-gray-600">
                <strong className="text-3xl text-forest-900">{region.score}</strong> av 100
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full ${farge(region.score)}`} style={{ width: `${region.score}%` }} />
            </div>
            {region.verdict ? <p className="mt-3 text-gray-700">{region.verdict}</p> : null}
            {region.leadingSpecies ? (
              <p className="mt-1 text-sm text-gray-700">
                Av artene i basen er det særlig <strong>{region.leadingSpecies.toLowerCase()}</strong> som er i
                sesong her nå.
              </p>
            ) : null}
            {(() => {
              const { nr, av } = plassering(region, regions);
              return (
                <p className="mt-3 text-sm text-gray-500">
                  Nummer {nr} av {av} områder i {land} i dag.{' '}
                  <Link href="/soppforhold" className="underline">
                    Se hele oversikten
                  </Link>
                  .
                </p>
              );
            })()}
          </section>
        ) : (
          <p className="text-lg text-gray-700">
            Beregningen for i dag er ikke klar ennå. Prøv igjen om en liten stund — eller se{' '}
            <Link href="/soppforhold" className="underline">
              hele oversikten
            </Link>
            .
          </p>
        )}

        <VarselCta regionNavn={regionDef.name} />

        <SoppforholdForbehold />

        <section className="rounded-xl border border-forest-700 bg-white p-4">
          <h2 className="font-serif text-lg font-semibold text-forest-900">Vil du se det på kart?</h2>
          <p className="mt-1 text-sm text-gray-700">
            Tallet over gjelder hele området. I appen regner vi det samme for stedet du faktisk står, viser
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
              href="/soppforhold"
              className="inline-flex items-center gap-1.5 rounded-xl border border-forest-700 px-4 py-2 text-sm font-semibold text-forest-800 hover:bg-forest-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Alle områdene
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
