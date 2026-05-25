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
  const { data, error } = await supabase
    .from('mushroom_species')
    .select('id,norwegian_name,latin_name,edibility,season_start,season_end,peak_season_start,peak_season_end,primary_image_url')
    .order('norwegian_name', { ascending: true });

  const species = (data ?? []) as CalendarSpecies[];

  return (
    <PageWrapper>
      <section className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Sesongkalender</h1>
          <p className="text-sm text-gray-700">Hvilke sopper som er i sesong nå — og hva som kommer.</p>
        </div>

        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Kunne ikke hente arter.</p> : null}

        {/* Location-aware "in season now" + "coming soon" (client — needs the user's position). */}
        <SeasonNow species={species} />

        <article className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Hele året</h2>
          <p className="text-xs text-gray-600">Måneder hvor arten kan plukkes. Mørk farge = topp-sesong.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="py-1 pr-2">Art</th>
                  {MONTH_NAMES.map((m) => (
                    <th key={m} className="px-1 text-center font-normal">
                      {m.slice(0, 3)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {species.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="py-1 pr-2 font-medium">
                      <Link href={`/species/${s.id}`} className="hover:underline">
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
                        <td key={m} className="px-1 py-1">
                          <div
                            className={`mx-auto h-3 w-3 rounded-sm ${
                              peak ? 'bg-forest-700' : inSeason ? 'bg-forest-100' : 'bg-gray-100'
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
