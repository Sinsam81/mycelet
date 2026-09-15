import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ORGANISASJON } from '@/lib/seo/organisasjon';
import Link from 'next/link';
import { ChevronRight, MapPin, CalendarDays } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { SoppforholdForbehold } from '@/components/soppforhold/Forbehold';
import { NativeOnly } from '@/components/native/NativeOnly';
import { TellFlate } from '@/components/bruk/TellFlate';
import { getUserLocale } from '@/i18n/locale';
import { regionSlug } from '@/lib/prediction/region-slug';
import { farge, hentRegioner, lokalDato, regionerPerLand, type SoppforholdRegion } from './hent-regioner';

/**
 * «Soppforhold i Norge i dag» / «Svampläget i Sverige idag» — den delbare siden.
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
 * Distribusjonen skal skje ved at ANDRE deler siden, ikke ved at vi selv
 * markedsfører den i soppgrupper. Derfor er målet å lage noe så nyttig at
 * det deles videre: den ene lenka noen kan lime inn i en gruppetråd uten at
 * det ser ut som reklame.
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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SPRÅK: HER FØLGER DET LESEREN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Siden er også appens første skjerm for utloggede, og 17 av 22 åpninger
 * 15. sep 2026 var svenske økter — som fikk en helnorsk side med Norge først.
 * Nå avgjør getUserLocale() (cookie → Accept-Language → nb) teksten, dommene og
 * artsnavnene (hentRegioner(locale) → ?locale=sv mot API-et) og hvilket land
 * som står først. Crawlere uten cookie får nb, som før.
 *
 * Områdesidene gjør det motsatt — der følger språket LANDET (se
 * [omrade]/page.tsx) — fordi hver av dem handler om ett land, med landets eget
 * giftnummer. Samlesiden handler om begge, så leserens språk er det riktige
 * signalet, også for giftnummeret i forbeholdet.
 *
 * Cookien gjør ikke siden dynamisk: rot-layouten leser den allerede, så ruta
 * var ƒ også før. Selvhentingen er fortsatt cachet på fetch-nivå
 * (SOPPFORHOLD_REVALIDATE), med én oppføring per språk-URL.
 */

const BASE = 'https://www.mycelet.com';
/** Ny beregning kommer daglig; en time er rikelig og sparer oppslag. */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUserLocale();
  const t = await getTranslations({ locale, namespace: 'Soppforhold' });
  // Delingsbildet versjoneres med rasterdatoen, ellers kan en deling vise
  // gårsdagens tall ved siden av dagens side — se hent-regioner.ts. Samme
  // språk-URL som siden, så kallet deles med sidens eget i samme forespørsel.
  const { tileDate } = await hentRegioner(locale);
  const ogBilde = `${BASE}/soppforhold/opengraph-image${tileDate ? `?d=${tileDate}` : ''}`;

  return {
    // NB: rot-layouten har template '%s — Mycelet'. Skriv ALDRI merkenavnet her
    // også — da blir tittelen «… | Mycelet — Mycelet» i søketreff og delinger.
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: `${BASE}/soppforhold` },
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
      url: `${BASE}/soppforhold`,
      type: 'website',
      locale: locale === 'sv' ? 'sv_SE' : 'nb_NO',
      images: [{ url: ogBilde, width: 1200, height: 630 }]
    }
  };
}

/**
 * Ett områdekort. Hele kortet er lenken: områdesiden er den delbare enheten.
 *
 * Ingen egen «Nå: kantarell»-linje: dommen fra API-et navngir allerede arten
 * som drar toppen, i alle fire trinn («Nu är det blek taggsvamp 🍄», «Lite
 * piggsopp i skogen nå»), og på leserens språk via getSpeciesDisplayName i
 * /api/prediction/regions. En linje til ville bare gjentatt den.
 */
function RegionKort({ region, avHundre }: { region: SoppforholdRegion; avHundre: string }) {
  return (
    <li>
      <Link
        href={`/soppforhold/${regionSlug(region.name)}`}
        className="block rounded-xl border border-gray-200 bg-white p-3 transition-colors hover:border-forest-700"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-center gap-1.5 font-medium text-forest-900">
            <MapPin className="h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
            {region.name}
          </span>
          <span className="flex items-center gap-1 text-sm tabular-nums text-gray-600">
            <strong className="text-base text-forest-900">{region.score}</strong> {avHundre}
            <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full rounded-full ${farge(region.score)}`} style={{ width: `${region.score}%` }} />
        </div>
        {region.verdict ? <p className="mt-2 text-sm text-gray-700">{region.verdict}</p> : null}
      </Link>
    </li>
  );
}

export default async function SoppforholdPage() {
  const locale = await getUserLocale();
  const t = await getTranslations({ locale, namespace: 'Soppforhold' });
  const { tileDate, regions } = await hentRegioner(locale);
  const seksjoner = regionerPerLand(regions, locale);
  const egetLand = locale === 'sv' ? 'SE' : 'NO';
  // Innledningen peker på det beste området i leserens eget land. API-et
  // sorterer på score, så det første treffet er det beste.
  const beste = regions.find((r) => r.country === egetLand) ?? null;
  const fet = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t('heading'),
    description: t('jsonLdDescription'),
    inLanguage: locale,
    ...(tileDate ? { dateModified: tileDate } : {}),
    isPartOf: { '@type': 'WebSite', name: 'Mycelet', url: 'https://www.mycelet.com' },
    publisher: ORGANISASJON
  };

  return (
    <PageWrapper>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* Første skjerm i skallet: anonym telling (migrasjon 070), bare i appen. */}
      <NativeOnly>
        <TellFlate flate="soppforhold" />
      </NativeOnly>
      <article className="space-y-8 py-6">
        <header className="space-y-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-forest-700">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {tileDate ? t('updated', { date: lokalDato(tileDate, locale) }) : t('updatedDaily')}
          </p>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-forest-900 sm:text-4xl">
            {t('heading')}
          </h1>
          {beste ? (
            <p className="text-lg text-gray-700">
              {beste.leadingSpecies
                ? t.rich('leadWithSpecies', {
                    region: beste.name,
                    species: beste.leadingSpecies.toLowerCase(),
                    count: regions.length,
                    strong: fet
                  })
                : t.rich('lead', { region: beste.name, count: regions.length, strong: fet })}
            </p>
          ) : (
            <p className="text-lg text-gray-700">{t('notReady')}</p>
          )}
        </header>

        {/* Hovedhandlingen står RETT UNDER innledningen, synlig uten å rulle på
            en telefon. Dette er appens første skjerm for utloggede, og
            15. sep 2026 ble den åpnet 22 ganger mot 4 åpninger av
            registreringsskjemaet — knappen lå da under 22 områdekort,
            forbeholdet og varselboksen. */}
        <section className="rounded-xl border border-forest-700 bg-white p-4">
          <h2 className="font-serif text-lg font-semibold text-forest-900">{t('ownAreaHeading')}</h2>
          <p className="mt-1 text-sm text-gray-700">{t('ownAreaBody')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/auth/register"
              className="rounded-xl bg-forest-800 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-700"
            >
              {t('tryFree')}
            </Link>
            <Link
              href={locale === 'sv' ? '/sanketips/svamp-efter-regn' : '/sanketips/sopp-etter-regn'}
              className="rounded-xl border border-forest-700 px-4 py-2 text-sm font-semibold text-forest-800 hover:bg-forest-50"
            >
              {t('whyRain')}
            </Link>
          </div>
        </section>

        {/* Leserens eget land først (regionerPerLand). Områdesidene selv har
            språket til LANDET de handler om — en svensk side er på svensk, med
            Giftinformationscentralen (se [omrade]/page.tsx). */}
        {seksjoner.map(({ land, regions: iLandet }) => (
          <section key={land} className="space-y-3">
            <h2 className="font-serif text-xl font-semibold text-forest-900">
              {land === 'SE' ? t('countrySE') : t('countryNO')}
            </h2>
            <ul className="space-y-2">
              {iLandet.map((r) => (
                <RegionKort key={r.name} region={r} avHundre={t('outOf100')} />
              ))}
            </ul>
          </section>
        ))}

        {/* Ingen VarselCta her: siden hadde to «Få beskjed når det snur»-
            bokser med motsatt budskap («med en konto» / «ingen konto
            nødvendig»). Den kontoløse seksjonen under er inngangen.

            Forbeholdet følger leserens språk, med det landets giftnummer: på
            samlesiden er det det beste signalet vi har for hvor leseren bor. */}
        <SoppforholdForbehold land={egetLand} />

        {/* Varsel-CTA-en står HER, rett etter at leseren har sett tallene for
            sitt område — det er øyeblikket «si fra når dette snur» gir mening.
            Denne siden er også et SEO-inntak («soppforhold i dag»), så hver
            organiske besøkende får ett tydelig neste steg som ikke krever
            konto. */}
        <section className="rounded-2xl border border-forest-200 bg-forest-50 p-5 text-center">
          <h2 className="font-serif text-xl font-semibold text-forest-900">{t('alertHeading')}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-forest-900">{t('alertBody')}</p>
          <Link
            href="/soppvarsel"
            className="mt-3 inline-block rounded-full bg-forest-800 px-6 py-2.5 text-sm font-semibold text-white hover:bg-forest-700"
          >
            {t('alertButton')}
          </Link>
        </section>

        <p className="text-xs text-gray-500">
          {t.rich('sources', {
            datakilder: (chunks) => (
              <Link href="/datakilder" className="underline">
                {chunks}
              </Link>
            ),
            apenhet: (chunks) => (
              <Link href="/apenhet" className="underline">
                {chunks}
              </Link>
            )
          })}
        </p>
      </article>
    </PageWrapper>
  );
}
