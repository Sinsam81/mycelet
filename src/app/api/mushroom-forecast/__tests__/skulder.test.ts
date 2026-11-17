import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { computeSoilMoistureIndex } from '@/lib/weather/soil-moisture';
import type { WeatherSummary } from '@/lib/weather';
import type { DailyForecast } from '@/lib/weather/forecast';

/**
 * Forsidekortet i skuldrene, gjennom hele ruta.
 *
 * Målt 16. november 2026 (Oslo, ekte data): ringen 69 med «Forholdene er ikke
 * helt optimale akkurat nå», et grønt «Forholdene er modne nå 🍄 — soppen
 * kommer nå. Ta turen ut!» rett under. Dommen og banneret leser nå samme
 * skulder (seasonShoulder), men banneret får bare vite dagen og dommen hvis
 * ruta sender dem — det er koblingen som testes her.
 */

const OPPRINNELIG_SONE = process.env.TZ;
process.env.TZ = 'UTC';

let sprak: 'nb' | 'sv' = 'nb';
let observert: WeatherSummary;
let prognose: DailyForecast[] = [];

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => sprak }));
vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/weather', () => ({ fetchWeatherSummary: async () => observert }));
vi.mock('@/lib/weather/forecast', () => ({ fetchDailyForecast: async () => prognose }));

const { GET } = await import('../route');

/** Jevnt vær i fjorten døgn — fuktindeksen regnes av den samme funksjonen adapterne bruker. */
function vaer(mmPerDogn: number, tempC: number, humidityPct: number): WeatherSummary {
  const serie = Array<number>(14).fill(mmPerDogn);
  return {
    source: 'met_frost',
    temperatureC: tempC,
    humidityPct,
    humidityEstimated: false,
    rain3dMm: 3 * mmPerDogn,
    rain7dMm: 7 * mmPerDogn,
    rain14dMm: 14 * mmPerDogn,
    minTemp7dC: tempC - 3,
    maxTemp7dC: tempC + 3,
    soilMoistureIndex: computeSoilMoistureIndex(serie, tempC),
    precipDailyMm: serie
  };
}

/** Seks prognosedøgn etter `fraOslo`, med samme vær. */
function seksDogn(fraOslo: string, mmPerDogn: number, tempC: number, humidityPct: number): DailyForecast[] {
  return dogn(fraOslo, Array<number>(6).fill(mmPerDogn), tempC, humidityPct);
}

/** Ett prognosedøgn per nedbørstall, fra dagen etter `fraOslo`. */
function dogn(fraOslo: string, mm: number[], tempC: number, humidityPct: number): DailyForecast[] {
  return mm.map((precipMm, i) => {
    const d = new Date(`${fraOslo}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i + 1);
    return { date: d.toISOString().slice(0, 10), tempC, precipMm, humidityPct };
  });
}

interface Svar {
  today: { score: number; optimal: boolean; title: string };
  days: Array<{ date: string; score: number; optimal: boolean }>;
  flush: { status: string; title: string; message: string; shoulder?: string; reason?: string };
}

let klient = 0;
async function hent(lat: string): Promise<Svar> {
  klient += 1;
  const res = await GET(
    new NextRequest(`https://mycelet.com/api/mushroom-forecast?lat=${lat}&lon=10.75`, {
      headers: { 'x-forwarded-for': `10.9.0.${klient}` }
    })
  );
  expect(res.status).toBe(200);
  return (await res.json()) as Svar;
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterAll(() => {
  vi.useRealTimers();
  if (OPPRINNELIG_SONE === undefined) delete process.env.TZ;
  else process.env.TZ = OPPRINNELIG_SONE;
});

beforeEach(() => {
  sprak = 'nb';
});

describe('/api/mushroom-forecast i november', () => {
  it('16. november, 69 av 100: dommen og banneret sier begge at det er sent', async () => {
    vi.setSystemTime(new Date('2026-11-16T09:00:00Z'));
    observert = vaer(3.5, 8, 72);
    prognose = seksDogn('2026-11-16', 3.5, 8, 72);

    const { today, flush } = await hent('59.81');
    expect(today).toMatchObject({ score: 69, optimal: false, title: 'Fuktig nok — men sesongen er på hell' });
    expect(flush).toMatchObject({ status: 'fruiting', title: 'Fuktig og mildt — men sent i sesongen', shoulder: 'late' });
    expect(flush.message).not.toMatch(/soppen kommer nå|Ta turen ut/);
  });

  it('svensk leser: samme dag på svensk', async () => {
    sprak = 'sv';
    vi.setSystemTime(new Date('2026-11-16T09:00:00Z'));
    observert = vaer(3.5, 8, 72);
    prognose = seksDogn('2026-11-16', 3.5, 8, 72);

    const { today, flush } = await hent('59.82');
    expect(today.title).toBe('Fuktigt nog — men säsongen är på upphällningen');
    expect(flush.title).toBe('Fuktigt och milt — men sent på säsongen');
  });

  it('en feiret dag tidlig i november feires i banneret også', async () => {
    vi.setSystemTime(new Date('2026-11-03T09:00:00Z'));
    observert = vaer(6, 12, 85);
    prognose = seksDogn('2026-11-03', 6, 12, 85);

    const { today, flush } = await hent('59.83');
    expect(today.optimal).toBe(true);
    expect(today.title).toBe('🍄 Perfekt soppdag i dag!');
    expect(flush.title).toBe('Forholdene er modne nå 🍄');
    expect(flush.shoulder).toBeUndefined();
  });
});

describe('/api/mushroom-forecast: et sent «regn på vei» beholder ordene sine når stripen stiger', () => {
  // Stripen under banneret får en dag som er ≥ 10 poeng bedre (flush-vs-week.ts).
  // Før erstattet det de sene ordene med «… en ny bølge om ~10 dager» — fra
  // 22. november en dato i desember, der dommen sier «Utenom soppsesongen».
  it('22. november: de sene ordene, og ukas topp som tillegg', async () => {
    vi.setSystemTime(new Date('2026-11-22T09:00:00Z'));
    observert = vaer(0.2, 4, 85);
    prognose = dogn('2026-11-22', [0, 10, 0, 0, 0, 0], 6, 90);

    const { days, flush } = await hent('59.89');
    expect(days.map((d) => d.score)).toEqual([32, 41, 50, 50, 49, 48, 47]);
    expect(flush).toMatchObject({ status: 'soon', shoulder: 'late', title: 'Regn på vei — men sent i sesongen' });
    expect(flush.message).toContain('usikkert om soppen rekker å følge etter');
    expect(flush.message).toContain('Flere dager senere i uka ligger merkbart bedre an enn i dag (+18 poeng).');
    expect(flush.message).not.toMatch(/ny bølge|~10 dager/);
  });

  it('27. november: ukas topp er 3. desember, og da står de sene ordene alene', async () => {
    vi.setSystemTime(new Date('2026-11-27T09:00:00Z'));
    observert = vaer(0.2, 5, 85);
    prognose = dogn('2026-11-27', [0, 0, 0, 0, 15, 15], 6, 90);

    const { days, flush } = await hent('59.90');
    const topp = days.reduce((a, b) => (b.score > a.score ? b : a));
    expect(topp.date).toBe('2026-12-03');
    expect(flush).toMatchObject({ status: 'soon', shoulder: 'late', title: 'Regn på vei — men sent i sesongen' });
    expect(flush.message).toBe(
      'Det er meldt regn om 5 dager, men så sent på året er det usikkert om soppen rekker å følge etter før sesongen er over.'
    );
  });
});

describe('/api/mushroom-forecast: «Fuktig nok» står aldri over «Tørt»', () => {
  /**
   * 10. juli, 21 °C, 75 %: to regndøgn (22 og 18 mm) etter en tørr måned, 45 mm
   * på 14 dager, fuktindeks 0,649. Scoren ga temperaturpoeng opp til 22 °C, men
   * banneret kalte forholdene modne bare til 20 (isMildForFlush). Dommen sa
   * «Fuktig nok — men det er tidlig i sesongen — Marka er fuktig …» rett over
   * «Tørt — soppen venter på regn — Lite fukt og ingen regn i sikte». Nå slutter
   * båndet der scoren gjør, på 22 °C. SMHI-kilden er med vilje: i Sverige er
   * temperaturen den siste timesmålingen.
   */
  function varmJulidag(): WeatherSummary {
    const serie = [...Array<number>(16).fill(0), ...Array<number>(10).fill(0.5), 0, 0, 22, 18];
    return {
      source: 'smhi',
      temperatureC: 21,
      humidityPct: 75,
      humidityEstimated: false,
      rain3dMm: 40,
      rain7dMm: 41.5,
      rain14dMm: 45,
      minTemp7dC: 14,
      maxTemp7dC: 25,
      soilMoistureIndex: computeSoilMoistureIndex(serie, 21),
      precipDailyMm: serie
    };
  }

  it('svensk leser, tørr prognose: «Fuktigt nog» over det tidlige «Fuktigt och milt» — ikke «Torrt»', async () => {
    sprak = 'sv';
    vi.setSystemTime(new Date('2026-07-10T09:00:00Z'));
    observert = varmJulidag();
    prognose = dogn('2026-07-10', [1, 1, 1, 1, 1, 1], 19, 70);

    expect(observert.soilMoistureIndex).toBe(0.649);
    const { today, flush } = await hent('59.86');
    // Tallet er det samme som før — og 21 °C gir temperaturpoeng, så banneret kaller det modent.
    expect(today).toMatchObject({ score: 68, optimal: false, title: 'Fuktigt nog — men det är tidigt på säsongen' });
    expect(flush).toMatchObject({
      status: 'fruiting',
      shoulder: 'early',
      title: 'Fuktigt och milt — men tidigt på säsongen'
    });
  });

  it('norsk leser, 22,5 °C og regn i prognosen: «For varmt» over «Fuktig, men varmt» — ikke «Regn på vei»', async () => {
    vi.setSystemTime(new Date('2026-07-10T09:00:00Z'));
    // Over 22 °C gir scoren ingen temperaturpoeng; med 85 % når tallet 65 og navngir varmen.
    observert = { ...varmJulidag(), temperatureC: 22.5, humidityPct: 85 };
    prognose = dogn('2026-07-10', [0, 10, 0, 0, 0, 0], 19, 70);

    const { today, flush } = await hent('59.87');
    expect(today).toMatchObject({ score: 65, optimal: false, title: 'For varmt for sopp akkurat nå' });
    // Marka er fuktig; det er ikke regn som mangler.
    expect(flush).toMatchObject({
      status: 'dormant',
      reason: 'warm',
      title: 'Fuktig, men varmt — soppen venter på kjøligere vær'
    });
  });

  it('samme dag på 22 °C, scorens egen kant: banneret kaller det modent, og da sier dommen «Fuktig nok»', async () => {
    vi.setSystemTime(new Date('2026-07-10T09:00:00Z'));
    observert = { ...varmJulidag(), temperatureC: 22 };
    prognose = dogn('2026-07-10', [1, 1, 1, 1, 1, 1], 19, 70);

    const { today, flush } = await hent('59.88');
    expect(today.title).toBe('Fuktig nok — men det er tidlig i sesongen');
    expect(flush).toMatchObject({ status: 'fruiting', shoulder: 'early' });
  });
});

describe('/api/mushroom-forecast: «Perfekt soppdag» står aldri over «Tørt»', () => {
  /**
   * Meldt: 20. august, 21 °C, 85 %, fuktindeks 0,649, 45 mm på 14 dager og
   * tørr prognose ga score 90 og «🍄 Perfekt soppdag i dag!» rett over «Tørt —
   * soppen venter på regn — Lite fukt og ingen regn i sikte». Scoren ga
   * temperaturpoeng opp til 22 °C; banneret kalte forholdene modne bare til 20.
   * Nå slutter båndet på 22, der scoren gjør. Samme to regndøgn som julidagen
   * over (22 og 18 mm), nå i høysesong.
   */
  function varmAugustdag(tempC: number): WeatherSummary {
    const serie = [...Array<number>(16).fill(0), ...Array<number>(10).fill(0.5), 0, 0, 22, 18];
    return {
      source: 'met_frost',
      temperatureC: tempC,
      humidityPct: 85,
      humidityEstimated: false,
      rain3dMm: 40,
      rain7dMm: 41.5,
      rain14dMm: 45,
      minTemp7dC: 14,
      maxTemp7dC: 25,
      soilMoistureIndex: computeSoilMoistureIndex(serie, 21),
      precipDailyMm: serie
    };
  }

  it('21 °C: samme tall, feiret, og banneret sier det samme — begge språk', async () => {
    vi.setSystemTime(new Date('2026-08-20T09:00:00Z'));
    observert = varmAugustdag(21);
    prognose = dogn('2026-08-20', [0, 0, 0, 0, 0, 0], 19, 70);
    expect(observert.soilMoistureIndex).toBe(0.649);

    const nb = await hent('59.91');
    expect(nb.today).toMatchObject({ score: 90, optimal: true, title: '🍄 Perfekt soppdag i dag!' });
    expect(nb.flush).toMatchObject({ status: 'fruiting', title: 'Forholdene er modne nå 🍄' });
    expect(nb.flush.message).not.toContain('Lite fukt');
    expect(nb.days[0]).toMatchObject({ score: 90, optimal: true });

    sprak = 'sv';
    const sv = await hent('59.92');
    expect(sv.today).toMatchObject({ score: 90, optimal: true, title: '🍄 Perfekt svampdag i dag!' });
    expect(sv.flush).toMatchObject({ status: 'fruiting', title: 'Nu är det läge för svamp 🍄' });
  });

  it('22 °C: scorens egen kant — innenfor båndet feires dagen, og banneret sier det samme', async () => {
    vi.setSystemTime(new Date('2026-08-20T09:00:00Z'));
    observert = varmAugustdag(22);
    prognose = dogn('2026-08-20', [0, 0, 0, 0, 0, 0], 19, 70);

    const { today, flush } = await hent('59.93');
    expect(today).toMatchObject({ score: 90, optimal: true, title: '🍄 Perfekt soppdag i dag!' });
    expect(flush).toMatchObject({ status: 'fruiting', title: 'Forholdene er modne nå 🍄' });
  });

  it('22,5 °C: ingen temperaturpoeng — «For varmt for sopp akkurat nå» over «Fuktig, men varmt», begge språk', async () => {
    vi.setSystemTime(new Date('2026-08-20T09:00:00Z'));
    observert = varmAugustdag(22.5);
    prognose = dogn('2026-08-20', [0, 0, 0, 0, 0, 0], 19, 70);

    const nb = await hent('59.94');
    expect(nb.today).toMatchObject({ score: 80, optimal: false, title: 'For varmt for sopp akkurat nå' });
    expect(nb.flush).toMatchObject({
      status: 'dormant',
      reason: 'warm',
      title: 'Fuktig, men varmt — soppen venter på kjøligere vær'
    });
    expect(nb.flush.message).not.toContain('Lite fukt');
    // Ringen tegnes ikke grønn: grønt krever optimal (forecastBand).
    expect(nb.days[0]).toMatchObject({ score: 80, optimal: false });

    sprak = 'sv';
    const sv = await hent('59.95');
    expect(sv.today).toMatchObject({ score: 80, optimal: false, title: 'För varmt för svamp just nu' });
    expect(sv.flush).toMatchObject({
      status: 'dormant',
      reason: 'warm',
      title: 'Fuktigt, men varmt — svampen väntar på svalare väder'
    });
  });
});

describe('/api/mushroom-forecast: dagen i Oslo avgjør skulderen', () => {
  it('kl. 23.30 14. juli er det tidlig; kl. 00.30 15. juli er det ikke', async () => {
    observert = vaer(3.5, 8, 72);

    vi.setSystemTime(new Date('2026-07-14T21:30:00Z')); // 23.30 i Oslo (sommertid)
    prognose = seksDogn('2026-07-14', 3.5, 8, 72);
    const sen14 = await hent('59.84');
    expect(sen14.today.optimal).toBe(false);
    expect(sen14.flush).toMatchObject({ status: 'fruiting', shoulder: 'early' });

    // Fortsatt 14. juli i UTC — men 15. juli i Oslo, og det er Oslo som gjelder.
    vi.setSystemTime(new Date('2026-07-14T22:30:00Z'));
    prognose = seksDogn('2026-07-15', 3.5, 8, 72);
    const tidlig15 = await hent('59.85');
    expect(tidlig15.today.optimal).toBe(false);
    expect(tidlig15.flush.status).toBe('fruiting');
    expect(tidlig15.flush.shoulder).toBeUndefined();
    expect(tidlig15.flush.title).toBe('Forholdene er modne nå 🍄');
  });
});
