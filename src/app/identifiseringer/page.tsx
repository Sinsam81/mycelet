import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Camera, MapPin, Sparkles } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { SlettIdentifisering } from '@/components/identifikasjoner/SlettIdentifisering';
import { createClient } from '@/lib/supabase/server';
import { intlLocale } from '@/lib/utils/intl-locale';
import { getJoinedSpeciesName } from '@/lib/utils/species-name';
import { IDENTIFY_HISTORY_BUCKET } from '@/lib/identifications/config';
import type { Edibility } from '@/types/species';

export async function generateMetadata() {
  const t = await getTranslations('Identifiseringer');
  return { title: t('metaTitle') };
}

/**
 * «Mine identifiseringer» — brukerens egen AI-historikk.
 *
 * Egen side, ikke en fane under /mine-steder: «Mine steder» er gruppert etter
 * STED, historikken er kronologisk etter HENDELSE, og de fleste oppføringene
 * har aldri blitt et sted. Å blande dem svekker begge.
 *
 * ⚠️ «Lagre som funn» er en LENKE til /identify/result?id=…, ikke en lagring
 * her. Bekreftelses-porten er ikke bare avkrysningsboksen — den får mening av
 * forvekslingssjekken, sikkerhetsadvarselen og artsvelgeren rundt seg. En
 * lagre-knapp i denne lista ville gitt en bekreftelse uten advarselen som gjør
 * bekreftelsen til noe. Vaktesten
 * __tests__/lagring-gaar-via-resultatsiden.test.ts låser det.
 */

interface Rad {
  id: string;
  created_at: string;
  top_suggestion_name: string;
  top_probability: number | null;
  latitude: number | null;
  longitude: number | null;
  image_path: string | null;
  image_count: number | null;
  finding_id: string | null;
  mushroom_species:
    | { norwegian_name: string | null; swedish_name: string | null; edibility: Edibility | null }
    | { norwegian_name: string | null; swedish_name: string | null; edibility: Edibility | null }[]
    | null;
}

/** Én time holder for én visning; bøtta er privat, så URL-ene må være kortlevde. */
const SIGNED_URL_SECONDS = 60 * 60;

function foersteArt(rad: Rad) {
  return Array.isArray(rad.mushroom_species) ? rad.mushroom_species[0] : rad.mushroom_species;
}

export default async function IdentifiseringerPage() {
  const t = await getTranslations('Identifiseringer');
  const locale = await getLocale();
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  // Gating på sidenivå I TILLEGG til PROTECTED_PATHS: Turbopack kjører ikke
  // middleware i dev, så uten denne kunne `npm run qa` ikke teste sperren
  // lokalt (se QA-gotchaen i CLAUDE.md).
  if (!user) redirect('/auth/login?redirect=/identifiseringer');

  const { data, error } = await supabase
    .from('identifications')
    .select(
      'id, created_at, top_suggestion_name, top_probability, latitude, longitude, image_path, image_count, finding_id, mushroom_species(norwegian_name,swedish_name,edibility)'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(500);

  const rader = (data ?? []) as unknown as Rad[];

  // Signerte URL-er i ÉN batch, ikke én forespørsel per kort: en historikk på
  // 200 rader ville ellers blitt 200 rundturer før sida kan rendres.
  const stier = rader.map((r) => r.image_path).filter((p): p is string => !!p);
  const bildeUrler = new Map<string, string>();
  if (stier.length > 0) {
    const { data: signerte } = await supabase.storage
      .from(IDENTIFY_HISTORY_BUCKET)
      .createSignedUrls(stier, SIGNED_URL_SECONDS);
    for (const s of signerte ?? []) {
      if (s.path && s.signedUrl) bildeUrler.set(s.path, s.signedUrl);
    }
  }

  return (
    <PageWrapper>
      <section className="space-y-4">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-forest-700">{t('eyebrow')}</p>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-forest-900">{t('heading')}</h1>
          <p className="mt-1 text-sm text-gray-700">
            {t('intro')} {rader.length > 0 ? t('summary', { count: rader.length }) : ''}
          </p>
        </header>

        {/* Tom er ikke det samme som feilet — samme lærdom som /mine-steder.
            En forbigående spørrefeil som rendres som «ingen identifiseringer
            ennå» leses som at dataene er slettet. */}
        {error ? (
          <article className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
            <h2 className="font-serif text-lg font-semibold text-amber-900">{t('loadErrorHeading')}</h2>
            <p className="mt-1 text-sm text-amber-900">{t('loadErrorBody')}</p>
          </article>
        ) : rader.length === 0 ? (
          <article className="rounded-2xl bg-white p-6 text-center shadow-card">
            <p className="text-4xl">🔍</p>
            <h2 className="mt-2 font-serif text-xl font-semibold text-forest-900">{t('emptyHeading')}</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-700">{t('emptyBody')}</p>
            <Link
              href="/identify"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-700"
            >
              <Camera className="h-4 w-4" /> {t('identifyNow')}
            </Link>
          </article>
        ) : (
          <ul className="space-y-3">
            {rader.map((rad) => {
              const art = foersteArt(rad);
              const navn = getJoinedSpeciesName(art ?? null, locale) || rad.top_suggestion_name;
              const bilde = rad.image_path ? bildeUrler.get(rad.image_path) : undefined;
              const harPosisjon = rad.latitude != null && rad.longitude != null;
              return (
                <li key={rad.id} className="overflow-hidden rounded-2xl bg-white shadow-card">
                  <div className="flex">
                    {bilde ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={bilde} alt="" className="h-auto w-24 shrink-0 object-cover" />
                    ) : (
                      <div
                        aria-hidden
                        className="flex w-24 shrink-0 items-center justify-center bg-gray-100 text-2xl"
                      >
                        🍄
                      </div>
                    )}
                    <div className="min-w-0 flex-1 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="truncate font-serif text-lg font-semibold leading-tight text-forest-950">
                            {navn}
                          </h2>
                          <p className="truncate text-xs italic text-gray-600">{rad.top_suggestion_name}</p>
                        </div>
                        {art?.edibility ? <EdibilityBadge edibility={art.edibility} /> : null}
                      </div>

                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-600">
                        <span>
                          {new Date(rad.created_at).toLocaleDateString(intlLocale(locale), {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </span>
                        {rad.top_probability != null ? (
                          <>
                            <span>·</span>
                            <span>{t('probability', { percent: rad.top_probability })}</span>
                          </>
                        ) : null}
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" aria-hidden />
                          {harPosisjon
                            ? t('nearPlace', {
                                lat: rad.latitude!.toFixed(3),
                                lng: rad.longitude!.toFixed(3)
                              })
                            : t('noLocation')}
                        </span>
                      </p>

                      {/* Ærlig om hva vi faktisk tok vare på: analyserte tre
                          bilder, bevarte ett. */}
                      {(rad.image_count ?? 1) > 1 ? (
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          {t('photosAnalyzed', { count: rad.image_count ?? 1 })}
                        </p>
                      ) : null}

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {rad.finding_id ? (
                          <>
                            <span className="inline-flex items-center gap-1 rounded-full bg-forest-100 px-2 py-0.5 text-[11px] font-semibold text-forest-900">
                              ✓ {t('savedBadge')}
                            </span>
                            <Link
                              href="/map?mine=1"
                              className="text-xs font-semibold text-forest-800 underline"
                            >
                              {t('openMap')}
                            </Link>
                          </>
                        ) : (
                          // LENKE, ikke lagring. Resultatsiden eier porten.
                          <Link
                            href={`/identify/result?id=${rad.id}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-forest-700"
                          >
                            <Sparkles className="h-3.5 w-3.5" aria-hidden />
                            {t('saveAsFinding')}
                          </Link>
                        )}
                        <SlettIdentifisering id={rad.id} />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-gray-500">🔒 {t('retentionNote')}</p>
      </section>
    </PageWrapper>
  );
}
