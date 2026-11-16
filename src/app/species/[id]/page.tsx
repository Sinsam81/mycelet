import type { Metadata } from 'next';
import { ORGANISASJON } from '@/lib/seo/organisasjon';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { AlertTriangle, ChevronLeft, Info, MapPin } from 'lucide-react';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { PhotoCredit } from '@/components/ui/PhotoCredit';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { Artsbilde } from '@/components/species/Artsbilde';
import { SesongKurve } from '@/components/species/SesongKurve';
import { SpeciesPhotoCarousel } from '@/components/species/SpeciesPhotoCarousel';
import { PoisonHotlineLinks } from '@/components/safety/PoisonHotlineLinks';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/log';
import { sesongtilstand } from '@/lib/sesong/sesongtilstand';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import { HOVEDBILDE_SIZES, bredesteUtgave, hovedbildeSrcSet, kortbilde } from '@/lib/species/artsbilde';
import { byggArtsfakta, type Kjennetegnsdel, type Vanlighet } from '@/lib/species/artsfakta';
import { byggArtJsonLd, jsonLdTilScript, metabeskrivelse } from '@/lib/species/artsmetadata';
import { edibilityNoteTone } from '@/lib/species/edibility-note';
import {
  FORVEKSLING_RADGRENSE,
  slaaSammenForvekslinger,
  type ForvekslingsRad
} from '@/lib/species/forvekslinger';
import { langeManedsnavn } from '@/lib/species/manedsnavn';
import { byggSeEtterLinje } from '@/lib/species/se-etter';
import {
  hentSesongkurve,
  sesongkurveTekster,
  sesongkurveVisning,
  type SesongkurveOversetter
} from '@/lib/species/sesongkurve';
import { normalizeEdibility } from '@/lib/utils/edibility';
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
    .select('id,norwegian_name,swedish_name,latin_name,description,primary_image_url,edibility,season_start,season_end')
    .eq('id', id)
    .single();
  if (!art) return {};

  const locale = await getLocale();
  const t = await getTranslations('SpeciesDetail');
  const navn = getSpeciesDisplayName(art, locale);
  const tittel =
    locale === 'sv'
      ? `${navn} (${art.latin_name}) — säsong, kännetecken och ätlighet`
      : `${navn} (${art.latin_name}) — sesong, kjennetegn og spiselighet`;
  // `description` er norsk i basen. Den svenske siden hadde svensk tittel og de
  // første 155 tegnene norsk prosa som beskrivelse — i søketreffet og i
  // delingskortet. Svensk får derfor en setning bygget av det vi HAR på svensk:
  // navn, latinsk navn og sesongmånedene. Norsk beholder ingressen fra basen
  // (kuttet ved en ordgrense, ikke midt i et ord), og faller på samme setning
  // bare hvis arten mangler beskrivelse.
  const sesong = formatSeasonMask(baseSeasonMask(art), langeManedsnavn(locale), '');
  const grunnsetning = sesong ? t('metaDescription', { name: navn, latin: art.latin_name, season: sesong }) : null;
  // Navnet på det andre språket. Språket velges av cookie, så søkemotorene får
  // den norske siden — og «Karljohan» sto der bare som en liten flagglinje.
  const annetNavn = (locale === 'sv' ? art.norwegian_name : art.swedish_name)?.trim();
  const erAnnetNavn = Boolean(annetNavn) && annetNavn.toLowerCase() !== navn.toLowerCase();
  const beskrivelse = metabeskrivelse({
    ingress: locale === 'sv' ? null : art.description,
    grunnsetning,
    tillegg: erAnnetNavn ? t('metaOtherLanguageName', { name: annetNavn }) : null
  });
  const url = `https://www.mycelet.com/species/${id}`;
  // Delingskortet fikk bildet slik det er lagret, 330 eller 500 piksler bredt.
  // Under 600 viser en forhåndsvisning bare et lite miniatyrbilde.
  const delingsbilde = bredesteUtgave(art.primary_image_url);

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
      ...(delingsbilde ? { images: [{ url: delingsbilde }] } : {})
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

/**
 * Feltene forvekslingskortet trenger fra arten på kortet. Samme liste i begge
 * retninger, så et kort ser likt ut uansett hvilken side raden er ført på.
 *
 * primary_image_* er krediteringen for primary_image_url (migrasjon 062).
 * Kortene viste Commons-bildene uten fotograf og lisens; CC BY og CC BY-SA
 * krever navngiving der bildet vises. Identifiseringen leser de samme
 * kolonnene gjennom det samme joinet (enrich.ts).
 */
const LOOK_ALIKE_SPECIES_FIELDS =
  'id,norwegian_name,swedish_name,latin_name,edibility,primary_image_url,' +
  'primary_image_photographer,primary_image_license,primary_image_source_url';

/** Én rad i «Detaljer»: etikett til venstre, verdi til høyre. */
const DETAIL_ROW = 'flex justify-between gap-4 border-b border-gray-100 py-2';
/**
 * Sesongraden: samme etikett-og-verdi som de andre radene, men med plass til
 * en verdi til under — kurven — i full bredde. <dl> tillater bare dt/dd rett
 * under gruppen, så kurven er en <dd> nummer to og ikke en egen boks.
 */
const SEASON_GROUP = 'grid grid-cols-[auto_1fr] gap-x-4 border-b border-gray-100 py-2';
const DETAIL_TERM = 'shrink-0 text-gray-600';
const DETAIL_VALUE = 'text-right font-medium text-gray-900';

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

  // Skrevet ut nøkkel for nøkkel, ikke t(`commonality${…}`): en dynamisk nøkkel
  // skjuler en manglende oversettelse til den står i produksjon.
  const commonalityLabels: Record<Vanlighet, string> = {
    very_common: t('commonalityVeryCommon'),
    common: t('commonalityCommon'),
    uncommon: t('commonalityUncommon'),
    rare: t('commonalityRare'),
    very_rare: t('commonalityVeryRare')
  };

  const fieldMarkLabels: Record<Kjennetegnsdel, string> = {
    hatt: t('fieldMarkCap'),
    skiver: t('fieldMarkGills'),
    stilk: t('fieldMarkStem'),
    kjott: t('fieldMarkFlesh'),
    lukt: t('fieldMarkSmell')
  };

  // Brødteksten fra basen (beskrivelse, notater, gift- og forvekslingstekst) er
  // norsk også på den svenske siden — oversatt artsinnhold er et innholds-
  // prosjekt som krever fagsjekk (docs/svensk-lokalisering-restanser.md). Den
  // skal i det minste ikke utgi seg for å være svensk: lang="nb" sier til
  // skjermlesere og søkemotorer hvilket språk avsnittet faktisk er på.
  const norskProsa = locale === 'sv' ? 'nb' : undefined;

  const supabase = createClient();

  const [
    { data: species, error: speciesError },
    { data: photos },
    { data: lookAlikes, error: lookAlikesError },
    { data: reverseLookAlikes, error: reverseLookAlikesError }
  ] = await Promise.all([
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
          `mushroom_species!look_alikes_look_alike_id_fkey(${LOOK_ALIKE_SPECIES_FIELDS})`
      )
      .eq('species_id', id)
      // High limit so a critical look-alike can never be truncated away (safety).
      // Display ordering by danger is applied in slaaSammenForvekslinger.
      .limit(FORVEKSLING_RADGRENSE),
    // Samme tabell lest fra den ANDRE siden: radene der denne arten står som
    // forvekslingen. Radene er ført fra matsoppens side, så uten denne
    // spørringen sto grønn fluesopp, flatklokkehatt og 18 andre arter med
    // «ikke ført inn ennå» mens basen visste hvem de forveksles med.
    // Begrensningsnavnet er Postgres' standardnavn fra migrasjon 001, bekreftet
    // mot produksjon 10. november 2026.
    supabase
      .from('look_alikes')
      .select(
        'species_id,danger_level,similarity_description,difference_description,' +
          `mushroom_species!look_alikes_species_id_fkey(${LOOK_ALIKE_SPECIES_FIELDS})`
      )
      .eq('look_alike_id', id)
      .limit(FORVEKSLING_RADGRENSE)
  ]);

  if (speciesError || !species) {
    notFound();
  }

  // PostgREST-typen for et join med fremmednøkkel-hint er en union som
  // inkluderer GenericStringError, så radene får formen sin her.
  const forwardRows = (lookAlikes ?? []) as unknown as ForvekslingsRad[];
  const reverseRows = (reverseLookAlikes ?? []) as unknown as ForvekslingsRad[];

  // En feil her vises til leseren (lookAlikesUnavailable), men sto ellers
  // ingen steder: uten logglinja ser en død spørring ut som en vanlig dag.
  if (lookAlikesError) {
    logger.error('species.look_alikes_failed', lookAlikesError, {
      speciesId: id,
      retning: 'fra',
      message: lookAlikesError.message
    });
  }
  if (reverseLookAlikesError) {
    logger.error('species.look_alikes_failed', reverseLookAlikesError, {
      speciesId: id,
      retning: 'til',
      message: reverseLookAlikesError.message
    });
  }

  const forvekslinger = slaaSammenForvekslinger({
    fram: forwardRows,
    bak: reverseRows,
    framFeilet: Boolean(lookAlikesError),
    bakFeilet: Boolean(reverseLookAlikesError)
  });

  const isToxic = species.edibility === 'toxic' || species.edibility === 'deadly';
  const displayName = getSpeciesDisplayName(species, locale);
  // Hovedbildet i den bredden skjermen trenger: bildene er lagret 330 eller 500
  // piksler brede og ble strukket to–tre ganger. Bredere utgaver av SAMME fil
  // — samme fotograf og lisens — og aldri bredere enn originalen (artsbilde.ts).
  const bilder = (photos ?? []).map((photo) => ({ ...photo, srcSet: hovedbildeSrcSet(photo.image_url) }));
  // Hva som vises av artsraden, per språk. Reglene står i artsfakta.ts.
  const fakta = byggArtsfakta(species, locale);
  // «Se etter»: én setning om hvordan arten vokser og hvor man ser etter den.
  // Bare matsopp får den — porten står i se-etter.ts, og siden kaller aldri
  // setningsbyggeren direkte.
  const seEtter = byggSeEtterLinje(species, locale);

  // Sesongvinduet — det SAMME vinduet kalenderen og artsbiblioteket bruker —
  // og kurven under det: når arten er registrert, uke for uke. Kurven får
  // masken som port, så den aldri kan motsi tekstraden den står under
  // (vinterartene får ingen kurve; se sesongkurve.ts). Siden rendres per
  // forespørsel (cookies leses), så «i dag» er dagen leseren åpner den.
  const sesongmaske = baseSeasonMask({
    id: species.id,
    edibility: species.edibility,
    season_start: species.season_start,
    season_end: species.season_end
  });
  const sesongkurve = hentSesongkurve(species.id, sesongmaske);
  const kurve = sesongkurve
    ? {
        visning: sesongkurveVisning(sesongkurve, sesongtilstand().osloDato),
        tekster: sesongkurveTekster({
          kurve: sesongkurve,
          navn: displayName,
          t: t as SesongkurveOversetter,
          langeManeder: langeManedsnavn(locale)
        })
      }
    : null;
  // Har arten en registrert dødelig tvilling? Da skal notatet se ut som en
  // advarsel selv om ordlyden er nøytral. Bare artens EGNE rader teller: en
  // kritisk rad som peker hit, sier at denne arten er den farlige i paret.
  const hasCriticalLookAlike = forwardRows.some((row) => row.danger_level === 'critical');
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
  // én bestemt art — alle navnene vi har på den, slekt og familie, bildet med
  // fotograf og lisens. schema.org/Taxon er typen for akkurat dette. ALDRI
  // spiselighet, og aldri brødteksten fra basen: se artsmetadata.ts.
  const sesongTekst = formatSeasonMask(sesongmaske, langeManedsnavn(locale), '');
  const jsonLd = byggArtJsonLd({
    url: `https://www.mycelet.com/species/${species.id}`,
    visningsnavn: displayName,
    rad: species,
    // En egen setning, uten ordet «spiselighet»: metabeskrivelsen nevner det
    // som et tema på siden, men her skal ikke ordet stå i det hele tatt.
    beskrivelse: sesongTekst
      ? t('structuredDataDescription', { name: displayName, latin: species.latin_name, season: sesongTekst })
      : null,
    bildeUrl: bredesteUtgave(species.primary_image_url),
    // Hvem som står bak siden — samme Organization som overalt ellers.
    utgiver: ORGANISASJON
  });

  return (
    <PageWrapper wide>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdTilScript(jsonLd) }} />
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
          <SpeciesPhotoCarousel photos={bilder} speciesName={displayName} sizes={HOVEDBILDE_SIZES} />

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
                        <span className="font-semibold">{t('toxinLabel')}</span>{' '}
                        <span lang={norskProsa}>{toxinInfo}</span>
                      </p>
                    ) : null}
                    {symptoms ? (
                      <p className="text-sm">
                        <span className="font-semibold">{t('symptomsLabel')}</span>{' '}
                        <span lang={norskProsa}>{symptoms}</span>
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
                      <p lang={norskProsa} className="mt-1 text-sm text-amber-900">
                        {species.edibility_notes}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 shrink-0 text-gray-500" />
                    <div>
                      <p className="font-semibold text-gray-800">{t('edibilityNoteTitle')}</p>
                      <p lang={norskProsa} className="mt-1 text-sm text-gray-700">
                        {species.edibility_notes}
                      </p>
                    </div>
                  </div>
                </div>
              )
            ) : null}

            {species.description ? (
              <p lang={norskProsa} className="text-base leading-relaxed text-gray-800">
                {species.description}
              </p>
            ) : null}

            {/* Overskriften sto før som et <p> inne i <dl>, som bare kan ha
                dt/dd-grupper som barn. Den står nå over lista. */}
            <div className="border-t border-gray-200 pt-4 text-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-forest-700">{t('detailsHeading')}</p>
              <dl>
                <div className={SEASON_GROUP}>
                  <dt className={DETAIL_TERM}>{t('seasonLabel')}</dt>
                  <dd className={DETAIL_VALUE}>{formatSeasonMask(sesongmaske, monthNames, t('emptyValue'))}</dd>
                  {/* NÅR arten er registrert — aldri et løfte om funn, og lik
                      for matsopp og giftsopp. Ingen kurve når den ville løyet:
                      da står tekstraden alene, som før. */}
                  {kurve ? (
                    <dd className="col-span-2 pb-1 pt-3">
                      <SesongKurve visning={kurve.visning} manedsnavn={monthNames} tekster={kurve.tekster} />
                    </dd>
                  ) : null}
                </div>
                <div className={DETAIL_ROW}>
                  <dt className={DETAIL_TERM}>{t('habitatLabel')}</dt>
                  {/* På leserens språk: habitat-taggene er norske i basen, og sto
                      rått som «barskog, blandingsskog» under en svensk etikett. */}
                  <dd className={DETAIL_VALUE}>{fakta.habitat.join(', ') || t('emptyValue')}</dd>
                </div>
                {/* Radene under vises bare når basen har verdien. Ingen av dem
                    sier noe om hvor arten finnes akkurat nå — «vokser med» er
                    artens økologi, ikke et løfte om funn. */}
                {fakta.vertstraer.length > 0 ? (
                  <div className={DETAIL_ROW}>
                    <dt className={DETAIL_TERM}>{t('growsWithLabel')}</dt>
                    <dd className={DETAIL_VALUE}>{fakta.vertstraer.join(', ')}</dd>
                  </div>
                ) : null}
                {fakta.substrat ? (
                  <div className={DETAIL_ROW}>
                    <dt className={DETAIL_TERM}>{t('growsOnLabel')}</dt>
                    <dd className={DETAIL_VALUE}>{fakta.substrat}</dd>
                  </div>
                ) : null}
                {/* En hel setning, så den står under etiketten og ikke klemt
                    inn til høyre for den. Om ARTEN, aldri om et sted: «se i
                    kanten mot lysninger», ikke «her finner du den». */}
                {seEtter ? (
                  <div className="border-b border-gray-100 py-2">
                    <dt className={DETAIL_TERM}>{t('lookForLabel')}</dt>
                    <dd className="mt-1 leading-relaxed text-gray-900">{seEtter}</dd>
                  </div>
                ) : null}
                {fakta.vanlighet ? (
                  <div className={DETAIL_ROW}>
                    <dt className={DETAIL_TERM}>{t('commonalityLabel')}</dt>
                    <dd className={DETAIL_VALUE}>{commonalityLabels[fakta.vanlighet]}</dd>
                  </div>
                ) : null}
                {fakta.familie ? (
                  <div className={DETAIL_ROW}>
                    <dt className={DETAIL_TERM}>{t('familyLabel')}</dt>
                    <dd className={`${DETAIL_VALUE} italic`}>{fakta.familie}</dd>
                  </div>
                ) : null}
                {fakta.synonymer.length > 0 ? (
                  <div className={DETAIL_ROW}>
                    <dt className={DETAIL_TERM}>{t('synonymsLabel')}</dt>
                    <dd className={`${DETAIL_VALUE} italic`}>{fakta.synonymer.join(', ')}</dd>
                  </div>
                ) : null}
                {locale !== 'sv' && species.swedish_name ? (
                  <div className={DETAIL_ROW}>
                    <dt className={DETAIL_TERM}>{t('swedishNameLabel')}</dt>
                    <dd className={DETAIL_VALUE}>{species.swedish_name}</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            {/* Sesongvinduet og kartets «forhold i dag» er to ulike spørsmål.
                Uten denne linja leser «Sesong aug – nov» som «nå er det tid»,
                og brukeren møter «Svake forhold» på kartet uten forklaring. */}
            <p className="text-xs text-gray-600">{t('seasonNote')}</p>
          </div>
        </div>

        {/*
          Kjennetegn: hatt, skiver, stilk og lukt slik de står i basen. I dag
          har de åtte forvekslingsartene fra migrasjon 049 slik tekst — de
          eneste artene uten bilde. Står OVER forvekslingskortene, så «hvordan
          skille» har noe å vise til. Bare på norsk, hele teksten, aldri smak:
          se artsfakta.ts. Tom liste gir ingen seksjon og ingen overskrift.
        */}
        {fakta.kjennetegn.length > 0 ? (
          <article className="space-y-3 rounded-2xl bg-white p-5 shadow-card md:p-6">
            <h2 className="font-serif text-2xl font-bold text-forest-900">{t('fieldMarksHeading')}</h2>
            <dl className="space-y-3 text-sm">
              {fakta.kjennetegn.map(({ del, tekst }) => (
                <div key={del}>
                  <dt className="font-semibold text-gray-900">{fieldMarkLabels[del]}</dt>
                  <dd className="mt-0.5 leading-relaxed text-gray-800">{tekst}</dd>
                </div>
              ))}
            </dl>
          </article>
        ) : null}

        {/*
          En av forvekslingsspørringene feilet (eller traff radgrensen). Uten
          denne beskjeden ville seksjonen under bare uteblitt eller stått
          halv, og siden ville lest som «denne arten har ingen farlige
          forvekslingsarter» — stikk motsatt av det vi vet. Kortene vi FIKK
          hentet vises fortsatt under: de er sanne, lista er bare ikke hel.
        */}
        {forvekslinger.ufullstendig ? (
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

          Vises bare når BEGGE retninger er lest helt og begge er tomme
          (ingenRegistrert). Før leste siden bare artens egne rader, og sa
          dette om 20 arter basen hadde forvekslinger for. Har arten bare
          rader som peker hit, står forbeholdet inne i seksjonen under, over
          kortene (lookAlikesOwnNotRecorded).
        */}
        {forvekslinger.ingenRegistrert ? (
          <p className="rounded-2xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-800">
            {t('lookAlikesNoneRecorded')}
          </p>
        ) : null}

        {/* Look-alikes section */}
        {forvekslinger.kort.length > 0 ? (
          <article className="space-y-4 rounded-2xl bg-white p-5 shadow-card md:p-6">
            <header>
              <p className="text-xs font-semibold uppercase tracking-widest text-forest-700">
                {t('lookAlikesKicker')}
              </p>
              <h2 className="font-serif text-2xl font-bold text-forest-900">{t('lookAlikesHeading')}</h2>
            </header>

            {/*
              Kortene under kommer bare fra radene som peker HIT: artens egne
              rader er lest, og det finnes ingen (egneRaderTomme). Uten denne
              beskjeden sto piggsopp med to grønne «Spiselig»-kort og ingenting
              om at dens egne farlige forvekslinger aldri er ført inn — sterkere
              falsk trygghet enn den tomme siden «ikke ført inn ennå» ble
              skrevet for. Den setningen kan ikke brukes her: den ville motsagt
              kortene.

              Ikke på giftige og dødelige arter. Der står den røde boksen, og
              «betyr ikke at arten er trygg å plukke» under «ikke spis» ville
              vært meningsløst. Samme variabel som boksen, så de to aldri kan
              gli fra hverandre.
            */}
            {forvekslinger.egneRaderTomme && !isToxic ? (
              <p className="rounded-2xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-800">
                {t('lookAlikesOwnNotRecorded', { count: forvekslinger.kort.length })}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Farligst først — rekkefølgen kommer fra slaaSammenForvekslinger. */}
              {forvekslinger.kort.map((kort) => {
                const lookAlike = kort.art;
                const lookAlikeName = getSpeciesDisplayName(lookAlike, locale);

                return (
                  // Bare bildet og navnet er lenke. Hele kortet var én lenke, og
                  // med begge tekstene under blir det opptil et par tusen tegn:
                  // en skjermleser leste alt som lenkenavn, teksten lot seg ikke
                  // markere, og et trykk hvor som helst i skilleteksten forlot
                  // siden midt i lesingen.
                  <article
                    key={lookAlike.id}
                    className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card"
                  >
                    <Link href={`/species/${lookAlike.id}`} className="group block">
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
                        {lookAlike.primary_image_url ? (
                          // Nedenfor første skjermbilde: lastes først når
                          // kortet nærmer seg. 500 piksler bredt der
                          // originalen har det (halvparten er lagret 330
                          // brede); den lagrede utgaven er reserven.
                          <Artsbilde
                            src={kortbilde(lookAlike.primary_image_url)}
                            reserve={lookAlike.primary_image_url}
                            alt={lookAlikeName}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                            {t('noImage')}
                          </div>
                        )}
                        {kort.faregrad ? (
                          <span
                            className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-semibold shadow-sm ${
                              DANGER_STYLES[kort.faregrad]
                            }`}
                          >
                            {t('dangerPrefix')} {dangerLabels[kort.faregrad]}
                          </span>
                        ) : (
                          // Raden er ført på den andre artens side. Faregraden
                          // der beskriver DENNE arten, ikke arten på kortet —
                          // «Fare: Kritisk» over en kantarell ville vært galt.
                          // Spiselighetsmerket under er det eneste kortet sier
                          // om arten selv; ingen ord om at den er et trygt valg.
                          <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-xs font-semibold text-gray-800 shadow-sm ring-1 ring-gray-300">
                            {t('lookAlikeConfusedWithThis')}
                          </span>
                        )}
                      </div>
                      <div className="px-3 pt-3">
                        <p className="font-serif text-base font-bold text-forest-900 group-hover:underline">
                          {lookAlikeName}
                        </p>
                        <p className="text-xs italic text-gray-600">{lookAlike.latin_name}</p>
                      </div>
                    </Link>

                    <div className="space-y-2 p-3">
                      <EdibilityBadge edibility={normalizeEdibility(lookAlike.edibility)} />
                      {/* «Hvorfor de forveksles» sto i basen for alle 68 parene og
                          ble hentet, men aldri vist. Samme etikett som i
                          identifiseringen (LookAlikeCheck). */}
                      {kort.likhet ? (
                        <p className="text-xs leading-relaxed text-gray-700">
                          <span className="font-semibold">{t('whyConfused')}</span>{' '}
                          <span lang={norskProsa}>{kort.likhet}</span>
                        </p>
                      ) : null}
                      {/* Skilleteksten er den sikkerhetsbærende: alltid hel, aldri
                          avkortet for å få plass til noe annet. */}
                      {kort.skille ? (
                        <p className="text-sm leading-relaxed text-gray-800">
                          <span className="font-semibold">{t('howToTellApart')}</span>{' '}
                          <span lang={norskProsa}>{kort.skille}</span>
                        </p>
                      ) : null}
                      {/* Fotograf og lisens for bildet på kortet. Står her og
                          ikke under bildet, fordi bildet er inne i lenka til
                          arten og krediteringen selv er en lenke. Rendrer
                          ingenting uten ekte verdier. */}
                      {lookAlike.primary_image_url ? (
                        <PhotoCredit
                          photographer={lookAlike.primary_image_photographer ?? null}
                          license={lookAlike.primary_image_license ?? null}
                          sourceUrl={lookAlike.primary_image_source_url ?? null}
                        />
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </article>
        ) : null}
      </section>
    </PageWrapper>
  );
}
