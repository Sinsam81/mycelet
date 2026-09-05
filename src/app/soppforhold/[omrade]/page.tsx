import { Suspense } from 'react';
import { ORGANISASJON } from '@/lib/seo/organisasjon';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, MapPin } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { SoppforholdForbehold } from '@/components/soppforhold/Forbehold';
import { UkeStripe } from '@/components/soppforhold/UkeStripe';
import { VarselCta } from '@/components/soppforhold/VarselCta';
import { PameldtBanner } from '@/components/soppforhold/PameldtBanner';
import { DelOmrade } from '@/components/soppforhold/DelOmrade';
import { alleRegionSlugs, regionFromSlug } from '@/lib/prediction/region-slug';
import { computeRegionWeek, type RegionWeek } from '@/lib/prediction/region-week';
import { fetchWeatherSummary } from '@/lib/weather';
import { fetchDailyForecast } from '@/lib/weather/forecast';
import {
  SOPPFORHOLD_BASE,
  datoTekst,
  farge,
  hentRegioner,
  type SoppforholdRegion
} from '../hent-regioner';

/**
 * «Soppforhold i {område} i dag» / «Svampläget i {område} idag» — én delbar
 * side per region.
 *
 * Samlesiden (/soppforhold) svarer på «hvor i landet er det best?». Disse
 * svarer på det folk faktisk googler og deler i lokale grupper: «soppforhold
 * Oslo», «svampläget Göteborg». En lokal lenke er delbar i en lokal tråd på en
 * måte en rikstabell aldri blir — og foreningsmailene kan lenke rett til
 * mottakerens eget område.
 *
 * SPRÅKET FØLGER LANDET, ikke den besøkende: en side om Göteborg er svensk,
 * med svenske dommer, svenske artsnavn (?locale=sv mot regions-API-et, egen
 * cache-oppføring) og svensk giftnummer i Forbehold. Det var funnet som holdt
 * de svenske sidene tilbake i første runde.
 *
 * Samme regler som samlesiden ellers: offentlig, serverrendret, og ærlig om
 * hva tallet ikke er (delt komponent — se Forbehold.tsx).
 */

export const revalidate = 3600;

const COPY = {
  NO: {
    metaTittel: (navn: string) => `Soppforhold i ${navn} i dag — oppdatert daglig`,
    metaBeskrivelse: (navn: string) =>
      `Er det sopp i skogen rundt ${navn} nå? Daglig oppdatert vurdering regnet ut fra nedbør, jordfuktighet, temperatur og sesong.`,
    ogTittel: (navn: string) => `Soppforhold i ${navn} i dag`,
    oppdatert: (dato: string) => `Oppdatert ${dato}`,
    oppdateresDaglig: 'Oppdateres daglig',
    h1: (navn: string) => `Soppforhold i ${navn} i dag`,
    land: 'Norge',
    avHundre: 'av 100',
    artslinje: (art: string) => (
      <>
        Av artene i basen er det særlig <strong>{art}</strong> som er i sesong her nå.
      </>
    ),
    plassering: (nr: number, av: number) => `Nummer ${nr} av ${av} områder i Norge i dag.`,
    heleOversikten: 'Se hele oversikten',
    oversiktenLenke: 'hele oversikten',
    ikkeKlar: 'Beregningen for i dag er ikke klar ennå. Prøv igjen om en liten stund — eller se',
    kartHeading: 'Vil du se det på kart?',
    kartBrodtekst:
      'Tallet over gjelder hele området. I appen regner vi det samme for stedet du faktisk står, viser 428 000 registrerte funn på kart, og forteller hvilke arter som er i sesong akkurat nå.',
    provGratis: 'Prøv gratis',
    alleOmradene: 'Alle områdene',
    kilder:
      'Datagrunnlag: MET Norway og SMHI (vær), NIBIO og CORINE (skog), GBIF og Artsdatabanken (funn). Se',
    kilderLenke: 'datakilder',
    kilderHale: 'for lisenser og detaljer.'
  },
  SE: {
    metaTittel: (navn: string) => `Svampläget i ${navn} idag — uppdateras varje dag`,
    metaBeskrivelse: (navn: string) =>
      `Är det svamp i skogen kring ${navn} nu? Daglig bedömning beräknad från nederbörd, markfuktighet, temperatur och säsong.`,
    ogTittel: (navn: string) => `Svampläget i ${navn} idag`,
    oppdatert: (dato: string) => `Uppdaterad ${dato}`,
    oppdateresDaglig: 'Uppdateras varje dag',
    h1: (navn: string) => `Svampläget i ${navn} idag`,
    land: 'Sverige',
    avHundre: 'av 100',
    artslinje: (art: string) => (
      <>
        Av arterna i basen är det särskilt <strong>{art}</strong> som är i säsong här nu.
      </>
    ),
    plassering: (nr: number, av: number) => `Nummer ${nr} av ${av} områden i Sverige idag.`,
    heleOversikten: 'Se hela översikten',
    oversiktenLenke: 'hela översikten',
    ikkeKlar: 'Dagens beräkning är inte klar ännu. Försök igen om en liten stund, eller se',
    kartHeading: 'Vill du se det på karta?',
    kartBrodtekst:
      'Talet ovan gäller hela området. I appen beräknar vi samma sak för platsen där du faktiskt står, visar 428 000 registrerade fynd på karta, och berättar vilka arter som är i säsong just nu.',
    provGratis: 'Prova gratis',
    alleOmradene: 'Alla områden',
    kilder:
      'Dataunderlag: MET Norway och SMHI (väder), NIBIO och CORINE (skog), GBIF och Artdatabanken (fynd). Se',
    kilderLenke: 'datakällor',
    kilderHale: 'för licenser och detaljer.'
  }
} as const;

export function generateStaticParams() {
  return alleRegionSlugs().map((omrade) => ({ omrade }));
}

interface SideProps {
  params: Promise<{ omrade: string }>;
}

export async function generateMetadata({ params }: SideProps): Promise<Metadata> {
  const { omrade } = await params;
  const region = regionFromSlug(omrade);
  if (!region) return {};

  const t = COPY[region.country];
  const url = `${SOPPFORHOLD_BASE}/soppforhold/${omrade}`;

  // Delingsbildet versjoneres med rasterdatoen. Siden og bildet er to
  // uavhengige cache-oppføringer, så uten dette kunne en deling vist gårsdagens
  // (eller eldre) tall ved siden av dagens side. Ny dato → ny bilde-URL → både
  // vår cache og Facebooks/Slacks skraper henter ferskt bilde for dagens side.
  const { tileDate } = await hentRegioner(region.country === 'SE' ? 'sv' : 'nb');
  const ogBilde = `${url}/opengraph-image${tileDate ? `?d=${tileDate}` : ''}`;

  return {
    // NB: rot-layouten har template '%s — Mycelet'. Ikke skriv merkenavnet her.
    title: t.metaTittel(region.name),
    description: t.metaBeskrivelse(region.name),
    alternates: { canonical: url },
    openGraph: {
      title: t.ogTittel(region.name),
      description: t.metaBeskrivelse(region.name),
      url,
      type: 'website',
      images: [{ url: ogBilde, width: 1200, height: 630 }]
    }
  };
}

/**
 * Taket for hvor lenge vi venter på ukestripen.
 *
 * Stripen STRØMMES (se UkeStripeSeksjon under), så denne fristen koster ikke
 * sidens ladetid — den er bare en garanti for at forespørselen tar slutt.
 * Derfor er den romslig nok til å dekke leverandørenes egne timeouts (Frost
 * 8 s er den tregeste), i motsetning til den første, knappe versjonen: den
 * kuttet stripen på hvert kaldt besøk til de norske sidene, fordi Frost brukte
 * lengre tid enn budsjettet. Første besøkende — og Googlebot — fikk da en side
 * uten stripe.
 */
const UKE_BUDSJETT_MS = 9000;

/** Løftet får en frist: går den ut, faller vi tilbake til null (ingen stripe). */
async function medTidsbudsjett<T>(oppgave: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      // En avvist henting skal aldri velte siden — stripen er valgfri.
      oppgave.catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      })
    ]);
  } finally {
    // Uten dette holder timeren serverless-funksjonen i live til den fyrer.
    if (timer) clearTimeout(timer);
  }
}

/**
 * Ukestripen som egen strømmet enhet.
 *
 * Resten av siden — tallet, dommen, forbeholdet — sendes med én gang, og
 * stripen skyves inn i samme svar når værdataene er hentet. Den ligger altså
 * fortsatt i HTML-en (søkemotorer og delingsforhåndsvisninger ser den), men
 * uten å holde igjen noe annet på siden.
 *
 * Værhentingen skjer i regionens sentrum — samme punkt som den nattlige
 * rastergenereringen bruker.
 *
 * ⚠️ SIDEN RENDRES DYNAMISK (språkcookien i rot-layouten gjør hele treet
 * dynamisk), så `export const revalidate` binder ikke disse kallene. Cachen
 * ligger i datalaget: 900 s på fetch-nivå i både væradapterne og forecast.ts.
 */
async function UkeStripeSeksjon({
  regionDef,
  land
}: {
  regionDef: NonNullable<ReturnType<typeof regionFromSlug>>;
  land: 'NO' | 'SE';
}) {
  const sentrum = {
    lat: (regionDef.minLat + regionDef.maxLat) / 2,
    lon: (regionDef.minLng + regionDef.maxLng) / 2
  };
  const uke = await medTidsbudsjett(
    (async (): Promise<RegionWeek | null> => {
      const [observed, forecast] = await Promise.all([
        fetchWeatherSummary(sentrum),
        fetchDailyForecast(sentrum)
      ]);
      if (!observed) return null;
      return computeRegionWeek(observed, forecast, { land, now: new Date() });
    })(),
    UKE_BUDSJETT_MS
  );
  return <UkeStripe uke={uke} />;
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
  if (!regionDef) notFound();

  const land = regionDef.country;
  const t = COPY[land];

  // Bare regiontallene ventes på her. Ukestripen strømmes (UkeStripeSeksjon).
  const { tileDate, regions } = await hentRegioner(land === 'SE' ? 'sv' : 'nb');
  const region = regions.find((r) => r.name === regionDef.name) ?? null;

  // Strukturerte data: dateModified = rasterdatoen gjør ferskheten maskin-
  // lesbar for søkemotorer og AI-crawlere — «i dag»-påstanden får en dato.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t.h1(regionDef.name),
    description: t.metaBeskrivelse(regionDef.name),
    inLanguage: land === 'SE' ? 'sv' : 'nb',
    ...(tileDate ? { dateModified: tileDate } : {}),
    isPartOf: { '@type': 'WebSite', name: 'Mycelet', url: 'https://www.mycelet.com' },
    publisher: ORGANISASJON
  };

  return (
    <PageWrapper>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="space-y-8 py-6">
        <header className="space-y-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-forest-700">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {tileDate ? t.oppdatert(datoTekst(tileDate, land)) : t.oppdateresDaglig}
          </p>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-forest-900 sm:text-4xl">
            {t.h1(regionDef.name)}
          </h1>
          <div>
            <DelOmrade navn={regionDef.name} land={land} />
          </div>
        </header>

        {/* Kvittering etter bekreftet varselpåmelding (?status=bekreftet fra
            /api/soppvarsel/bekreft). Klientkomponent, så siden forblir cachet. */}
        <PameldtBanner navn={regionDef.name} land={land} />

        {region ? (
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-1.5 font-medium text-forest-900">
                <MapPin className="h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
                {region.name}, {t.land}
              </span>
              <span className="text-sm tabular-nums text-gray-600">
                <strong className="text-3xl text-forest-900">{region.score}</strong> {t.avHundre}
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full ${farge(region.score)}`} style={{ width: `${region.score}%` }} />
            </div>
            {region.verdict ? <p className="mt-3 text-gray-700">{region.verdict}</p> : null}
            {region.leadingSpecies ? (
              <p className="mt-1 text-sm text-gray-700">{t.artslinje(region.leadingSpecies.toLowerCase())}</p>
            ) : null}
            {(() => {
              const { nr, av } = plassering(region, regions);
              return (
                <p className="mt-3 text-sm text-gray-500">
                  {t.plassering(nr, av)}{' '}
                  <Link href="/soppforhold" className="underline">
                    {t.heleOversikten}
                  </Link>
                  .
                </p>
              );
            })()}
          </section>
        ) : (
          <p className="text-lg text-gray-700">
            {t.ikkeKlar}{' '}
            <Link href="/soppforhold" className="underline">
              {t.oversiktenLenke}
            </Link>
            .
          </p>
        )}

        {/* Strømmes: resten av siden vises straks, stripen skyves inn i samme
            svar når været er hentet. Ingen skjelett-plassholder — en stripe
            som uteblir skal ikke etterlate et hull. */}
        <Suspense fallback={null}>
          <UkeStripeSeksjon regionDef={regionDef} land={land} />
        </Suspense>

        <VarselCta regionNavn={regionDef.name} land={land} />

        <SoppforholdForbehold land={land} />

        <section className="rounded-xl border border-forest-700 bg-white p-4">
          <h2 className="font-serif text-lg font-semibold text-forest-900">{t.kartHeading}</h2>
          <p className="mt-1 text-sm text-gray-700">{t.kartBrodtekst}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/auth/register"
              className="rounded-xl bg-forest-800 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-700"
            >
              {t.provGratis}
            </Link>
            <Link
              href="/soppforhold"
              className="inline-flex items-center gap-1.5 rounded-xl border border-forest-700 px-4 py-2 text-sm font-semibold text-forest-800 hover:bg-forest-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t.alleOmradene}
            </Link>
          </div>
        </section>

        <p className="text-xs text-gray-500">
          {t.kilder}{' '}
          <Link href="/datakilder" className="underline">
            {t.kilderLenke}
          </Link>{' '}
          {t.kilderHale}
        </p>
      </article>
    </PageWrapper>
  );
}
