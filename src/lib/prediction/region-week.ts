import type { WeatherSummary } from '@/lib/weather';
import type { DailyForecast } from '@/lib/weather/forecast';
import { buildWeek, filterUpcomingDays } from './week-scores';
import { forecastBarHeights, isFlatWeek } from '@/lib/utils/forecast-bars';
import { pickBestForecastDay } from '@/lib/utils/forecast-best-day';

/**
 * «Uka framover» for områdesidene under /soppforhold: sju søyler og en
 * navngitt toppdag, regnet i regionens sentrum med samme delte ukeberegning
 * som forsiden (week-scores.ts).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVORFOR STRIPEN IKKE VISER TALL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Områdets publiserte dagstall er p90 over rasterrutene (vær + skog + habitat
 * + artsfenologi). Ukeberegningen her er vær + sesong i ett punkt. To modeller
 * på samme side ville gitt to ulike tall for «i dag» — akkurat den typen
 * selvmotsigelse forecast-scale.ts og flush-vs-week.ts ble skrevet for å
 * fjerne. Derfor trykker stripen ALDRI score-tall og bruker ingen absolutte
 * farger: den viser bare søylehøyder relativt til ukas egne dager, og navngir
 * toppdagen. Å rangere dager mot hverandre på samme sted er nøyaktig det den
 * temporale modellen er validert for (AUC 0,88 er rangeringsevne) — å
 * kalibrere tall på tvers av modeller er det ikke.
 *
 * Uavgjort behandles som uavgjort (62,8 % av ukene i sesong har delt maks —
 * se forecast-best-day.ts): da pekes det ikke på en tilfeldig vinner.
 *
 * Språket følger landet, som resten av områdesidene.
 */

export interface RegionWeekDay {
  date: string;
  /** Kort etikett under søylen («I dag», «tor»/«tors»). */
  label: string;
  isToday: boolean;
  /** Søylehøyde i prosent, fra forecastBarHeights (bunn 14, tak 100). */
  heightPct: number;
  /** Del av toppen — utheves i stripen (kan være flere ved uavgjort). */
  erTopp: boolean;
}

export interface RegionWeek {
  heading: string;
  days: RegionWeekDay[];
  /** Setningen under stripen: navngitt toppdag, uavgjort eller jevn uke. */
  line: string;
  /** Ærlighetslinjen — hva søylene er og ikke er. */
  honesty: string;
}

const UKEDAG_LANG: Record<'NO' | 'SE', string[]> = {
  NO: ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'],
  SE: ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag']
};

const COPY: Record<
  'NO' | 'SE',
  {
    heading: string;
    bestIdag: string;
    bestDag: (dag: string) => string;
    uavgjortTo: (a: string, b: string) => string;
    /** Navngir de delte toppdagene — se kommentaren ved kallet. */
    uavgjortFlere: (dager: string[]) => string;
    /** Reserve når for mange dager deler toppen til at en oppramsing er lesbar. */
    uavgjortMange: string;
    jevn: string;
    honesty: string;
  }
> = {
  NO: {
    heading: 'Uka framover',
    bestIdag: 'Ser best ut i dag.',
    bestDag: (dag) => `Ser best ut på ${dag}.`,
    uavgjortTo: (a, b) => `${a.charAt(0).toUpperCase()}${a.slice(1)} og ${b} ser like gode ut.`,
    uavgjortFlere: (dager) =>
      dager.length > 0
        ? `${dager.slice(0, -1).join(', ')} og ${dager[dager.length - 1]} deler toppen denne uka.`
        : 'Flere dager deler toppen denne uka.',
    uavgjortMange: 'Flere dager deler toppen denne uka.',
    jevn: 'Jevne forhold hele uka — ingen klar toppdag.',
    honesty: 'Søylene rangerer ukas dager mot hverandre ut fra vær og sesong i området — de er ikke tall, og de sammenligner ikke områder.'
  },
  SE: {
    heading: 'Veckan framöver',
    bestIdag: 'Ser bäst ut idag.',
    bestDag: (dag) => `Ser bäst ut på ${dag}.`,
    uavgjortTo: (a, b) => `${a.charAt(0).toUpperCase()}${a.slice(1)} och ${b} ser lika bra ut.`,
    uavgjortFlere: (dager) =>
      dager.length > 0
        ? `${dager.slice(0, -1).join(', ')} och ${dager[dager.length - 1]} delar toppen den här veckan.`
        : 'Flera dagar delar toppen den här veckan.',
    uavgjortMange: 'Flera dagar delar toppen den här veckan.',
    jevn: 'Jämna förhållanden hela veckan — ingen tydlig toppdag.',
    honesty: 'Staplarna rangordnar veckans dagar mot varandra utifrån väder och säsong i området — de är inte tal, och de jämför inte områden.'
  }
};

/** Ukedagsnavn i løpende tekst («på torsdag»), eller «i dag» for dag 0. */
function dagnavn(dato: string, indeks: number, land: 'NO' | 'SE'): string {
  if (indeks === 0) return land === 'SE' ? 'idag' : 'i dag';
  return UKEDAG_LANG[land][new Date(`${dato}T12:00:00Z`).getUTCDay()];
}

/**
 * Setningen under stripen, og hvilke søyler som skal utheves.
 *
 * Eksportert fordi det er her forgreningene ligger — testene treffer den
 * direkte i stedet for å lokke fram uavgjort gjennom værmodellen.
 *
 * Rekkefølgen er bevisst: jevn uke sjekkes FØRST, så en uke der alle sju deler
 * toppen ikke utheves som «syv toppdager».
 */
export function beskrivToppdag(
  days: readonly { date: string }[],
  scores: number[],
  land: 'NO' | 'SE'
): { line: string; toppIndekser: readonly number[] } {
  const t = COPY[land];
  const best = pickBestForecastDay(scores.map((score) => ({ score })));

  if (isFlatWeek(scores)) {
    // Jevn uke: ingen dag er «dagen» — og da utheves heller ingen søyle.
    return { line: t.jevn, toppIndekser: [] };
  }
  if (best.index != null) {
    const line =
      best.index === 0 ? t.bestIdag : t.bestDag(dagnavn(days[best.index].date, best.index, land));
    return { line, toppIndekser: [best.index] };
  }
  if (best.tiedIndexes.length === 2) {
    const [a, b] = best.tiedIndexes;
    return {
      line: t.uavgjortTo(dagnavn(days[a].date, a, land), dagnavn(days[b].date, b, land)),
      toppIndekser: best.tiedIndexes
    };
  }
  // Dagene MÅ navngis her. Søylene er aria-hidden, så setningen er alt en
  // skjermleser får: «flere dager deler toppen» uten navn er en påstand
  // brukeren ikke kan følge opp. Over fire dager blir oppramsingen selv
  // uleselig, og da er «flere» det ærligste vi kan si.
  const navn = best.tiedIndexes.map((i) => dagnavn(days[i].date, i, land));
  if (navn.length > 4) return { line: t.uavgjortMange, toppIndekser: best.tiedIndexes };
  const oppramset = t.uavgjortFlere(navn);
  return {
    line: `${oppramset.charAt(0).toUpperCase()}${oppramset.slice(1)}`,
    toppIndekser: best.tiedIndexes
  };
}

/**
 * null når stripen ikke kan bære sitt eget budskap: uten prognosedager finnes
 * det ingen uke å rangere, og da skal siden se ut som før — stripen er
 * valgfri, aldri en feilkilde.
 */
export function computeRegionWeek(
  observed: WeatherSummary,
  forecast: DailyForecast[] | null,
  opts: { land: 'NO' | 'SE'; now: Date }
): RegionWeek | null {
  const { land, now } = opts;
  const todayKey = now.toISOString().slice(0, 10);
  const future = filterUpcomingDays(forecast, todayKey);
  if (future.length < 3) return null; // under fire søyler er ingen «uke»

  const t = COPY[land];
  const locale = land === 'SE' ? 'sv' : 'nb';
  const { days } = buildWeek(observed, future, {
    todayKey,
    month: now.getMonth() + 1,
    dayOfMonth: now.getDate(),
    locale
  });

  const scores = days.map((d) => d.score);
  const heights = forecastBarHeights(scores);
  const { line, toppIndekser } = beskrivToppdag(days, scores, land);

  return {
    heading: t.heading,
    days: days.map((d, i) => ({
      date: d.date,
      // De svenske områdesidene skriver «idag» overalt ellers (h1, tittel,
      // delingsbilde), mens appens delte sv-strenger bruker «I dag». Begge er
      // korrekt svensk, men tre skrivemåter i samme skjermbilde leses som
      // slurv på en side hvis produkt er troverdighet. Omskrives bare her —
      // TODAY_LABEL er delt med forsiden og skal stå.
      label: d.isToday && land === 'SE' ? 'Idag' : d.label,
      isToday: d.isToday,
      heightPct: Math.round(heights[i] * 10) / 10,
      erTopp: toppIndekser.includes(i)
    })),
    line,
    honesty: t.honesty
  };
}
