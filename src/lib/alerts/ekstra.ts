import type { WeekDayScore } from '@/lib/prediction/week-scores';
import type { Locale } from '@/i18n/config';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';

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
  /** Ukedagsetiketten slik uke-stripa selv viser den («tor», «I dag», …). */
  dag: string;
  score: number;
  erIDag: boolean;
}

/**
 * Beste dag i uka som kommer — samme tall som 7-dagersstripa på forsiden, så
 * e-posten og appen aldri motsier hverandre. Ved likhet vinner den TIDLIGSTE
 * dagen: «best torsdag (91)» når lørdag også har 91 ville sendt folk senere
 * ut enn nødvendig, og sopp venter ikke.
 */
export function velgToppdag(days: WeekDayScore[]): Toppdag | null {
  if (days.length === 0) return null;
  let beste = days[0];
  for (const d of days) if (d.score > beste.score) beste = d;
  return { dag: beste.label, score: beste.score, erIDag: beste.isToday };
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
