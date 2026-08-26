import type { WeatherSummary } from '@/lib/weather';
import type { DailyForecast } from '@/lib/weather/forecast';
import { assessMushroomDay, type MushroomDayAssessment } from '@/lib/prediction/mushroom-day';
import { observedRainWindows, rainWindowsFromSeries } from '@/lib/weather/windows';
import { advanceSoilMoistureIndex } from '@/lib/weather/soil-moisture';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

/**
 * Den delte 7-dagersberegningen: i dag + inntil 6 prognosedager, alle målt med
 * SAMME haleregnvinduer fra én sammenhengende døgnserie (observert fortid +
 * prognose), og med fuktbøtta flyttet ett døgn av gangen fremover.
 *
 * Trukket ut av /api/mushroom-forecast (forsiden) slik at områdesidene under
 * /soppforhold kan vise samme uke uten å duplisere logikken. Historikken bak
 * hver detalj — énvindusregelen, det glidende sesongleddet, fuktvandringen —
 * står i kommentarene under og i mushroom-forecast/route.ts; testene som låser
 * atferden ligger i mushroom-forecast/__tests__/route.test.ts.
 */

// Korte ukedagsetiketter for stripene. Skrevet ut i stedet for Intl så de
// norske står som de alltid har stått (Intl har punktum bak) og de svenske er
// dem en svensk leser venter seg (lör/sön/tis, ikke lør/søn/tir).
export const WEEKDAYS: Record<Locale, string[]> = {
  nb: ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'],
  sv: ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör']
};
export const TODAY_LABEL: Record<Locale, string> = { nb: 'I dag', sv: 'I dag' };

export interface WeekDayScore {
  date: string;
  label: string;
  isToday: boolean;
  score: number;
  optimal: boolean;
}

/** Prognosedager strengt etter i dag, maks 6 — dag 0 kommer fra observert vær. */
export function filterUpcomingDays(forecast: DailyForecast[] | null, todayKey: string): DailyForecast[] {
  return (forecast ?? []).filter((d) => d.date > todayKey).slice(0, 6);
}

export interface WeekResult {
  /** Full dagsvurdering for i dag — forsiden viser tittel/melding fra denne. */
  today: MushroomDayAssessment;
  /** I dag + inntil 6 prognosedager, i rekkefølge. */
  days: WeekDayScore[];
}

export function buildWeek(
  observed: WeatherSummary,
  future: DailyForecast[],
  opts: { todayKey: string; month: number; dayOfMonth: number; locale: Locale }
): WeekResult {
  const { todayKey, month, dayOfMonth } = opts;
  const locale = opts.locale;

  // ÉN målestokk for alle sju dagene. `series` er observert døgnnedbør fulgt
  // av prognosens, så dag 0 og dag 6 måles likt: de N siste døgnene som ender
  // på dagen. Å blande adapterens egen 14-døgnssum inn i dag 0 ville
  // gjeninnført trappetrinnet mellom i dag og i morgen under uendret vær —
  // se historikken i mushroom-forecast/route.ts.
  const observedSeries = observed.precipDailyMm?.slice(-14) ?? null;
  const series = observedSeries ? [...observedSeries, ...future.map((d) => d.precipMm)] : null;
  const obsLen = observedSeries?.length ?? 0;

  const today = assessMushroomDay(
    {
      temperatureC: observed.temperatureC,
      humidityPct: observed.humidityPct,
      // Delt hjelper, så /api/mushroom-day melder samme tall for samme dag og sted.
      ...observedRainWindows(observed),
      minTemp7dC: observed.minTemp7dC,
      maxTemp7dC: observed.maxTemp7dC,
      // Bøttemodellen tørker ut i takt med bakken og kan nedlegge veto mot en
      // feiring råregnsummen ellers ville tillatt. Se mushroom-day.ts.
      soilMoistureIndex: observed.soilMoistureIndex,
      // Døgnserien gir «Siste regn: 12mm for 4 dager siden»-linja — summene
      // alene kan ikke datere regnet. Kun dag 0: prognosedager viser ingen
      // forklaringslinjer.
      precipDailyMm: observed.precipDailyMm
    },
    month,
    locale,
    // Dagen i måneden gjør sesongleddet glatt over månedsskiftet, så stripen
    // ikke faller et hakk ved midnatt med uendret vær. Se mushroom-day.ts.
    dayOfMonth
  );

  const weekdays = WEEKDAYS[locale] ?? WEEKDAYS[DEFAULT_LOCALE];
  const days: WeekDayScore[] = [
    {
      date: todayKey,
      label: TODAY_LABEL[locale] ?? TODAY_LABEL[DEFAULT_LOCALE],
      isToday: true,
      score: today.score,
      optimal: today.optimal
    }
  ];

  const observedRain7d = observed.rain7dMm ?? observed.rain3dMm * 2;
  let forecastAccum = 0;
  const recent3: number[] = [];

  // Fukta må gli fremover sammen med regnvinduene, ellers dømmes de sju dagene
  // på hver sin målestokk. Uten dette er fuktvetoet i assessMushroomDay inert
  // for dag 1–6 (null slipper alt gjennom), og prognosedager kan tegnes grønne
  // på knusktørr bakke — feilen som ga 83/100 gult ved siden av 75/100 grønt.
  let soilMoistureIndex = observed.soilMoistureIndex;

  future.forEach((d, idx) => {
    const i = idx + 1; // 1..6 dager fram
    forecastAccum += d.precipMm;
    recent3.push(d.precipMm);
    if (recent3.length > 3) recent3.shift();
    const w = series ? series.slice(0, obsLen + i) : null;
    // Samme halevinduer som dag 0 når døgnserien finnes. Reserven under er for
    // leverandører uten døgnhistorikk (OpenWeather): den glir fortsatt ETT
    // vindu per dag, så stripen forblir internt konsistent — bare grovere.
    const windows = w
      ? rainWindowsFromSeries(w)
      : {
          rain3dMm: recent3.reduce((a, b) => a + b, 0),
          rain7dMm: (observedRain7d * Math.max(0, 7 - i)) / 7 + forecastAccum,
          rain14dMm: null
        };
    const dayDate = new Date(`${d.date}T12:00:00Z`);
    soilMoistureIndex = advanceSoilMoistureIndex(soilMoistureIndex, d.precipMm, d.tempC);
    const a = assessMushroomDay(
      {
        temperatureC: d.tempC,
        humidityPct: d.humidityPct,
        ...windows,
        minTemp7dC: null,
        maxTemp7dC: null,
        // Null her (leverandør uten døgnnedbør) lar vetoet være inert — men da
        // er det inert for dag 0 også, så stripen er fortsatt konsistent.
        soilMoistureIndex
      },
      dayDate.getUTCMonth() + 1,
      locale,
      dayDate.getUTCDate()
    );
    days.push({
      date: d.date,
      label: weekdays[dayDate.getUTCDay()],
      isToday: false,
      score: a.score,
      optimal: a.optimal
    });
  });

  return { today, days };
}
