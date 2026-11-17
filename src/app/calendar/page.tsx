import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { createClient } from '@/lib/supabase/server';
import { SeasonNow, type CalendarSpecies } from '@/components/calendar/SeasonNow';
import { YearTable } from '@/components/calendar/YearTable';
import { SafetyNote } from '@/components/safety/SafetyNote';
import { getUserLocale } from '@/i18n/locale';
import { sideMetadata } from '@/lib/seo/side-metadata';
import { sesongtilstand } from '@/lib/sesong/sesongtilstand';
import { compareSpeciesByDisplayName } from '@/lib/utils/species-name';

/**
 * Kalenderen arvet forsidens tittel og beskrivelse og hadde ingen canonical,
 * enda den står i sitemap.xml med prioritet 0,8. Beskrivelsen er bevisst uten
 * månedsnavn og uten «plukk nå»: den sier hva siden VISER, og blir ikke
 * stående med feil måned i et søketreff som er noen uker gammelt.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUserLocale();
  const t = await getTranslations({ locale, namespace: 'Calendar' });
  return sideMetadata({
    sti: '/calendar',
    tittel: t('metaTitle'),
    beskrivelse: t('metaDescription'),
    locale
  });
}

export default async function CalendarPage() {
  const t = await getTranslations('Calendar');
  const locale = await getLocale();
  const supabase = createClient();
  // Én måned for hele siden, i Oslo-tid, fra den ene sesonghjelperen. Den ble
  // lest to steder: her med serverens klokke (UTC på Vercel) for årstabellen,
  // og i SeasonNow med enhetens — de første timene av en ny måned kunne «I
  // sesong nå (november)» stå over en tabell som fortsatt markerte oktober, og
  // serverens og nettleserens første rendring av SeasonNow kunne bli ulike.
  const { maaned } = sesongtilstand();
  const { data, error } = await supabase
    .from('mushroom_species')
    .select('id,norwegian_name,swedish_name,latin_name,edibility,season_start,season_end,peak_season_start,peak_season_end,primary_image_url');

  // Sorter på navnet brukeren FAKTISK ser. Spørringa sorterte på
  // norwegian_name mens tabellen rendrer getSpeciesDisplayName, så den svenske
  // sesongtabellen sto i norsk alfabetisk rekkefølge — Karljohan lå der
  // Steinsopp havner. Tabellen er 70+ rader og horisontalt scrollbar, altså i
  // praksis ikke oppslagbar uten riktig rekkefølge. Samme komparator som
  // useSpecies.ts allerede bruker på /species.
  const species = [...((data ?? []) as CalendarSpecies[])].sort((a, b) =>
    compareSpeciesByDisplayName(a, b, locale)
  );

  return (
    <PageWrapper>
      <section className="space-y-4">
        <header>
          <p className="text-xs font-medium uppercase tracking-widest text-forest-700">{t('eyebrow')}</p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-forest-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-gray-700">{t('subtitle')}</p>
        </header>

        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{t('loadError')}</p> : null}

        {/* Kalenderen er den flaten som mest direkte sier «plukk denne nå».
            Forbeholdet står derfor ØVERST, før den første spiselig-merkelappen. */}
        <SafetyNote />

        {/* Ikke ved feil: uten arter ville panelene sagt «ingen arter er i
            sesong» og vist en tom årstabell — påstander om sesongen, ikke om at
            oppslaget feilet. Feilmeldingen over er hele svaret da. */}
        {error ? null : (
          <>
            {/* Location-aware "in season now" + "next up" (client — opt-in position). */}
            <SeasonNow species={species} month={maaned} />

            <YearTable species={species} locale={locale} currentMonth={maaned} />
          </>
        )}
      </section>
    </PageWrapper>
  );
}
