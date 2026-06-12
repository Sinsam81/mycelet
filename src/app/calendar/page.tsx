import Link from 'next/link';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { createClient } from '@/lib/supabase/server';
import { SeasonNow, type CalendarSpecies } from '@/components/calendar/SeasonNow';

const MONTH_NAMES = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember'
];

function isInMonth(month: number, start: number, end: number) {
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end;
}

export default async function CalendarPage() {
  const supabase = createClient();
  const currentMonth = new Date().getMonth() + 1;
  const { data, error } = await supabase
    .from('mushroom_species')
    .select('id,norwegian_name,latin_name,edibility,season_start,season_end,peak_season_start,peak_season_end,primary_image_url')
    .order('norwegian_name', { ascending: true });

  const species = (data ?? []) as CalendarSpecies[];

  return (
    <PageWrapper>
      <section className="space-y-4">
        <header>
          <p className="text-xs font-medium uppercase tracking-widest text-forest-700">Kalender</p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-forest-900">Sesongkalender</h1>
          <p className="mt-1 text-sm text-gray-700">Hvilke sopper som er i sesong nå — og hva som kommer.</p>
        </header>

        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Kunne ikke hente arter.</p> : null}

        {/* Location-aware "in season now" + "coming soon" (client — opt-in position). */}
        <SeasonNow species={species} />

        <article className="space-y-3 rounded-2xl bg-white p-4 shadow-card">
          <div>
            <h2 className="font-serif text-xl font-bold text-forest-900">Hele året</h2>
            <p className="text-xs text-gray-600">Når hver art kan plukkes gjennom året.</p>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-forest-700" /> Topp-sesong</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-forest-300" /> I sesong</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-gray-200" /> Utenom</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="sticky left-0 bg-white py-1 pr-2 font-normal">Art</th>
                  {MONTH_NAMES.map((m, idx) => (
                    <th
                      key={m}
                      className={`px-1 text-center font-normal ${idx + 1 === currentMonth ? 'font-semibold text-forest-800' : ''}`}
                    >
                      {m.slice(0, 3)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {species.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="sticky left-0 bg-white py-1 pr-2 font-medium">
                      <Link href={`/species/${s.id}`} className="text-forest-900 hover:underline">
                        {s.norwegian_name}
                      </Link>
                    </td>
                    {MONTH_NAMES.map((_, idx) => {
                      const m = idx + 1;
                      const inSeason = isInMonth(m, s.season_start, s.season_end);
                      const peak =
                        s.peak_season_start !== null &&
                        s.peak_season_end !== null &&
                        isInMonth(m, s.peak_season_start, s.peak_season_end);
                      return (
                        <td key={m} className={`px-1 py-1 ${m === currentMonth ? 'bg-forest-50' : ''}`}>
                          <div
                            className={`mx-auto h-3 w-3 rounded-sm ${
                              peak ? 'bg-forest-700' : inSeason ? 'bg-forest-300' : 'bg-gray-200'
                            }`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </PageWrapper>
  );
}
