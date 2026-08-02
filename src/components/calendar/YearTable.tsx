import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import type { Edibility } from '@/types/species';
import type { CalendarSpecies } from './SeasonNow';

const MONTH_KEYS = [
  'monthJan', 'monthFeb', 'monthMar', 'monthApr', 'monthMay', 'monthJun',
  'monthJul', 'monthAug', 'monthSep', 'monthOct', 'monthNov', 'monthDec'
] as const;

/**
 * Arter man kan bli alvorlig syk eller dø av.
 *
 * De blir stående i tabellen — kalenderen har en reell funksjon i å vise NÅR
 * de farlige artene er ute — men de får aldri den grønne fargen. Grønt leses
 * som «klar til å plukkes», og en tabell med grønne ruter på hvit fluesopp er
 * i praksis en trygghetserklæring vi ikke kan stå for. Hver rad bærer i tillegg
 * et spiselighetsmerke i tekst, slik at fargen aldri er eneste bærer av
 * informasjonen.
 */
const DANGEROUS_EDIBILITY: readonly Edibility[] = ['toxic', 'deadly'];

export function isDangerousToEat(edibility: Edibility): boolean {
  return DANGEROUS_EDIBILITY.includes(edibility);
}

export function isInMonth(month: number, start: number, end: number) {
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end;
}

function markerClass(inSeason: boolean, peak: boolean, dangerous: boolean) {
  if (!inSeason && !peak) return 'bg-gray-200';
  if (dangerous) return peak ? 'bg-red-800' : 'bg-red-300';
  return peak ? 'bg-forest-700' : 'bg-forest-300';
}

interface YearTableProps {
  species: CalendarSpecies[];
  /** Leserens språk — tres inn eksplisitt fra siden (server-side getLocale). */
  locale: string;
  /** 1–12. */
  currentMonth: number;
}

export function YearTable({ species, locale, currentMonth }: YearTableProps) {
  const t = useTranslations('Calendar');

  return (
    <article className="space-y-3 rounded-2xl bg-white p-4 shadow-card">
      <div>
        <h2 className="font-serif text-xl font-bold text-forest-900">{t('wholeYear')}</h2>
        <p className="text-xs text-gray-600">{t('wholeYearSubtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-forest-700" /> {t('legendPeak')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-forest-300" /> {t('legendInSeason')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-red-800" /> {t('legendDangerous')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-gray-200" /> {t('legendOff')}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-600">
              <th className="sticky left-0 bg-white py-1 pr-2 font-normal">{t('columnSpecies')}</th>
              {MONTH_KEYS.map((monthKey, idx) => (
                <th
                  key={monthKey}
                  className={`px-1 text-center font-normal ${idx + 1 === currentMonth ? 'font-semibold text-forest-800' : ''}`}
                >
                  {t(monthKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {species.map((s) => {
              const dangerous = isDangerousToEat(s.edibility);
              return (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="sticky left-0 bg-white py-1 pr-2 font-medium">
                    <Link href={`/species/${s.id}`} className="text-forest-900 hover:underline">
                      {getSpeciesDisplayName(s, locale)}
                    </Link>
                    <span className="mt-0.5 flex">
                      <EdibilityBadge edibility={s.edibility} />
                    </span>
                  </td>
                  {MONTH_KEYS.map((_, idx) => {
                    const m = idx + 1;
                    const inSeason = isInMonth(m, s.season_start, s.season_end);
                    const peak =
                      s.peak_season_start !== null &&
                      s.peak_season_end !== null &&
                      isInMonth(m, s.peak_season_start, s.peak_season_end);
                    return (
                      <td key={m} className={`px-1 py-1 ${m === currentMonth ? 'bg-forest-50' : ''}`}>
                        <div className={`mx-auto h-3 w-3 rounded-sm ${markerClass(inSeason, peak, dangerous)}`} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}
