import type { WeekDayScore } from '@/lib/prediction/week-scores';
import type { Locale } from '@/i18n/config';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import { pickBestForecastDay } from '@/lib/utils/forecast-best-day';

/**
 * Ekstrainnholdet i varsel-eposten: toppdagen fremover og artene i sesong.
 *
 * Begge er RENE funksjoner over data cron-jobben likevel kan hente, slik at
 * de kan testes uten vær-API og database. Og begge er STRENGT valgfrie i
 * e-posten: feiler innhentingen, sendes varselet som før — omslaget er
 * nyheten, resten er krydder. Et varsel som uteble fordi en prognose-tjeneste
 * nøs, ville brutt selve løftet i decision.ts.
 */

export interface Toppdag {
  /** Ukedagsetiketten slik uke-stripa selv viser den («tor», «I dag», …). Ved likhet: den tidligste. */
  dag: string;
  score: number;
  erIDag: boolean;
  /** Alle dagene som deler toppscoren (tidligste først) — tom når én dag vinner alene. */
  delteDager: string[];
  /** true når HELE uka har samme score — da finnes ingen «beste dag» å nevne. */
  jevn: boolean;
}

/**
 * Beste dag i uka som kommer — samme tall og samme regler som 7-dagersstripa
 * (pickBestForecastDay), så e-posten og appen aldri motsier hverandre.
 *
 * Ved likhet peker `dag` fortsatt på den TIDLIGSTE («best torsdag» når lørdag
 * også har 91 ville sendt folk senere ut enn nødvendig), men e-posten skal
 * si at dagene er like gode. Og en helt jevn uke er ikke «i dag er ukas beste
 * dag» — 63 % av sesongukene har delt toppscore (forecast-bars.ts), så det
 * ville stått i de fleste varslene. Områdesiden unngår den artefakten alt.
 */
export function velgToppdag(days: WeekDayScore[]): Toppdag | null {
  if (days.length === 0) return null;
  const valg = pickBestForecastDay(days);
  const forsteIndeks = valg.tiedIndexes[0] ?? 0;
  const beste = days[forsteIndeks];
  const jevn = days.length > 1 && valg.tiedIndexes.length === days.length;
  return {
    dag: beste.label,
    score: beste.score,
    erIDag: beste.isToday,
    delteDager: valg.tiedIndexes.length > 1 ? valg.tiedIndexes.map((i) => days[i].label) : [],
    jevn
  };
}

export interface SesongArt {
  norwegian_name: string;
  swedish_name: string | null;
  season_start: number | null;
  season_end: number | null;
  peak_season_start: number | null;
  peak_season_end: number | null;
  commonality: string | null;
}

/** Måned-i-intervall med årsskifte-vikling — samme logikk som species_in_season-viewet. */
function iIntervall(month: number, start: number | null, end: number | null): boolean {
  if (start == null || end == null) return false;
  return start <= end ? month >= start && month <= end : month >= start || month <= end;
}

const VANLIGHET: Record<string, number> = { very_common: 0, common: 1, uncommon: 2 };

/**
 * Inntil `maks` spiselige arter i sesong denne måneden, mest matnyttige først:
 * toppsesong slår vanlig sesong, og vanlige arter slår sjeldne. Navnene er
 * ferdig lokalisert — svensk faller stille tilbake til norsk der oversettelsen
 * mangler (samme regel som overalt ellers, se species-name.ts).
 */
export function arterISesong(arter: SesongArt[], month: number, locale: Locale, maks = 3): string[] {
  return arter
    .filter((a) => iIntervall(month, a.season_start, a.season_end))
    .sort((a, b) => {
      const peakA = iIntervall(month, a.peak_season_start, a.peak_season_end) ? 0 : 1;
      const peakB = iIntervall(month, b.peak_season_start, b.peak_season_end) ? 0 : 1;
      if (peakA !== peakB) return peakA - peakB;
      return (VANLIGHET[a.commonality ?? ''] ?? 3) - (VANLIGHET[b.commonality ?? ''] ?? 3);
    })
    .slice(0, maks)
    .map((a) => getSpeciesDisplayName(a, locale).toLowerCase());
}
