import type { WeekDayScore } from '@/lib/prediction/week-scores';
import type { Locale } from '@/i18n/config';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import { isFlatWeek } from '@/lib/utils/forecast-bars';
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
  /** Datoen (ÅÅÅÅ-MM-DD) for beste dag. Ved likhet: den tidligste. */
  dato: string;
  erIDag: boolean;
  /** Datoene som deler toppen (tidligste først) — tom når én dag vinner alene. */
  delteDatoer: string[];
  /** true når uka er jevn — da finnes ingen «beste dag» å nevne. */
  jevn: boolean;
}

/** Under fire dager finnes ingen «uke» å rangere — samme grense som stripen på områdesiden (region-week.ts). */
const MIN_DAGER_FOR_TOPPDAG = 4;

/**
 * Beste dag i uka som kommer, etter SAMME regler som stripen på områdesiden
 * e-posten lenker til (beskrivToppdag i region-week.ts) — så e-posten og siden
 * aldri motsier hverandre:
 *
 *   · færre enn fire dager (prognosen mangler) → ingen linje. «I dag ser ut til
 *     å bli ukas beste dag» ut fra én dag er ikke en påstand om uka.
 *   · jevn uke (isFlatWeek, spenn under seks poeng) → «jevnt hele uka». En dag
 *     som er to poeng bedre enn resten er ikke dagen å dra ut.
 *   · ellers dagen med høyest score. Ved likhet peker `dato` på den TIDLIGSTE
 *     («best torsdag» når lørdag er like god ville sendt folk senere ut enn
 *     nødvendig), og e-posten sier at dagene er like gode.
 *
 * ⚠️ BÆRER DATOER, ALDRI SCOREN. Scoren her er punkt-dagscoren fra
 * mushroom-day (vær + sesong i regionens sentrum), mens tallet e-posten ellers
 * viser er regionens p90 over rasterrutene. To modeller ga to ulike «av
 * 100»-tall for samme dag i samme e-post — nøyaktig selvmotsigelsen
 * region-week.ts ble skrevet for å fjerne fra områdesiden. Dagene kan RANGERES
 * mot hverandre (det er det den temporale modellen er validert for); tallene
 * kan ikke settes ved siden av regionens. Derfor finnes ikke scoren i typen,
 * så den ikke kan skrives ut ved et uhell. Datoer og ikke stripens korte
 * etiketter («tor», «tors»), så e-posten kan skrive ukedagen fullt ut.
 */
export function velgToppdag(days: WeekDayScore[]): Toppdag | null {
  if (days.length < MIN_DAGER_FOR_TOPPDAG) return null;
  const valg = pickBestForecastDay(days);
  const beste = days[valg.tiedIndexes[0] ?? 0];
  return {
    dato: beste.date,
    erIDag: beste.isToday,
    delteDatoer: valg.tiedIndexes.length > 1 ? valg.tiedIndexes.map((i) => days[i].date) : [],
    jevn: isFlatWeek(days.map((d) => d.score))
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
