import { getLocale, getTranslations } from 'next-intl/server';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { createClient } from '@/lib/supabase/server';
import { SeasonNow, type CalendarSpecies } from '@/components/calendar/SeasonNow';
import { YearTable } from '@/components/calendar/YearTable';

export default async function CalendarPage() {
  const t = await getTranslations('Calendar');
  const locale = await getLocale();
  const supabase = createClient();
  const currentMonth = new Date().getMonth() + 1;
  const { data, error } = await supabase
    .from('mushroom_species')
    .select('id,norwegian_name,swedish_name,latin_name,edibility,season_start,season_end,peak_season_start,peak_season_end,primary_image_url')
    .order('norwegian_name', { ascending: true });

  const species = (data ?? []) as CalendarSpecies[];

  return (
    <PageWrapper>
      <section className="space-y-4">
        <header>
          <p className="text-xs font-medium uppercase tracking-widest text-forest-700">{t('eyebrow')}</p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-forest-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-gray-700">{t('subtitle')}</p>
        </header>

        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{t('loadError')}</p> : null}

        {/* Location-aware "in season now" + "coming soon" (client — opt-in position). */}
        <SeasonNow species={species} />

        <YearTable species={species} locale={locale} currentMonth={currentMonth} />
      </section>
    </PageWrapper>
  );
}
