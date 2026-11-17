import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { PoisonHotlineLinks } from '@/components/safety/PoisonHotlineLinks';
import { Forvekslingstrener } from '@/components/species/forvekslinger/Forvekslingstrener';
import { Sikkerhetslinje } from '@/components/species/forvekslinger/Sikkerhetslinje';
import { logger } from '@/lib/log';
import { createClient } from '@/lib/supabase/server';
import {
  TRENER_FAREGRADER,
  TRENER_SELECT,
  byggTrenerpar,
  type ForvekslingsRad
} from '@/lib/species/forvekslingstrener';

/**
 * /species/forvekslinger — «Kjenn forvekslingen».
 *
 * En liten øvelse på forvekslingsparene som allerede står i look_alikes: to
 * arter side om side, hvilken er giftig, og hvordan skiller du dem. Åpen uten
 * innlogging (ruten står ikke i PROTECTED_PATHS), og den statiske mappa vinner
 * over [id]-ruta ved siden av.
 *
 * Siden henter radene og lar src/lib/species/forvekslingstrener.ts avgjøre
 * hvilke par som kan vises — og, for svensk, at den norske prosaen aldri blir
 * med ut. Klientkomponenten får bare ferdige par.
 *
 * Tre ting står her uansett hva treneren viser: den faste sikkerhetslinja,
 * nummeret til giftinformasjonen på leserens språk, og veien tilbake til
 * biblioteket.
 *
 * Bevisst uten loading.tsx (se SideSkjelett.tsx om hvorfor aldri under
 * species/) og uten bruksmåling.
 */

const ADRESSE = 'https://www.mycelet.com/species/forvekslinger';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Forvekslingstrener');
  const locale = await getLocale();
  // NB: rot-layouten har template '%s — Mycelet'. Ikke skriv merkenavnet i metaTitle.
  const tittel = t('metaTitle');
  const beskrivelse = t('metaDescription');

  return {
    title: tittel,
    description: beskrivelse,
    alternates: { canonical: ADRESSE },
    // Et eget openGraph-objekt ERSTATTER rot-layoutens, så siteName og locale
    // må gjentas her — ellers mister delingskortet dem.
    openGraph: {
      title: tittel,
      description: beskrivelse,
      url: ADRESSE,
      siteName: 'Mycelet',
      locale: locale === 'sv' ? 'sv_SE' : 'nb_NO',
      type: 'website'
    }
  };
}

export default async function ForvekslingerPage() {
  const t = await getTranslations('Forvekslingstrener');
  const locale = await getLocale();
  const supabase = createClient();

  const { data, error } = await supabase
    .from('look_alikes')
    .select(TRENER_SELECT)
    .in('danger_level', [...TRENER_FAREGRADER])
    // Godt over dagens 28 alvorlige rader, så et par aldri faller ut i det stille.
    .limit(500);

  if (error) {
    logger.warn('forvekslingstrener.hent_feilet', { message: error.message });
  }

  // Joinet med to pekere til samme tabell gir en type supabase-js ikke klarer
  // å uttrykke (samme grunn som `any` i ../[id]/page.tsx). byggTrenerpar stoler
  // uansett ikke på formen — den sjekker hvert felt.
  const par = error ? [] : byggTrenerpar((data ?? []) as unknown as ForvekslingsRad[], locale);

  return (
    <PageWrapper>
      <section className="space-y-5">
        <Link
          href="/species"
          className="inline-flex items-center gap-1 text-sm font-medium text-forest-700 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {t('tilbake')}
        </Link>

        <header className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-forest-700">{t('eyebrow')}</p>
          <h1 className="font-serif text-3xl font-bold text-forest-900">{t('title')}</h1>
          <p className="text-sm leading-relaxed text-gray-800">{t('intro')}</p>
        </header>

        <Sikkerhetslinje />

        {error ? (
          // Feilet oppslaget, sier vi det. En tom trener ville lest som «vi
          // har ingen farlige forvekslinger å vise».
          <p
            role="alert"
            className="rounded-2xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
          >
            {t('hentefeil')}
          </p>
        ) : (
          <Forvekslingstrener par={par} />
        )}

        {/* Nummeret kommer fra Safety-namespacet for leserens språk: ett nummer
            på norsk, 112 og 010-nummeret på svensk — aldri hardkodet her. */}
        <p className="text-sm text-gray-800">
          {t('forgiftningPrefix')}{' '}
          <PoisonHotlineLinks withName className="font-semibold underline underline-offset-2" />{' '}
          {t('forgiftningSuffix')}
        </p>
      </section>
    </PageWrapper>
  );
}
