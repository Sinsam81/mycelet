'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { AiEdibilityBadge } from '@/components/identify/AiEdibilityBadge';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { PhotoCredit } from '@/components/ui/PhotoCredit';
import { isRecommendableSpecies } from '@/lib/prediction/recommendable';
import { IdentifySuggestion, PhotoCreditInfo } from '@/types/identify';
import { Edibility } from '@/types/species';

/**
 * Side-by-side confusion check for the selected AI suggestion.
 *
 * Shows the most dangerous look-alike (API sorts critical first) next to the
 * chosen species, with the curated "why they get confused" and "how to tell
 * them apart" texts from the look_alikes table. This is the safety moment of
 * the whole identify flow — never let a user walk away without seeing the
 * dangerous twin.
 */

const EDIBILITY_VALUES: Edibility[] = ['edible', 'conditionally_edible', 'inedible', 'toxic', 'deadly'];

function asEdibility(value: string | null | undefined): Edibility | null {
  return EDIBILITY_VALUES.includes(value as Edibility) ? (value as Edibility) : null;
}

function PhotoCard({
  label,
  name,
  imageUrl,
  imageCredit,
  badge,
  tone
}: {
  label: string;
  name: string;
  imageUrl: string | null | undefined;
  imageCredit: PhotoCreditInfo | null | undefined;
  /**
   * Merket under navnet. Et spor, ikke en spiselighetsverdi, med vilje: de to
   * kortene har ULIKE regler. «Ditt forslag» er et AI-forslag og får aldri et
   * grønt «spiselig» (AiEdibilityBadge); den farlige forvekslingsarten er
   * kuratert look_alikes-data og en advarsel, og beholder det rå merket — men
   * bare når den ikke er mat. Se kallstedet.
   */
  badge: ReactNode;
  tone: 'chosen' | 'danger';
}) {
  return (
    <figure
      className={`overflow-hidden rounded-xl border ${
        tone === 'danger' ? 'border-red-200 bg-red-50/50' : 'border-forest-200 bg-white'
      }`}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} className="h-32 w-full object-cover" />
      ) : (
        <div className="flex h-32 w-full items-center justify-center bg-gray-100 text-3xl">🍄</div>
      )}
      <figcaption className="space-y-1 p-2.5">
        <p className={`text-[11px] font-semibold uppercase tracking-wide ${tone === 'danger' ? 'text-red-700' : 'text-forest-700'}`}>
          {label}
        </p>
        <p className="text-sm font-semibold leading-tight text-gray-900">{name}</p>
        {badge}
        {/* Artsbildene er Commons-filer under CC BY / CC BY-SA. Krediteringen
            hører til akkurat det bildet som vises — se kallstedet: den følger
            aldri med når kortet faller tilbake på et AI-bilde. */}
        <PhotoCredit
          photographer={imageCredit?.photographer}
          license={imageCredit?.license}
          sourceUrl={imageCredit?.sourceUrl}
        />
      </figcaption>
    </figure>
  );
}

export function LookAlikeCheck({ suggestion }: { suggestion: IdentifySuggestion | undefined }) {
  const t = useTranslations('LookAlikeCheck');
  const locale = useLocale();
  const lookAlike = suggestion?.dangerousLookAlikes?.[0];
  if (!suggestion || !lookAlike) return null;

  const critical = lookAlike.danger === 'critical';
  const others = (suggestion.dangerousLookAlikes ?? []).slice(1);
  const chosenName = suggestion.norwegianName ?? suggestion.name;

  // Kortet faller tilbake på et Kindwise-bilde når arten mangler kuratert
  // foto. Krediteringen gjelder BARE det kuraterte bildet — henger den igjen
  // på reservebildet, krediterer vi feil fotograf for et helt annet bilde.
  const chosenImageUrl = suggestion.imageUrl ?? suggestion.similarImages?.[0] ?? null;
  const chosenImageCredit = suggestion.imageUrl ? suggestion.imageCredit : null;
  // Det rå merket står bare på en tvilling som IKKE er mat. Serveren sender
  // aldri en matsopp som dobbeltgjenger for et forslag som ikke er mat
  // (visesSomFarligForveksling i enrich.ts), men et grønt «Spiselig» under
  // «Farlig dobbeltgjenger» skal ikke kunne komme fra noen kilde — heller ikke
  // fra et resultat som ble lagt i økta før den regelen fantes.
  const dangerEdibility = asEdibility(lookAlike.edibility);
  const twinBadge =
    dangerEdibility && !isRecommendableSpecies(dangerEdibility) ? <EdibilityBadge edibility={dangerEdibility} /> : null;
  // «Hvorfor de forveksles» og «Hvordan skille» kommer fra look_alikes og
  // finnes bare på norsk. De vises på alle språk — skilleteksten er
  // sikkerhetsteksten, og den skjules aldri — men merkes lang="nb", og en
  // svensk leser får vite at teksten er norsk i stedet for å tro at appen
  // skriver svensk slik.
  const norskProsa = locale === 'nb' ? undefined : 'nb';
  const harProsa = Boolean(lookAlike.whySimilar || lookAlike.howToTell);

  return (
    <section
      aria-label={t('sectionLabel')}
      className={`rounded-2xl border-2 p-4 shadow-card ${critical ? 'border-red-300 bg-red-50' : 'border-orange-200 bg-orange-50'}`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${critical ? 'text-red-700' : 'text-orange-600'}`} />
        <div>
          <h2 className={`font-serif text-lg font-bold ${critical ? 'text-red-900' : 'text-orange-900'}`}>
            {t('heading')}
          </h2>
          <p className={`text-xs ${critical ? 'text-red-800' : 'text-orange-800'}`}>
            {t('confusedWith', { chosenName, lookAlikeName: lookAlike.name })}
            {critical ? t('criticalSuffix') : t('normalSuffix')}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <PhotoCard
          label={t('yourSuggestion')}
          name={chosenName}
          imageUrl={chosenImageUrl}
          imageCredit={chosenImageCredit}
          badge={<AiEdibilityBadge edibility={suggestion.edibility} />}
          tone="chosen"
        />
        <PhotoCard
          label={t('dangerousLookAlike')}
          name={lookAlike.name}
          imageUrl={lookAlike.imageUrl}
          imageCredit={lookAlike.imageCredit}
          badge={twinBadge}
          tone="danger"
        />
      </div>

      {lookAlike.whySimilar ? (
        <p className="mt-3 text-xs leading-relaxed text-gray-700">
          <span className="font-semibold text-gray-900">{t('whyConfused')}</span>{' '}
          <span lang={norskProsa}>{lookAlike.whySimilar}</span>
        </p>
      ) : null}
      {lookAlike.howToTell ? (
        <p className={`mt-2 rounded-xl p-3 text-sm leading-relaxed ${critical ? 'bg-red-100 text-red-900' : 'bg-orange-100 text-orange-900'}`}>
          <span className="font-bold">{t('howToTell')}</span>{' '}
          <span lang={norskProsa}>{lookAlike.howToTell}</span>
        </p>
      ) : null}
      {norskProsa && harProsa ? <p className="mt-2 text-xs text-gray-600">{t('norwegianTextNote')}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {lookAlike.speciesId ? (
          <Link
            href={`/species/${lookAlike.speciesId}`}
            className={`font-semibold underline ${critical ? 'text-red-800' : 'text-orange-800'}`}
          >
            {t('readMore', { name: lookAlike.name })}
          </Link>
        ) : null}
        {others.length > 0 ? (
          <span className="text-gray-600">{t('alsoConfusedWith', { names: others.map((o) => o.name).join(', ') })}</span>
        ) : null}
      </div>
    </section>
  );
}
