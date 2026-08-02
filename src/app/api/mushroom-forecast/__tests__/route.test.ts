import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { computeSoilMoistureIndex } from '@/lib/weather/soil-moisture';
import type { WeatherSummary } from '@/lib/weather';
import type { DailyForecast } from '@/lib/weather/forecast';

/**
 * Samme poengsum, motsatt farge på nabodager.
 *
 * Ruta sendte soilMoistureIndex for dag 0, men ikke for dag 1-6. Fuktvetoet i
 * assessMushroomDay er inert når tallet mangler, så det var strukturelt dødt for
 * hele prognosen: enhver prognosedag med score >= 65 ble grønn uansett hvor tørr
 * bakken var.
 *
 * Slik så det ut på Nesodden: i dag {score: 83, optimal: false} tegnet GULT ved
 * siden av i morgen {score: 75, optimal: true} tegnet GRØNT — med tallene
 * skrevet rett over søylene (MushroomDayCard.tsx og PlaceForecastStrip.tsx
 * fargelegger på `optimal`). Brukeren planlegger turen til den dårligere dagen
 * fordi den er den eneste grønne.
 *
 * Testene går gjennom HELE ruta, ikke bare mushroom-day-biblioteket, fordi feilen
 * lå i koblingen: et veto som aldri får tall å jobbe med, fikser ingenting.
 */

const I_DAG = '2026-09-15'; // september — midt i sesongen, så månedsgatet er åpent

let observed: WeatherSummary | null = null;
let forecast: DailyForecast[] = [];

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});

vi.mock('@/lib/weather', () => ({ fetchWeatherSummary: async () => observed }));
vi.mock('@/lib/weather/forecast', () => ({ fetchDailyForecast: async () => forecast }));

const { GET } = await import('../route');

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${I_DAG}T09:00:00Z`));
});

afterAll(() => {
  vi.useRealTimers();
});

interface Søyle {
  date: string;
  score: number;
  optimal: boolean;
  isToday: boolean;
}

function sum(v: number[]) {
  return v.reduce((a, b) => a + b, 0);
}

/** Dato n døgn etter I_DAG. */
function dato(n: number) {
  const d = new Date(`${I_DAG}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Observert vær bygget fra en ekte døgnserie — inkludert fuktindeksen, som
 * regnes ut med den samme funksjonen adapterne bruker. Testen får da ikke
 * lov til å finne på en fuktverdi som ikke følger av nedbøren.
 */
function observert(precipDaily: number[], tempC: number, humidityPct: number): WeatherSummary {
  return {
    source: 'met_frost',
    temperatureC: tempC,
    humidityPct,
    rain3dMm: sum(precipDaily.slice(-3)),
    rain7dMm: sum(precipDaily.slice(-7)),
    rain14dMm: sum(precipDaily.slice(-14)),
    minTemp7dC: tempC - 4,
    maxTemp7dC: tempC + 4,
    soilMoistureIndex: computeSoilMoistureIndex(precipDaily, tempC),
    precipDailyMm: precipDaily
  };
}

function prognose(dager: { precipMm: number; tempC: number; humidityPct: number }[]): DailyForecast[] {
  return dager.map((d, i) => ({ date: dato(i + 1), ...d }));
}

let klient = 0;
async function stripe(lat: number): Promise<Søyle[]> {
  klient += 1;
  const res = await GET(
    new NextRequest(`https://mycelet.com/api/mushroom-forecast?lat=${lat}&lon=10.65`, {
      headers: { 'x-forwarded-for': `10.3.0.${klient}` }
    })
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.days as Søyle[];
}

/**
 * Fargen må aldri motsi tallet mellom to søyler i samme stripe: en dag med
 * høyere poengsum kan ikke stå gul ved siden av en dag med lavere poengsum
 * som står grønn.
 */
function motsigelse(days: Søyle[]): string | null {
  for (const gul of days) {
    for (const grønn of days) {
      if (!gul.optimal && grønn.optimal && gul.score > grønn.score) {
        return `${gul.score} tegnes gul ved siden av ${grønn.score} som tegnes grønn`;
      }
    }
  }
  return null;
}

describe('Nesodden: 83 gul ved siden av 75 grønn', () => {
  // 45 mm for sju døgn siden, så tørt og varmt. Regnsummen over 14 døgn står
  // fortsatt høyt (den er treg), men bakken har rukket å tørke ut.
  const NESODDEN = 59.78;
  const nesoddenStripe = async () => {
    observed = observert([0, 0, 0, 0, 0, 0, 45, 0, 0, 0, 0, 0, 0, 0], 20, 70);
    forecast = prognose(Array.from({ length: 6 }, () => ({ precipMm: 0, tempC: 20, humidityPct: 60 })));
    return stripe(NESODDEN);
  };

  it('gjenskaper dagens tall: i dag 83 og ikke optimal', async () => {
    const days = await nesoddenStripe();
    expect(days[0]).toMatchObject({ isToday: true, score: 83, optimal: false });
    // Vetoet er ikke tilfeldig: bakken ER tørr, selv om 14-døgnssummen sier 45 mm.
    expect(observed!.soilMoistureIndex!).toBeLessThan(0.55);
  });

  it('i morgen har lavere poengsum og kan derfor ikke være den eneste grønne', async () => {
    const days = await nesoddenStripe();
    expect(days[1].score).toBe(75);
    expect(days[1].score).toBeLessThan(days[0].score);
    expect(days[1].optimal).toBe(false);
  });

  it('ingen søyle i stripen motsier tallet sitt', async () => {
    expect(motsigelse(await nesoddenStripe())).toBeNull();
  });

  it('bedømmer alle sju dagene på fukt, ikke bare den første', async () => {
    const days = await nesoddenStripe();
    expect(days).toHaveLength(7);
    // Bakken tørker videre hele uka — da skal ingen dag feires.
    expect(days.every((d) => d.optimal === false)).toBe(true);
  });
});

describe('konstant vær i sju døgn', () => {
  it('gir sju identiske søyler når bakken er tørr', async () => {
    // 1,5 mm/døgn ved 18 °C fordamper raskere enn det regner: 21 mm på 14 døgn
    // ser vått ut som sum, men bøtta er tom.
    observed = observert(Array(14).fill(1.5), 18, 85);
    forecast = prognose(Array.from({ length: 6 }, () => ({ precipMm: 1.5, tempC: 18, humidityPct: 85 })));
    const days = await stripe(59.6);

    expect(days).toHaveLength(7);
    const fasit = { score: days[0].score, optimal: days[0].optimal };
    expect(fasit).toEqual({ score: 90, optimal: false });
    for (const d of days) {
      expect({ score: d.score, optimal: d.optimal }).toEqual(fasit);
    }
  });

  it('gir sju identiske søyler når bakken er våt', async () => {
    // Samme krav den andre veien: fiksen skal ikke bare slukke alt grønt.
    observed = observert(Array(14).fill(6), 12, 85);
    forecast = prognose(Array.from({ length: 6 }, () => ({ precipMm: 6, tempC: 12, humidityPct: 85 })));
    const days = await stripe(59.4);

    const fasit = { score: days[0].score, optimal: days[0].optimal };
    expect(fasit).toEqual({ score: 100, optimal: true });
    for (const d of days) {
      expect({ score: d.score, optimal: d.optimal }).toEqual(fasit);
    }
  });
});

describe('når regnet kommer midt i uka', () => {
  // Tørr bakke, så to døgn med 22 mm. Dette er dagen fiksen skal la stå grønn.
  const værskifte = async () => {
    observed = observert(Array(14).fill(0), 14, 85);
    forecast = prognose([
      { precipMm: 0, tempC: 14, humidityPct: 85 },
      { precipMm: 22, tempC: 14, humidityPct: 85 },
      { precipMm: 22, tempC: 14, humidityPct: 85 },
      { precipMm: 0, tempC: 14, humidityPct: 85 },
      { precipMm: 0, tempC: 14, humidityPct: 85 },
      { precipMm: 0, tempC: 14, humidityPct: 85 }
    ]);
    return stripe(59.2);
  };

  it('lar dagene etter gjennombløtingen bli grønne', async () => {
    const days = await værskifte();
    expect(days.slice(3).every((d) => d.optimal)).toBe(true);
  });

  it('venter til bakken faktisk er våt — første regndøgn er ikke nok', async () => {
    const days = await værskifte();
    // 22 mm på en uttørket bakke løfter bøtta til ~0,39 — under terskelen på 0,55.
    // Uten fiksen ble denne dagen grønn utelukkende fordi fukttallet manglet.
    expect(days[2].optimal).toBe(false);
  });

  it('ingen søyle i stripen motsier tallet sitt', async () => {
    expect(motsigelse(await værskifte())).toBeNull();
  });
});
