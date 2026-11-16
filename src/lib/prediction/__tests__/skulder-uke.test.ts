import { describe, expect, it } from 'vitest';
import { buildWeek } from '@/lib/prediction/week-scores';
import { assessMushroomDay } from '@/lib/prediction/mushroom-day';
import { assessFlush } from '@/lib/prediction/flush';
import { erUtenomSesongFlush } from '@/components/home/utenom-sesong-flush';
import { computeSoilMoistureIndex } from '@/lib/weather/soil-moisture';
import type { WeatherSummary } from '@/lib/weather';
import type { DailyForecast } from '@/lib/weather/forecast';

/**
 * Sjudagersstripen over de to grensene der ordene skifter:
 *
 *   30. november → 1. desember: «sent i sesongen» → utenom sesongen.
 *   31. juli → 1. august: høysesongens ord på begge sider — de tidlige ordene
 *   sluttet 14. juli (seasonShoulder i mushroom-day.ts).
 *
 * Stripen på forsiden, på Mine steder og på områdesidene tegner tall og farge
 * per dag (score + optimal), ikke dommens ord. buildWeek regner likevel en dom
 * for hver dag, så den skal være riktig for sin EGEN dato om noen tegner den.
 * Tallene er låst mot den gamle utregningen i mushroom-day.test.ts («scoren og
 * optimal-porten er de samme som før»); her sjekkes at stripen er glatt over
 * grensen, og at ordene for hver dag og banneret følger dagens egen dato.
 */

const MM_PER_DØGN = 4;

function observert(tempC: number, humidityPct: number): WeatherSummary {
  const serie = Array<number>(14).fill(MM_PER_DØGN);
  return {
    source: 'met_frost',
    temperatureC: tempC,
    humidityPct,
    humidityEstimated: false,
    rain3dMm: 3 * MM_PER_DØGN,
    rain7dMm: 7 * MM_PER_DØGN,
    rain14dMm: 14 * MM_PER_DØGN,
    minTemp7dC: tempC - 3,
    maxTemp7dC: tempC + 3,
    soilMoistureIndex: computeSoilMoistureIndex(serie, tempC),
    precipDailyMm: serie
  };
}

/** Datoene etter `fra`, ÅÅÅÅ-MM-DD. */
function dagerEtter(fra: string, antall: number): string[] {
  return Array.from({ length: antall }, (_, i) => {
    const d = new Date(`${fra}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i + 1);
    return d.toISOString().slice(0, 10);
  });
}

function uke(fra: string, tempC: number, humidityPct: number) {
  const observed = observert(tempC, humidityPct);
  const future: DailyForecast[] = dagerEtter(fra, 6).map((date) => ({
    date,
    tempC,
    precipMm: MM_PER_DØGN,
    humidityPct
  }));
  const [, maaned, dag] = fra.split('-').map(Number);
  const { today, days } = buildWeek(observed, future, {
    todayKey: fra,
    month: maaned,
    dayOfMonth: dag,
    locale: 'nb'
  });
  return { observed, today, days };
}

/** Dommen og banneret for én dag i stripen, regnet med dagens EGEN dato — slik buildWeek gjør. */
function dagen(dato: string, observed: WeatherSummary) {
  const [, maaned, dag] = dato.split('-').map(Number);
  const dom = assessMushroomDay(
    {
      temperatureC: observed.temperatureC,
      humidityPct: observed.humidityPct,
      rain3dMm: observed.rain3dMm,
      rain7dMm: observed.rain7dMm,
      rain14dMm: observed.rain14dMm,
      soilMoistureIndex: observed.soilMoistureIndex
    },
    maaned,
    'nb',
    dag
  );
  const banner = assessFlush({
    month: maaned,
    dayOfMonth: dag,
    dayOptimal: dom.optimal,
    soilMoistureIndex: observed.soilMoistureIndex,
    rain7dMm: observed.rain7dMm,
    currentTempC: observed.temperatureC,
    forecast: []
  });
  return { dom, banner };
}

const største = (tall: number[]) => Math.max(...tall.slice(1).map((t, i) => Math.abs(t - tall[i])));

describe('stripen over 30. november → 1. desember', () => {
  // 9 °C, 85 %, 4 mm i døgnet: fuktig og mildt — dagen kortet ble målt, bare senere.
  const { observed, today, days } = uke('2026-11-27', 9, 85);

  it('krysser grensen, er glatt over den, og feirer ingen dag', () => {
    expect(days.map((d) => d.date)).toEqual([
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03'
    ]);
    expect(største(days.map((d) => d.score))).toBeLessThanOrEqual(2);
    expect(days.every((d) => !d.optimal)).toBe(true);
    expect(observed.soilMoistureIndex!).toBeGreaterThanOrEqual(0.55);
  });

  it('dommen for i dag sier at sesongen er på hell', () => {
    expect(today.title).toBe('Fuktig nok — men sesongen er på hell');
  });

  it('hver dag får ordene for sin egen dato: sent til og med 30., utenom sesongen fra 1.', () => {
    for (const d of days) {
      const { dom, banner } = dagen(d.date, observed);
      if (d.date <= '2026-11-30') {
        expect(dom.title, d.date).toBe('Fuktig nok — men sesongen er på hell');
        expect(banner.title, d.date).toBe('Fuktig og mildt — men sent i sesongen');
        expect(banner.shoulder, d.date).toBe('late');
      } else {
        expect(dom.title, d.date).toBe('Utenom soppsesongen');
        expect(banner.status, d.date).toBe('dormant');
        // Kortet tegner ikke banneret når det bare gjentar dommen (utenom-sesong-flush.ts).
        expect(erUtenomSesongFlush(banner, dom.title), d.date).toBe(true);
      }
    }
  });
});

describe('stripen over 31. juli → 1. august', () => {
  // 8 °C og 72 %: fuktig, men ikke feiret (rundt 75–78 hele uka).
  const { observed, today, days } = uke('2026-07-28', 8, 72);

  it('krysser grensen og er glatt over den', () => {
    expect(days.map((d) => d.date)).toContain('2026-08-01');
    expect(største(days.map((d) => d.score))).toBeLessThanOrEqual(2);
    expect(days.every((d) => !d.optimal)).toBe(true);
  });

  it('ingen skulderord på noen side av grensen — siste halvdel av juli er ikke «tidlig»', () => {
    expect(today.title).toBe('Soppforhold i dag');
    for (const d of days) {
      const { dom, banner } = dagen(d.date, observed);
      expect(dom.title, d.date).toBe('Soppforhold i dag');
      expect(banner.title, d.date).toBe('Forholdene er modne nå 🍄');
      expect(banner.shoulder, d.date).toBeUndefined();
    }
  });

  it('ordene skifter 14. → 15. juli, der vekten når skuldernivået — tallet gjør ikke noe sprang', () => {
    const { observed: obs, days: juli } = uke('2026-07-12', 14, 72);
    expect(største(juli.map((d) => d.score))).toBeLessThanOrEqual(2);
    expect(dagen('2026-07-14', obs).dom.title).toBe('Fuktig nok — men det er tidlig i sesongen');
    expect(dagen('2026-07-14', obs).banner.shoulder).toBe('early');
    expect(dagen('2026-07-15', obs).dom.title).toBe('Soppforhold i dag');
    expect(dagen('2026-07-15', obs).banner.shoulder).toBeUndefined();
  });
});
