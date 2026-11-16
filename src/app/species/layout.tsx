import type { Metadata, ResolvingMetadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { getUserLocale } from '@/i18n/locale';
import { SAMME_ADRESSE, sideMetadata } from '@/lib/seo/side-metadata';

/**
 * Metadata for artsbiblioteket (/species).
 *
 * Biblioteket (page.tsx) er en klientkomponent — søk og filtre skjer i
 * nettleseren — og en klientkomponent kan ikke eksportere metadata. Derfor en
 * layout: den gjør ingenting annet enn å gi siden tittel, beskrivelse og
 * kanonisk adresse på leserens språk.
 *
 * ⚠️ LAYOUTEN LIGGER OGSÅ RUNDT /species/[id]. Artssidene setter tittel,
 * beskrivelse, canonical og openGraph selv, og hvert av de feltene erstatter
 * det som står her. To ting må likevel holde for at de 80 artssidene ikke skal
 * ta skade:
 *
 *  1. Tittelen gis som { default, template }, med malen hentet fra
 *     rot-layouten. En ren streng her ville NULLSTILT malen for alt under:
 *     Next gir undersidene malen fra den nærmeste layouten som setter en
 *     tittel, og en ren streng har ingen. Artssidene ville mistet «— Mycelet»
 *     i fanen og i søketreff.
 *  2. Adressen er SAMME_ADRESSE, ikke '/species'. Artssidens eget
 *     metadataoppslag svarer {} når det feiler, og da er det verdiene herfra
 *     som gjelder. Med en fast sti ville en artsside på en dårlig dag pekt på
 *     biblioteket som sin kanoniske adresse; nå peker den på seg selv.
 */
export async function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  const locale = await getUserLocale();
  const t = await getTranslations({ locale, namespace: 'Species' });
  const side = sideMetadata({
    sti: SAMME_ADRESSE,
    tittel: t('metaTitle'),
    beskrivelse: t('metaDescription'),
    locale
  });

  const mal = (await parent).title?.template;
  return mal ? { ...side, title: { default: t('metaTitle'), template: mal } } : side;
}

export default function SpeciesLayout({ children }: { children: ReactNode }) {
  return children;
}
