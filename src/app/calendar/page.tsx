import Link from 'next/link';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { createClient } from '@/lib/supabase/server';
import type { Edibility } from '@/types/species';

interface SpeciesRow {
  id: number;
  norwegian_name: string;
  latin_name: string;
  edibility: Edibility;
  season_start: number;
  season_end: number;
  peak_season_start: number | null;
  peak_season_end: number | null;
  primary_image_url: string | null;
}

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

  const species = (data ?? []) as SpeciesRow[];
  const currentMonth = new Date().getMonth() + 1;
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;

  const inSeason = species.filter((s) => isInMonth(currentMonth, s.season_start, s.season_end));
  const comingNext = species.filter(
    (s) => !isInMonth(currentMonth, s.season_start, s.season_end) && isInMonth(nextMonth, s.season_start, s.season_end)
  );

  return (
    <PageWrapper>
      <section className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Sesongkalender</h1>
          <p className="text-sm text-gray-700">Hvilke sopper som er i sesong nå — og hva som kommer.</p>
        </div>

        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Kunne ikke hente arter.</p> : null}

        <article className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold">I sesong nå ({MONTH_NAMES[currentMonth - 1]})</h2>
          {inSeason.length === 0 ? (
            <p className="text-sm text-gray-700">Ingen av de registrerte artene er i sesong i {MONTH_NAMES[currentMonth - 1]}.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {inSeason.map((s) => {
                const peak =
                  s.peak_season_start !== null &&
                  s.peak_season_end !== null &&
                  isInMonth(currentMonth, s.peak_season_start, s.peak_season_end);
                return (
                  <li key={s.id}>
                    <Link
                      href={`/species/${s.id}`}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 p-2 hover:border-forest-700"
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-gray-100">
                        {s.primary_image_url ? (
                          <img src={s.primary_image_url} alt={s.norwegian_name} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-gray-900">{s.norwegian_name}</p>
                        <p className="truncate text-xs italic text-gray-600">{s.latin_name}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <EdibilityBadge edibility={s.edibility} />
                          {peak ? <span className="rounded-full bg-forest-100 px-2 py-0.5 text-xs font-semibold text-forest-900">Topp-sesong</span> : null}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </article>

        {comingNext.length > 0 ? (
          <article className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Kommer i {MONTH_NAMES[nextMonth - 1]}</h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {comingNext.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/species/${s.id}`}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 p-2 hover:border-forest-700"
                  >
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-gray-100">
                      {s.primary_image_url ? (
                        <img src={s.primary_image_url} alt={s.norwegian_name} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900">{s.norwegian_name}</p>
                      <EdibilityBadge edibility={s.edibility} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </article>
        ) : null}

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
                              peak ? 'bg-forest-700' : inSeason ? 'bg-forest-200' : 'bg-gray-100'
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
