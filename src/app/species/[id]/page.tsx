import type { Metadata } from 'next';
import { ORGANISASJON } from '@/lib/seo/organisasjon';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { AlertTriangle, ChevronLeft, Info, MapPin } from 'lucide-react';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { SpeciesPhotoCarousel } from '@/components/species/SpeciesPhotoCarousel';
import { PoisonHotlineLinks } from '@/components/safety/PoisonHotlineLinks';
import { createClient } from '@/lib/supabase/server';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import { edibilityNoteTone } from '@/lib/species/edibility-note';
import { stripPoisonHotline } from '@/lib/utils/poison-hotline';
import { baseSeasonMask, seasonMonthRanges } from '@/lib/utils/season-region';

interface SpeciesDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Per-art metadata — uten den delte alle 80 artssidene rot-layoutens generiske
 * tittel, og Google kunne aldri rangere siden om pantermusserong på
 * «pantermusserong». Artsnavnene er søkeordene med faktisk volum i nisjen.
 * Lett, eget oppslag (id + navn + beskrivelse); sidens eget '*'-oppslag står
 * urørt.
 */
export async function generateMetadata({ params }: SpeciesDetailPageProps): Promise<Metadata> {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (Number.isNaN(id)) return {};

  const supabase = createClient();
  const { data: art } = await supabase
    .from('mushroom_species')
    .select('norwegian_name,swedish_name,latin_name,description,primary_image_url')
    .eq('id', id)
    .single();
  if (!art) return {};

  const locale = await getLocale();
  const navn = getSpeciesDisplayName(art, locale);
  const tittel =
    locale === 'sv'
      ? `${navn} (${art.latin_name}) — säsong, kännetecken och ätlighet`
      : `${navn} (${art.latin_name}) — sesong, kjennetegn og spiselighet`;
  const beskrivelse = (art.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 155);
  const url = `https://www.mycelet.com/species/${id}`;

  return {
    // NB: rot-layouten har template '%s — Mycelet'. Ikke skriv merkenavnet her.
    title: tittel,
    description: beskrivelse,
    alternates: { canonical: url },
    openGraph: {
      title: tittel,
      description: beskrivelse,
      url,
      type: 'article',
      ...(art.primary_image_url ? { images: [{ url: art.primary_image_url }] } : {})
    }
  };
}

/**
 * Skriver ut sesongvinduet som «jul – nov».
 *
 * Vinduet er `baseSeasonMask`, altså det SAMME vinduet kalenderen,
 * artsbiblioteket og «i sesong nå» bruker. Før leste denne siden
 * season_start/season_end rått, og for arter der de håndsatte månedstallene er
 * for smale sa siden «Sesong sep – nov» om en art kalenderen samtidig førte
 * opp som i sesong i august. Samme art, samme dag, to svar.
 */
function formatSeasonMask(mask: number, monthNames: string[], emptyLabel: string): string {
  const parts = seasonMonthRanges(mask)
    .map(([start, end]) => {
      const s = monthNames[start - 1];
      const e = monthNames[end - 1];
      if (!s || !e) return null;
      return start === end ? s : `${s} – ${e}`;
    })
    .filter((part): part is string => part != null);
  return parts.length > 0 ? parts.join(', ') : emptyLabel;
}

const DANGER_STYLES: Record<string, string> = {
  low: 'bg-gray-100 text-gray-800',
  medium: 'bg-yellow-100 text-yellow-900',
  high: 'bg-orange-100 text-orange-900',
  critical: 'bg-red-700 text-white'
};

export default async function SpeciesDetailPage({ params }: SpeciesDetailPageProps) {
  const t = await getTranslations('SpeciesDetail');
  const locale = await getLocale();
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (Number.isNaN(id)) notFound();

  const monthNames = [
    t('monthJan'), t('monthFeb'), t('monthMar'), t('monthApr'), t('monthMay'), t('monthJun'),
    t('monthJul'), t('monthAug'), t('monthSep'), t('monthOct'), t('monthNov'), t('monthDec')
  ];

  const dangerLabels: Record<string, string> = {
    low: t('dangerLow'),
    medium: t('dangerMedium'),
    high: t('dangerHigh'),
    critical: t('dangerCritical')
  };

  const supabase = createClient();

  const [{ data: species, error: speciesError }, { data: photos }, { data: lookAlikes, error: lookAlikesError }] =
    await Promise.all([
    supabase
      .from('mushroom_species')
      .select('*')
      .eq('id', id)
      .single(),
    supabase
      .from('species_photos')
      .select('id,image_url,thumbnail_url,caption,is_primary,photographer,license,source_url')
      .eq('species_id', id)
      .order('is_primary', { ascending: false }),
    supabase
      .from('look_alikes')
      .select(
        'look_alike_id,danger_level,similarity_description,difference_description,' +
          'mushroom_species!look_alikes_look_alike_id_fkey(id,norwegian_name,swedish_name,latin_name,edibility,primary_image_url)'
      )
      .eq('species_id', id)
      // High limit so a critical look-alike can never be truncated away (safety).
      // Display ordering by danger is applied in JS below.
      .limit(50)
    ]);

  if (speciesError || !species) {
    notFound();
  }

  const isToxic = species.edibility === 'toxic' || species.edibility === 'deadly';
  const displayName = getSpeciesDisplayName(species, locale);
  // Har arten en registrert dødelig tvilling? Da skal notatet se ut som en
  // advarsel selv om ordlyden er nøytral.
  // `any` her av samme grunn som i visnings-blokka lenger nede: PostgREST-typen
  // for et join med alias er en union som inkluderer GenericStringError.
  const hasCriticalLookAlike = (lookAlikes ?? []).some(
    (item: any) => item?.danger_level === 'critical' // eslint-disable-line @typescript-eslint/no-explicit-any
  );
  const noteTone = edibilityNoteTone({
    edibility: species.edibility,
    notes: species.edibility_notes,
    hasCriticalLookAlike
  });

  // Symptom- og toksinteksten kommer fra basen og er skrevet på norsk — flere
  // rader har «ring Giftinformasjonen 22 59 13 00» bakt inn i setningen. Den
  // teksten står øverst i den røde boksen, over den lokaliserte linja lenger
  // nede, så en svensk leser fikk det norske nummeret først og
  // Giftinformationscentralen etterpå. Nummeret skal komme ett sted fra:
  // Safety-namespacet, som er oversatt. Begge feltene under vises kun inne i
  // blokken som også viser den lokaliserte linja, så strippingen kan aldri
  // etterlate siden helt uten nummer.
  const toxinInfo = stripPoisonHotline(species.toxin_info);
  const symptoms = stripPoisonHotline(species.symptoms);

  // Strukturerte data: forteller søkemotorer og AI-crawlere at siden handler om
  // én bestemt art — navn på sidens språk + det latinske navnet som alle kilder
  // deler. schema.org/Taxon er typen for akkurat dette.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Taxon',
    name: displayName,
    alternateName: species.latin_name,
    taxonRank: 'species',
    // Hvem som står bak siden — samme Organization som overalt ellers.
    publisher: ORGANISASJON
  };

  return (
    <PageWrapper wide>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="space-y-6">
        <Link
          href="/species"
          className="inline-flex items-center gap-1 text-sm font-medium text-forest-700 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('backToLibrary')}
        </Link>

        <div className="grid gap-6 md:grid-cols-2 md:items-start lg:gap-10">
          {/* Left: photo carousel */}
          <SpeciesPhotoCarousel photos={photos ?? []} speciesName={displayName} />

          {/* Right: content */}
          <div className="space-y-5">
            <header className="space-y-2">
              <h1 className="font-serif text-4xl font-bold leading-tight text-forest-900">
                {displayName}
              </h1>
              <p className="text-base italic text-gray-600">{species.latin_name}</p>
              {/* Biblioteket og kartet hang ikke sammen: valgte du en art her, måtte
                  du søke den opp igjen i kartet. Lenka bytter art og lar kartet
                  huske utsnittet du hadde (husket-utsnitt.ts). */}
              <Link
                href={`/map?art=${species.id}&artnavn=${encodeURIComponent(displayName)}`}
                className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-900"
              >
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {t('findOnMap')}
              </Link>
              {(species.norwegian_name || species.swedish_name || species.english_name) ? (
                <div className="flex flex-wrap gap-x-4 text-xs text-gray-500">
                  {locale === 'sv' && species.norwegian_name ? <span>🇳🇴 {species.norwegian_name}</span> : null}
                  {locale !== 'sv' && species.swedish_name ? <span>🇸🇪 {species.swedish_name}</span> : null}
                  {species.english_name ? <span>🇬🇧 {species.english_name}</span> : null}
                </div>
              ) : null}
              <div className="pt-1">
                <EdibilityBadge edibility={species.edibility} />
              </div>
            </header>

            {isToxic ? (
              <div
                className={`rounded-2xl p-4 ${
                  species.edibility === 'deadly'
                    ? 'bg-red-900 text-white shadow-lg'
                    : 'border-2 border-red-600 bg-red-50 text-red-900'
                }`}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-6 w-6 shrink-0" />
                  <div className="space-y-1.5">
                    <p className="text-base font-bold uppercase tracking-wide">
                      {species.edibility === 'deadly' ? t('deadlyDoNotEat') : t('toxicDoNotEat')}
                    </p>
                    {toxinInfo ? (
                      <p className="text-sm">
                        <span className="font-semibold">{t('toxinLabel')}</span> {toxinInfo}
                      </p>
                    ) : null}
                    {symptoms ? (
                      <p className="text-sm">
                        <span className="font-semibold">{t('symptomsLabel')}</span> {symptoms}
                      </p>
                    ) : null}
                    <p className="pt-1 text-sm font-medium">
                      {t('poisonCallPrefix')}{' '}
                      <PoisonHotlineLinks
                        className={`underline ${species.edibility === 'deadly' ? 'text-white' : 'text-red-900'}`}
                      />{' '}
                      {t('poisonCallSuffix')}
                    </p>
                    <Link
                      href="/sikkerhet"
                      className={`inline-block pt-1 text-xs underline ${
                        species.edibility === 'deadly' ? 'text-white/90' : 'text-red-800'
                      }`}
                    >
                      {t('moreAboutSafety')}
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}

            {/* edibility_notes ble tidligere bare rendret for `conditionally_edible`.
                45 arter merket `edible` har skrevet og deployet notat i basen —
                blant dem «OBS: hold den klart adskilt fra grønn fluesopp» på
                grønnkremle. Ingen av dem har noen gang vært synlig. Notatet vises
                nå alltid; tonen avgjør bare hvor kraftig det ser ut. */}
            {noteTone ? (
              noteTone === 'warning' ? (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />
                    <div>
                      <p className="font-semibold text-amber-900">
                        {species.edibility === 'conditionally_edible'
                          ? t('conditionallyEdibleTitle')
                          : t('safetyNoteTitle')}
                      </p>
                      <p className="mt-1 text-sm text-amber-900">{species.edibility_notes}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 shrink-0 text-gray-500" />
                    <div>
                      <p className="font-semibold text-gray-800">{t('edibilityNoteTitle')}</p>
                      <p className="mt-1 text-sm text-gray-700">{species.edibility_notes}</p>
                    </div>
                  </div>
                </div>
              )
            ) : null}

            {species.description ? (
              <p className="text-base leading-relaxed text-gray-800">{species.description}</p>
            ) : null}

            <dl className="space-y-0 border-t border-gray-200 pt-4 text-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-forest-700">{t('detailsHeading')}</p>
              <div className="flex justify-between border-b border-gray-100 py-2">
                <dt className="text-gray-600">{t('seasonLabel')}</dt>
                <dd className="font-medium text-gray-900">
                  {formatSeasonMask(
                    baseSeasonMask({
                      id: species.id,
                      edibility: species.edibility,
                      season_start: species.season_start,
                      season_end: species.season_end
                    }),
                    monthNames,
                    t('emptyValue')
                  )}
                </dd>
              </div>
              <div className="flex justify-between border-b border-gray-100 py-2">
                <dt className="text-gray-600">{t('habitatLabel')}</dt>
                <dd className="font-medium text-gray-900 text-right">
                  {(species.habitat ?? []).join(', ') || t('emptyValue')}
                </dd>
              </div>
              {locale !== 'sv' && species.swedish_name ? (
                <div className="flex justify-between border-b border-gray-100 py-2">
                  <dt className="text-gray-600">{t('swedishNameLabel')}</dt>
                  <dd className="font-medium text-gray-900">{species.swedish_name}</dd>
                </div>
              ) : null}
            </dl>

            {/* Sesongvinduet og kartets «forhold i dag» er to ulike spørsmål.
                Uten denne linja leser «Sesong aug – nov» som «nå er det tid»,
                og brukeren møter «Svake forhold» på kartet uten forklaring. */}
            <p className="text-xs text-gray-600">{t('seasonNote')}</p>
          </div>
        </div>

        {/*
          Forvekslingsspørringen feilet. Uten denne beskjeden ville seksjonen
          under bare uteblitt, og siden ville lest som «denne arten har ingen
          farlige forvekslingsarter» — stikk motsatt av det vi vet.
        */}
        {lookAlikesError ? (
          <p
            role="alert"
            className="rounded-2xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
          >
            ⚠️ {t('lookAlikesUnavailable')}
          </p>
        ) : null}

        {/*
          Ingen registrerte forvekslingsarter ga tidligere en helt tom side:
          seksjonen uteble, og stillheten var ikke til å skille fra «vi har
          sjekket, og denne arten har ingen farlige tvillinger». 26 av 52
          spiselige arter i katalogen har fortsatt null rader, så det er den
          vanligste tilstanden — ikke et unntak. Identifiseringsflaten sier
          allerede fra om det samme (lookAlikeNoneRecorded); artssiden gjorde
          det ikke. Fravær av advarsel skal aldri kunne leses som en
          trygghetserklæring.
        */}
        {!lookAlikesError && (lookAlikes?.length ?? 0) === 0 ? (
          <p className="rounded-2xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-800">
            {t('lookAlikesNoneRecorded')}
          </p>
        ) : null}

        {/* Look-alikes section */}
        {(lookAlikes?.length ?? 0) > 0 ? (
          <article className="space-y-4 rounded-2xl bg-white p-5 shadow-card md:p-6">
            <header>
              <p className="text-xs font-semibold uppercase tracking-widest text-forest-700">
                {t('lookAlikesKicker')}
              </p>
              <h2 className="font-serif text-2xl font-bold text-forest-900">{t('lookAlikesHeading')}</h2>
            </header>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...(lookAlikes ?? [])]
                .sort((a: any, b: any) => {
                  // Most dangerous twins first, so a critical look-alike is never buried.
                  const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                  return (rank[a.danger_level] ?? 3) - (rank[b.danger_level] ?? 3);
                })
                .map((item: any) => {
                const lookAlike = item.mushroom_species;
                if (!lookAlike) return null;
                const danger = item.danger_level ?? 'low';
                const lookAlikeName = getSpeciesDisplayName(lookAlike, locale);

                return (
                  <Link
                    key={item.look_alike_id}
                    href={`/species/${lookAlike.id}`}
                    className="group block overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card transition hover:-translate-y-0.5 hover:border-forest-600 hover:shadow-lg"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
                      {lookAlike.primary_image_url ? (
                        <img
                          src={lookAlike.primary_image_url}
                          alt={lookAlikeName}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                          {t('noImage')}
                        </div>
                      )}
                      <span
                        className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-semibold shadow-sm ${
                          DANGER_STYLES[danger] ?? DANGER_STYLES.low
                        }`}
                      >
                        {t('dangerPrefix')} {dangerLabels[danger] ?? danger}
                      </span>
                    </div>

                    <div className="space-y-2 p-3">
                      <div>
                        <p className="font-serif text-base font-bold text-forest-900">{lookAlikeName}</p>
                        <p className="text-xs italic text-gray-600">{lookAlike.latin_name}</p>
                      </div>
                      <EdibilityBadge edibility={lookAlike.edibility} />
                      {item.difference_description ? (
                        <p className="text-xs text-gray-700">
                          <span className="font-semibold">{t('howToTellApart')}</span> {item.difference_description}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          </article>
        ) : null}
      </section>
    </PageWrapper>
  );
}
