import { describe, expect, it } from 'vitest';
import {
  assessMushroomDay,
  flushTemperature,
  isInMushroomSeason,
  isMildForFlush,
  isWetForFlush,
  seasonShoulder,
  seasonWeight
} from '@/lib/prediction/mushroom-day';
import type { ExplanationWeather } from '@/lib/utils/prediction-explanation';
import { forecastBand } from '@/lib/utils/forecast-scale';
import { sesongfaseForManed } from '@/lib/sesong/sesongtilstand';

const base: ExplanationWeather = {
  temperatureC: 14,
  humidityPct: 85,
  rain3dMm: 10,
  rain7dMm: 30,
  rain14dMm: 60,
  minTemp7dC: 8,
  maxTemp7dC: 18
};

describe('assessMushroomDay', () => {
  it('flags a peak-season day with a wet base, mild temp and high humidity as optimal', () => {
    const result = assessMushroomDay(base, 9); // September
    expect(result.optimal).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(65);
    expect(result.title).toContain('Perfekt soppdag');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('never marks deep winter optimal, even with otherwise great weather', () => {
    const result = assessMushroomDay(base, 1); // January
    expect(result.optimal).toBe(false);
    // Sto som toBe('Soppforhold i dag'). Januar er utenfor sesongvinduet, og
    // kortet navngir nå porten som stoppet dagen i stedet for å si generelt at
    // noe ikke stemmer — se verdictFor() i mushroom-day.ts.
    expect(result.title).toBe('Utenom soppsesongen');
  });

  it('is not optimal in season when it has been dry', () => {
    const dry: ExplanationWeather = { ...base, rain3dMm: 0, rain7dMm: 2, rain14dMm: 4 };
    const result = assessMushroomDay(dry, 9);
    expect(result.optimal).toBe(false);
  });

  it('rewards more cumulative rain with a higher score', () => {
    const wet = assessMushroomDay(base, 9).score;
    const drier = assessMushroomDay({ ...base, rain14dMm: 12 }, 9).score;
    expect(wet).toBeGreaterThan(drier);
  });

  it('clamps the score to 0–100', () => {
    const result = assessMushroomDay(base, 9);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('treats the shoulder months (July/November) as in-season but harder', () => {
    const july = assessMushroomDay(base, 7);
    expect(july.score).toBeLessThan(assessMushroomDay(base, 9).score);
  });
});

describe('assessMushroomDay — language', () => {
  it('returns Swedish copy for a Swedish reader', () => {
    const result = assessMushroomDay(base, 9, 'sv');
    expect(result.title).toContain('Perfekt svampdag');
    expect(result.message).toContain('Förhållandena');
    // The data-backed reasons must be translated too — they render on the same card.
    expect(result.reasons.join(' ')).not.toMatch(/regn siste|luftfuktighet — høyt/);
  });

  it('answers in Swedish when the day is not optimal', () => {
    // Poenget er språket, ikke den nøyaktige strengen: januar er utenfor
    // sesongen, og teksten navngir nå den porten.
    const result = assessMushroomDay(base, 1, 'sv');
    expect(result.title).toBe('Utanför svampsäsongen');
    // «Svampsäsongen», ikke «Högsäsongen»: juni er sesongstart, og högsäsong
    // bruker appen om august–oktober (se utenom-sesong-tekst.ts).
    expect(result.message).toContain('Svampsäsongen börjar i juni');
  });

  it('defaults to Norwegian when no locale is given', () => {
    expect(assessMushroomDay(base, 1).title).toBe('Utenom soppsesongen');
  });
});

/**
 * Sesongleddet var en trapp: 35 for aug-okt, 22 for jul/nov, 10 for juni, 0
 * ellers. Med IDENTISK vær ga det et sprang på 13-22 poeng ved midnatt hver 1. i
 * måneden — 31. okt 100, 1. nov 87; 30. nov 87, 1. des 65, og overskriften byttet
 * fra «Perfekt soppdag i dag!» til «Soppforhold i dag». Sju-dagersstripen krysser
 * et månedsskifte seks dager i måneden.
 */
describe('sesongleddet over månedsskiftet', () => {
  it('gir de gamle tallene midt i måneden', () => {
    expect(seasonWeight(9, 15)).toBe(35);
    expect(seasonWeight(7, 15)).toBe(22);
    expect(seasonWeight(6, 15)).toBe(10);
    expect(seasonWeight(2, 15)).toBe(0);
  });

  it('gir de gamle tallene når dagen ikke oppgis (uendret for gamle kallere)', () => {
    for (let m = 1; m <= 12; m++) {
      expect(seasonWeight(m)).toBe(seasonWeight(m, 15));
    }
  });

  it('holder nivået gjennom hele høysesongen', () => {
    // Midten av august til midten av oktober er 35 hele veien.
    expect(seasonWeight(8, 15)).toBe(35);
    expect(seasonWeight(8, 31)).toBe(35);
    expect(seasonWeight(9, 1)).toBe(35);
    expect(seasonWeight(9, 30)).toBe(35);
    expect(seasonWeight(10, 1)).toBe(35);
    expect(seasonWeight(10, 15)).toBe(35);
  });

  it('har ikke lenger et sprang ved midnatt 31. okt → 1. nov', () => {
    const step = Math.abs(seasonWeight(11, 1) - seasonWeight(10, 31));
    expect(step).toBeLessThan(1);
  });

  it('har ikke lenger et sprang ved noe månedsskifte', () => {
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (let m = 1; m <= 12; m++) {
      const next = (m % 12) + 1;
      const step = Math.abs(seasonWeight(next, 1) - seasonWeight(m, daysInMonth[m - 1]));
      expect(step, `månedsskiftet ${m} → ${next}`).toBeLessThan(1.5);
    }
  });

  it('stiger monotont inn i høysesongen og faller monotont ut av den', () => {
    // 1. juli → 15. august: bare oppover.
    const rising = [
      seasonWeight(7, 1),
      seasonWeight(7, 20),
      seasonWeight(8, 1),
      seasonWeight(8, 15)
    ];
    for (let i = 1; i < rising.length; i++) expect(rising[i]).toBeGreaterThan(rising[i - 1]);

    // 15. oktober → 15. desember: bare nedover.
    const falling = [
      seasonWeight(10, 15),
      seasonWeight(11, 1),
      seasonWeight(11, 20),
      seasonWeight(12, 15)
    ];
    for (let i = 1; i < falling.length; i++) expect(falling[i]).toBeLessThan(falling[i - 1]);
  });

  it('fjerner det synlige spranget i selve dagvurderingen', () => {
    const oct31 = assessMushroomDay(base, 10, 'nb', 31).score;
    const nov1 = assessMushroomDay(base, 11, 'nb', 1).score;
    expect(Math.abs(oct31 - nov1)).toBeLessThanOrEqual(1);
  });
});

describe('assessMushroomDay — the moisture veto', () => {
  // A 14-day rain sum stays high long after the ground has dried. Without the
  // bucket model the card would celebrate a day the flush banner calls dry.
  const septemberDrought: ExplanationWeather = {
    temperatureC: 15,
    humidityPct: 85,
    rain3dMm: 0,
    rain7dMm: 0,
    rain14dMm: 71,
    minTemp7dC: 8,
    maxTemp7dC: 18
  };

  it('refuses to celebrate when the ground has dried out', () => {
    const dry = assessMushroomDay({ ...septemberDrought, soilMoistureIndex: 0.2 }, 9);
    expect(dry.optimal).toBe(false);
    // Sto som toBe('Soppforhold i dag') — den generiske. Nå NAVNGIS vetoet, som
    // er hele poenget: 15,8 % av høstdagene hadde score >= 80 og fikk likevel
    // bare «ikke helt optimale», uten å si at det var marka som stoppet dem.
    expect(dry.title).toBe('Alt stemmer — bortsett fra marka');
    // …and must not still list the old rain as a reason to go.
    expect(dry.reasons.join(' ')).not.toMatch(/regn|fuktet/i);
  });

  it('still celebrates when the ground is actually wet', () => {
    const wet = assessMushroomDay({ ...septemberDrought, soilMoistureIndex: 0.8 }, 9);
    expect(wet.optimal).toBe(true);
    expect(wet.title).toContain('Perfekt soppdag');
  });

  it('uses the same 0.55 gate as the flush banner, so the two cannot disagree', () => {
    expect(assessMushroomDay({ ...septemberDrought, soilMoistureIndex: 0.54 }, 9).optimal).toBe(false);
    expect(assessMushroomDay({ ...septemberDrought, soilMoistureIndex: 0.55 }, 9).optimal).toBe(true);
  });

  it('is inert when no moisture index is available', () => {
    // OpenWeather and forecast days have no bucket. Behaviour must be unchanged.
    const withoutField = assessMushroomDay(septemberDrought, 9);
    const explicitlyNull = assessMushroomDay({ ...septemberDrought, soilMoistureIndex: null }, 9);
    expect(withoutField.optimal).toBe(true);
    expect(explicitlyNull).toEqual(withoutField);
  });

  it('can only veto, never promote', () => {
    // A soaked but out-of-season day stays un-celebrated.
    const january = assessMushroomDay({ ...septemberDrought, soilMoistureIndex: 1 }, 1);
    expect(january.optimal).toBe(false);
  });
});

/**
 * Ringen viser 0–100, men teksten hadde bare TO tilstander. Målt over jun–nov
 * (ERA5, 14 steder NO+SE, 2014–2024, n = 28 182 stedsdøgn): nøyaktig 2 distinkte
 * titler, 50 % fikk «ikke helt optimale», og bak den ENE setningen lå score fra
 * 5 til 100. I aug–okt hadde 15,8 % score ≥ 80 uten å være optimale — gul ring
 * med 80–100 over «ikke helt optimale».
 *
 * Vetoet er riktig. Feilen var at kortet ikke sa hvorfor.
 */
describe('ringen og teksten skal peke samme vei', () => {
  const VÅT_MILD_HØST = {
    temperatureC: 12,
    humidityPct: 85,
    rain3dMm: 14,
    rain7dMm: 34,
    rain14dMm: 53
  };

  it('navngir tørr mark når det er den som stopper en høy score', () => {
    // Oslo 2023-09-07, reprodusert: score 100, 52,7 mm regn på 14 dager, men
    // soil = 0,438 → vetoet slo inn og kortet sa bare «ikke helt optimale».
    const d = assessMushroomDay({ ...VÅT_MILD_HØST, soilMoistureIndex: 0.438 }, 9, 'nb');
    expect(d.optimal).toBe(false);
    expect(d.score).toBeGreaterThanOrEqual(65);
    expect(d.title).toContain('marka');
    expect(d.message).toContain('tørr');
    // Den gamle, intetsigende setningen skal ikke stå her lenger.
    expect(d.message).not.toContain('ikke helt optimale');
  });

  it('navngir for lite regn når det er den porten som ryker', () => {
    const d = assessMushroomDay(
      { temperatureC: 13, humidityPct: 82, rain3dMm: 2, rain7dMm: 4, rain14dMm: 6, soilMoistureIndex: 0.7 },
      9,
      'nb'
    );
    if (d.score >= 65) {
      expect(d.optimal).toBe(false);
      expect(d.message).toContain('nedbør');
    }
  });

  it('feirer fortsatt når alle portene er åpne', () => {
    const d = assessMushroomDay({ ...VÅT_MILD_HØST, soilMoistureIndex: 0.75 }, 9, 'nb');
    expect(d.optimal).toBe(true);
    expect(d.title).toContain('Perfekt');
  });

  it('gir flere enn to distinkte titler over et sesongspenn', () => {
    // Det var nøyaktig 2 før. En ring med 100 nivåer trenger mer enn to ord.
    const titler = new Set<string>();
    for (const soil of [0.2, 0.45, 0.6, 0.8]) {
      for (const rain of [3, 12, 40]) {
        for (const md of [1, 9]) {
          titler.add(
            assessMushroomDay(
              { temperatureC: 12, humidityPct: 84, rain3dMm: rain / 4, rain7dMm: rain / 2, rain14dMm: rain, soilMoistureIndex: soil },
              md,
              'nb'
            ).title
          );
        }
      }
    }
    expect(titler.size).toBeGreaterThanOrEqual(3);
  });

  it('svarer på svensk', () => {
    const d = assessMushroomDay({ ...VÅT_MILD_HØST, soilMoistureIndex: 0.438 }, 9, 'sv');
    expect(d.title).toContain('marken');
  });
});

/**
 * REGRESJONSVAKT — overskriften og ringfargen dømmer samme tall.
 *
 * «🍄 Perfekt soppdag i dag!» fyrte på score 65 mens ringen krevde 85 for å bli
 * grønn. Brukeren så altså «Perfekt soppdag» over en GUL ring: uttømmende
 * oppregning av nåbare værkombinasjoner i høysesong ga 31 dager gjennom
 * optimal-porten, hvorav 25 (81 %) ble tegnet gult.
 *
 * 65 lå dessuten under 25-persentilen i appens egen målte sesongfordeling
 * (p25 = 73, median = 86) — «perfekt» kunne fyre på en dag som var dårligere
 * enn fem av seks dager i sesongen.
 */
describe('«perfekt» og fargen kan ikke si hver sin ting', () => {
  const VÆR: Array<[string, Partial<ExplanationWeather>]> = [
    ['vått og mildt', { temperatureC: 14, humidityPct: 88, rain3dMm: 12, rain7dMm: 35, rain14dMm: 60 }],
    ['grensetilfelle', { temperatureC: 14, humidityPct: 70, rain3dMm: 5, rain7dMm: 15, rain14dMm: 25 }],
    ['kjølig og fuktig', { temperatureC: 8, humidityPct: 90, rain3dMm: 8, rain7dMm: 25, rain14dMm: 45 }],
    ['varmt og tørt', { temperatureC: 24, humidityPct: 45, rain3dMm: 0, rain7dMm: 2, rain14dMm: 4 }],
    ['perfekt', { temperatureC: 13, humidityPct: 92, rain3dMm: 15, rain7dMm: 45, rain14dMm: 80 }]
  ];

  it('feirer aldri en dag som ikke også ville fått grønn ring', () => {
    for (let month = 1; month <= 12; month++) {
      for (const [navn, vær] of VÆR) {
        const d = assessMushroomDay({ ...base, ...vær }, month);
        if (!d.optimal) continue;
        expect(
          forecastBand(d.score, d.optimal),
          `${navn} i måned ${month}: score ${d.score} feires som perfekt, men ringen er ikke grønn`
        ).toBe('green');
      }
    }
  });

  it('beholder forklaringen på hvorfor en god dag ikke ble perfekt', () => {
    // 78 poeng med tørr mark skal fortsatt si HVA som mangler — ikke falle
    // tilbake på den intetsigende «ikke helt optimale». Det var nettopp den
    // forrige runde fjernet, og en felles konstant ville tatt den med i fallet.
    const d = assessMushroomDay(
      { ...base, temperatureC: 14, humidityPct: 88, rain3dMm: 12, rain7dMm: 35, rain14dMm: 60, soilMoistureIndex: 0.4 },
      9
    );
    expect(d.optimal).toBe(false);
    expect(d.score).toBeGreaterThanOrEqual(65);
    expect(d.title, 'skal navngi porten som ikke slapp gjennom').toContain('marka');
  });
});

/**
 * Skuldrene: hvor i sesongen dagen ligger, for dommen og banneret samtidig.
 *
 * Målt 16. november 2026 (Oslo, ekte data): ringen sto på 69 med «Forholdene
 * er ikke helt optimale akkurat nå», banneret under sa «Forholdene er modne nå
 * 🍄 — soppen kommer nå. Ta turen ut!», og områdekortet «Det er stille i alle
 * områdene nå». 69 = sesong 21,3 + regn 30 + temperatur 10 + luftfuktighet 8:
 * det som manglet mest, var sesongleddet, og ingen av tekstene sa det.
 */
describe('seasonShoulder', () => {
  const DAGER = [1, 9, 10, 14, 15, 16, 17, 28, 30];

  it('gir riktig skulder for alle tolv måneder', () => {
    for (let month = 1; month <= 12; month++) {
      for (const dag of DAGER) {
        const ventet =
          month === 11 ? 'late' : month === 6 || (month === 7 && dag < 15) ? 'early' : null;
        expect(seasonShoulder(month, dag), `${dag}.${month}`).toBe(ventet);
      }
    }
  });

  it('uten dag regnes dagen som midt i måneden: juni er tidlig, juli ikke', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => seasonShoulder(m))).toEqual([
      null,
      null,
      null,
      null,
      null,
      'early',
      null,
      null,
      null,
      null,
      'late',
      null
    ]);
  });

  it('er låst til den ene sesongkilden og til vekttabellen', () => {
    // Sen = fasen 'ettersesong' i sesongtilstand.ts. Tidlig = fasen 'forsesong'
    // så lenge vekten er under julis eget nivå — aldri en egen månedsliste.
    for (let month = 1; month <= 12; month++) {
      for (const dag of DAGER) {
        const fase = sesongfaseForManed(month);
        expect(seasonShoulder(month, dag) === 'late', `${dag}.${month}`).toBe(fase === 'ettersesong');
        expect(seasonShoulder(month, dag) === 'early', `${dag}.${month}`).toBe(
          fase === 'forsesong' && seasonWeight(month, dag) < seasonWeight(7)
        );
      }
    }
  });

  it('siste halvdel av juli er ikke «tidlig» — kantarellmåneden skal ikke høres dårlig ut', () => {
    expect(seasonShoulder(7, 14)).toBe('early');
    for (let dag = 15; dag <= 31; dag++) expect(seasonShoulder(7, dag), `${dag}. juli`).toBeNull();
  });
});

describe('isMildForFlush', () => {
  it('er bannerets bånd, 3–22 °C med begge ender', () => {
    expect([2.9, 3, 12, 20.5, 22, 22.1, 23, Number.NaN].map(isMildForFlush)).toEqual([
      false,
      true,
      true,
      true,
      true,
      false,
      false,
      false
    ]);
  });

  it('flushTemperature sier hvilken side av båndet', () => {
    expect([-5, 2, 2.9, 3, 21, 22, 22.1, 30].map(flushTemperature)).toEqual([
      'cold',
      'cold',
      'cold',
      'mild',
      'mild',
      'mild',
      'warm',
      'warm'
    ]);
  });

  it('den varme kanten er scorens egen: «for varmt» bare der scoren ikke gir temperaturpoeng', () => {
    // Med kanten på 20 kalte dommen 20,5–22 °C for varmt, mens scoren ga 10 av
    // 20 temperaturpoeng der. Januar, ingen regn og 0 % luftfuktighet: da ER
    // tallet temperaturleddet alene.
    for (let tiendedeler = -50; tiendedeler <= 300; tiendedeler++) {
      const t = tiendedeler / 10;
      const temperaturpoeng = assessMushroomDay(
        { temperatureC: t, humidityPct: 0, rain3dMm: 0, rain7dMm: 0, rain14dMm: 0 },
        1
      ).score;
      if (temperaturpoeng > 0) expect(flushTemperature(t), `${t} °C`).toBe('mild');
      if (flushTemperature(t) === 'warm') expect(temperaturpoeng, `${t} °C`).toBe(0);
    }
    // Kanten selv: 22 °C gir poeng og er mildt, 22,1 °C gir ingen og er varmt.
    expect(assessMushroomDay({ temperatureC: 22, humidityPct: 0, rain3dMm: 0, rain7dMm: 0, rain14dMm: 0 }, 1).score).toBe(10);
    expect(flushTemperature(22)).toBe('mild');
    expect(flushTemperature(22.1)).toBe('warm');
  });
});

describe('isWetForFlush', () => {
  it('fuktindeksen når den finnes, med den samme grensen som fuktvetoet (0,55)', () => {
    expect(isWetForFlush(0.549, 100)).toBe(false);
    expect(isWetForFlush(0.55, 0)).toBe(true);
  });

  it('uten indeks: 7-døgnsregnet, 25 mm ≈ mettet', () => {
    expect(isWetForFlush(null, 13.7)).toBe(false);
    expect(isWetForFlush(null, 13.75)).toBe(true);
    expect(isWetForFlush(undefined, 40)).toBe(true);
  });
});

/**
 * 20. august, 21 °C, 85 %, fuktindeks 0,649, 45 mm på 14 dager: score 90 og
 * «🍄 Perfekt soppdag i dag!» — rett over «Tørt — soppen venter på regn — Lite
 * fukt og ingen regn i sikte». Scoren ga temperaturpoeng opp til 22 °C, men
 * banneret kalte forholdene modne bare til 20.
 *
 * Første rettelse la 20 inn i optimal-porten, og da ble samme dag «For varmt
 * for sopp i dag». I Sverige, der temperaturen er SMHIs siste timesmåling,
 * vekslet en fuktig augustdag mellom «Perfekt» og «For varmt» gjennom dagen.
 * Nå slutter båndet der scoren slutter å gi temperaturpoeng: 22 °C.
 */
describe('temperaturbåndet i optimal-porten og i dommen', () => {
  const MELDT: ExplanationWeather = {
    temperatureC: 21,
    humidityPct: 85,
    rain3dMm: 40,
    rain7dMm: 41.5,
    rain14dMm: 45,
    soilMoistureIndex: 0.649
  };

  it('20. august, 21 °C: feiret — scoren gir temperaturpoeng her, og båndet gjør det samme', () => {
    for (const locale of ['nb', 'sv'] as const) {
      const d = assessMushroomDay(MELDT, 8, locale, 20);
      expect(d.score, locale).toBe(90);
      expect(d.optimal, locale).toBe(true);
      expect(d.title, locale).toBe(locale === 'nb' ? '🍄 Perfekt soppdag i dag!' : '🍄 Perfekt svampdag i dag!');
    }
  });

  it('22 °C feires fortsatt; over 22 °C er det for varmt akkurat nå', () => {
    expect(assessMushroomDay({ ...MELDT, temperatureC: 22 }, 8, 'nb', 20)).toMatchObject({
      score: 90,
      optimal: true,
      title: '🍄 Perfekt soppdag i dag!'
    });
    // 22,5 °C: ingen temperaturpoeng, 35 + 30 + 0 + 15 = 80.
    for (const locale of ['nb', 'sv'] as const) {
      const d = assessMushroomDay({ ...MELDT, temperatureC: 22.5 }, 8, locale, 20);
      expect(d.score, locale).toBe(80);
      expect(d.optimal, locale).toBe(false);
      expect(d.title, locale).toBe(locale === 'nb' ? 'For varmt for sopp akkurat nå' : 'För varmt för svamp just nu');
      expect(d.message, locale).toBe(
        locale === 'nb'
          ? 'Soppen trives best i mildt vær, og akkurat nå er det for varmt.'
          : 'Svampen trivs bäst i milt väder, och just nu är det för varmt.'
      );
    }
  });

  it('kaldt: «For kaldt for sopp akkurat nå», ikke «Alt stemmer» eller den intetsigende', () => {
    // 1 °C en oktobermorgen, fuktig og vått: 35 + 30 + 0 + 15 = 80.
    const kaldt = { ...MELDT, temperatureC: 1 };
    expect(assessMushroomDay(kaldt, 10, 'nb', 10)).toMatchObject({ score: 80, title: 'For kaldt for sopp akkurat nå' });
    expect(assessMushroomDay(kaldt, 10, 'sv', 10).title).toBe('För kallt för svamp just nu');
    // Tørr mark: «Alt stemmer — Vær og sesong er på plass» sto før over «For kaldt akkurat nå».
    expect(assessMushroomDay({ ...kaldt, soilMoistureIndex: 0.3 }, 10, 'nb', 10).title).toBe(
      'For kaldt for sopp akkurat nå'
    );
    // 2,5 °C er under båndet, selv om frostporten i banneret (2 °C) er passert.
    expect(assessMushroomDay({ ...MELDT, temperatureC: 2.5 }, 10, 'nb', 10).title).toBe('For kaldt for sopp akkurat nå');
  });

  it('varmt og tørr mark: ikke «Alt stemmer — Vær og sesong er på plass»', () => {
    const d = assessMushroomDay({ ...MELDT, temperatureC: 25, soilMoistureIndex: 0.3 }, 9, 'nb', 15);
    expect(d.score).toBe(80);
    expect(d.title).toBe('For varmt for sopp akkurat nå');
  });

  it('lite regn: «Mildt nok» står bare der scoren gir temperaturpoeng', () => {
    const liteRegn = { humidityPct: 85, rain3dMm: 2, rain7dMm: 6, rain14dMm: 12, soilMoistureIndex: 0.7 };
    // 21 °C er innenfor båndet: 35 + 10 + 10 + 15 = 70, og forklaringen om regnet står.
    const varm = assessMushroomDay({ temperatureC: 21, ...liteRegn }, 9, 'nb', 15);
    expect(varm.score).toBe(70);
    expect(varm.title).toBe('Mildt nok — men det har regnet for lite');
    // Over 22 °C faller temperaturleddet bort: 35 + 10 + 0 + 15 = 60, under
    // forklaringsterskelen. «Mildt nok» kan altså ikke stå utenfor båndet.
    const forVarm = assessMushroomDay({ temperatureC: 23, ...liteRegn }, 9, 'nb', 15);
    expect(forVarm.score).toBe(60);
    expect(forVarm.title).toBe('Soppforhold i dag');
    expect(assessMushroomDay({ temperatureC: 14, ...liteRegn }, 9, 'nb', 15).title).toBe(
      'Mildt nok — men det har regnet for lite'
    );
  });

  it('under forklaringsterskelen står den vanlige dommen, også utenfor båndet', () => {
    const d = assessMushroomDay({ ...MELDT, temperatureC: 25, humidityPct: 50, rain14dMm: 12 }, 9, 'nb', 15);
    expect(d.score).toBeLessThan(65);
    expect(d.title).toBe('Soppforhold i dag');
  });

  it('temperaturdommene finnes på begge språk, svensk er svensk, og ingen lover funn', () => {
    const tekster = (locale: 'nb' | 'sv') =>
      [1, 25].map((t) => assessMushroomDay({ ...MELDT, temperatureC: t }, 9, locale, 15));
    const nb = tekster('nb');
    const sv = tekster('sv');
    expect(new Set(nb.map((d) => d.title)).size).toBe(2);
    for (let i = 0; i < 2; i++) {
      // Temperaturen kan være én timesmåling (SMHI): titlene sier «akkurat nå»
      // / «just nu», aldri «i dag», som om varmen gjaldt hele dagen.
      expect(nb[i].title).toMatch(/ akkurat nå$/);
      expect(sv[i].title).toMatch(/ just nu$/);
      expect(`${nb[i].title} ${sv[i].title}`).not.toMatch(/i dag/);
      expect(sv[i].title).not.toBe(nb[i].title);
      expect(`${sv[i].title} ${sv[i].message}`).not.toMatch(/[æøÆØ]/);
      expect(`${nb[i].title} ${nb[i].message}`).not.toMatch(/[äöÄÖ]/);
      for (const d of [nb[i], sv[i]]) {
        const tekst = `${d.title} ${d.message}`;
        expect(tekst).not.toContain('🍄');
        expect(tekst).not.toMatch(/ta turen ut|ut i skogen|finner du|hittar du|garanter|kantarell|steinsopp/i);
        // Marka kan være både fuktig og tørr her — dommen sier ingenting om den.
        expect(tekst).not.toMatch(/mark/i);
      }
    }
  });
});

describe('uten fuktindeks: «Fuktig nok» bare der banneret også kaller marka fuktig', () => {
  // OpenWeather har ingen fuktindeks. Dommens fuktveto slipper da alt gjennom,
  // mens banneret leser 7-døgnsregnet (25 mm ≈ mettet).
  const UTEN_INDEKS: ExplanationWeather = {
    temperatureC: 14,
    humidityPct: 85,
    rain3dMm: 1,
    rain7dMm: 5,
    rain14dMm: 25,
    soilMoistureIndex: null
  };

  it('25 mm på 14 dager, men 5 mm på sju: ikke «Marka er fuktig» over et tørt banner', () => {
    const d = assessMushroomDay(UTEN_INDEKS, 6, 'nb', 30);
    expect(d.score).toBeGreaterThanOrEqual(65);
    expect(d.title).toBe('Soppforhold i dag');
  });

  it('når 7-døgnsregnet også sier fuktig, står «Fuktig nok» som før', () => {
    const d = assessMushroomDay({ ...UTEN_INDEKS, rain7dMm: 15 }, 6, 'nb', 30);
    expect(d.title).toBe('Fuktig nok — men det er tidlig i sesongen');
  });
});

/** Den gamle utregningen, ordrett fra før leddene fikk navn. Fasit for at tallet er urørt. */
function gammelScore(w: ExplanationWeather, month: number, day?: number): number {
  let score = 0;
  score += seasonWeight(month, day);
  const rain = w.rain14dMm != null ? w.rain14dMm : w.rain7dMm != null ? w.rain7dMm : w.rain3dMm * 3;
  if (rain >= 40) score += 30;
  else if (rain >= 20) score += 20;
  else if (rain >= 10) score += 10;
  const t = w.temperatureC;
  if (t >= 10 && t <= 18) score += 20;
  else if (t >= 6 && t <= 22) score += 10;
  const h = w.humidityPct;
  if (h >= 80) score += 15;
  else if (h >= 65) score += 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Optimal-porten slik den var før temperaturbåndet kom inn i den. */
function gammelOptimal(w: ExplanationWeather, month: number, day?: number): boolean {
  const rain = w.rain14dMm != null ? w.rain14dMm : w.rain7dMm != null ? w.rain7dMm : w.rain3dMm * 3;
  const fuktig = w.soilMoistureIndex == null || w.soilMoistureIndex >= 0.55;
  return gammelScore(w, month, day) >= 85 && isInMushroomSeason(month) && rain >= 15 && fuktig;
}

/** Bannerets bånd, skrevet ut her — ikke lånt fra koden som testes. */
const I_BÅNDET = (t: number) => t >= 3 && t <= 22;

describe('scoren og optimal er urørt — temperaturbåndet slutter der scoren slutter å gi temperaturpoeng', () => {
  it('over alle tolv måneder, dager, −5 til 30 °C, fukt, regn og luftfuktighet', () => {
    let antall = 0;
    // Avvikene samles i vanlig JS og sjekkes én gang til slutt, som i
    // dom-banner-matrise.test.ts: to expect() per inngang (561 600 kall) tok
    // nesten hele tiden og brukte 20 av 30 sekunder under last. Stedet
    // skrives bare ut for et avvik.
    const avvik: string[] = [];
    const vippet: Array<{ month: number; dag?: number; t: number }> = [];
    // Dagene grensen på 20 °C tok feiringen fra, før kanten ble flyttet til 22.
    const overTjue: Array<{ month: number; dag?: number; t: number; optimal: boolean }> = [];
    for (let month = 1; month <= 12; month++) {
      for (const dag of [undefined, 1, 10, 14, 15, 16, 17, 18, 28, 30]) {
        for (const temperatureC of [...Array.from({ length: 36 }, (_, i) => i - 5), 2.5, 20.5, 21.5]) {
          for (const humidityPct of [50, 70, 85]) {
            for (const rain14dMm of [5, 12, 16, 25, 45]) {
              for (const soilMoistureIndex of [null, 0.3, 0.55, 0.8]) {
                const w: ExplanationWeather = {
                  temperatureC,
                  humidityPct,
                  rain3dMm: rain14dMm / 4,
                  rain7dMm: rain14dMm / 2,
                  rain14dMm,
                  soilMoistureIndex
                };
                const d = assessMushroomDay(w, month, 'nb', dag);
                const score = gammelScore(w, month, dag);
                const før = gammelOptimal(w, month, dag);
                const ventetOptimal = før && I_BÅNDET(temperatureC);
                if (d.score !== score || d.optimal !== ventetOptimal) {
                  avvik.push(
                    `${dag}.${month} ${JSON.stringify(w)}: score ${d.score} (ventet ${score}), optimal ${d.optimal} (ventet ${ventetOptimal})`
                  );
                }
                if (før && !d.optimal) vippet.push({ month, dag, t: temperatureC });
                if (før && temperatureC > 20) overTjue.push({ month, dag, t: temperatureC, optimal: d.optimal });
                antall++;
              }
            }
          }
        }
      }
    }
    expect(avvik.slice(0, 5), `${avvik.length} avvik`).toEqual([]);
    expect(antall).toBe(12 * 10 * 39 * 3 * 5 * 4);
    // Ingen dag mister feiringen. Uten temperaturpoeng er taket 35 + 30 + 15 =
    // 80, og scoren gir ingen utenfor 6–22 °C — som ligger innenfor båndet.
    expect(vippet).toEqual([]);
    // Med kanten på 20 °C mistet 336 av 280 800 innganger (0,12 %) feiringen:
    // 20,5 / 21 / 21,5 / 22 °C × de 28 dagene i august–oktober der sesongvekten
    // gir 85 × 85 % luftfuktighet × 45 mm × fuktig mark (0,55, 0,8 eller uten
    // indeks). Nå feires alle 336, som før båndet kom inn i porten.
    expect(overTjue.length).toBe(336);
    expect(overTjue.every((v) => v.t > 20 && v.t <= 22)).toBe(true);
    expect(overTjue.every((v) => v.month >= 8 && v.month <= 10)).toBe(true);
    expect(overTjue.every((v) => v.optimal)).toBe(true);
  }, 30_000);
});

describe('dommen sier når det er årstiden som holder tallet nede', () => {
  // Dagen kortet ble målt: 69 av 100 16. november.
  const MÅLT_16_NOV: ExplanationWeather = {
    temperatureC: 8,
    humidityPct: 72,
    rain3dMm: 10,
    rain7dMm: 25,
    rain14dMm: 48,
    soilMoistureIndex: 0.8
  };

  it('16. november, 69 av 100: «sesongen er på hell», ikke «ikke helt optimale»', () => {
    const d = assessMushroomDay(MÅLT_16_NOV, 11, 'nb', 16);
    expect(d.score).toBe(69);
    expect(d.optimal).toBe(false);
    expect(d.title).toBe('Fuktig nok — men sesongen er på hell');
    expect(d.message).toContain('årstiden');
    expect(d.message).not.toContain('ikke helt optimale');
    const sv = assessMushroomDay(MÅLT_16_NOV, 11, 'sv', 16);
    expect(sv.score).toBe(69);
    expect(sv.title).toBe('Fuktigt nog — men säsongen är på upphällningen');
    expect(sv.message).toContain('årstiden');
  });

  // Fuktig mark, 48 mm på 14 dager, 14 °C, 72 % — regn 30 + temperatur 20 +
  // luftfuktighet 8 = 58. Det eneste som kan koste mer enn 7, er sesongen.
  const GODT_VÆR: ExplanationWeather = {
    temperatureC: 14,
    humidityPct: 72,
    rain3dMm: 10,
    rain7dMm: 25,
    rain14dMm: 48,
    soilMoistureIndex: 0.8
  };

  it('gir riktig dom for samme vær i alle tolv måneder', () => {
    const ventet: Record<number, string> = {
      1: 'Utenom soppsesongen',
      2: 'Utenom soppsesongen',
      3: 'Utenom soppsesongen',
      4: 'Før hovedsesongen',
      5: 'Før hovedsesongen',
      6: 'Fuktig nok — men det er tidlig i sesongen',
      // 15. juli: høysesongens ord. 80 av 100 og ikke feiret — den vanlige dommen.
      7: 'Soppforhold i dag',
      8: '🍄 Perfekt soppdag i dag!',
      9: '🍄 Perfekt soppdag i dag!',
      10: '🍄 Perfekt soppdag i dag!',
      11: 'Fuktig nok — men sesongen er på hell',
      12: 'Utenom soppsesongen'
    };
    for (let month = 1; month <= 12; month++) {
      expect(assessMushroomDay(GODT_VÆR, month, 'nb', 15).title, `måned ${month}`).toBe(ventet[month]);
    }
  });

  it('første halvdel av juli er tidlig, andre halvdel er det ikke', () => {
    expect(assessMushroomDay(GODT_VÆR, 7, 'nb', 10).title).toBe('Fuktig nok — men det er tidlig i sesongen');
    expect(assessMushroomDay(GODT_VÆR, 7, 'nb', 25).title).toBe('Soppforhold i dag');
  });

  it('peker ikke på årstiden når et værledd koster mer', () => {
    // 1. november, 16 mm på to uker: regnleddet koster 20 poeng, sesongen 7.
    // «Det er årstiden» ville vært feil årsak — da står den vanlige dommen.
    const litenRegnmengde = { ...GODT_VÆR, temperatureC: 14, humidityPct: 85, rain14dMm: 16, rain7dMm: 10, rain3dMm: 4 };
    const d = assessMushroomDay(litenRegnmengde, 11, 'nb', 1);
    expect(d.score).toBeGreaterThanOrEqual(65);
    expect(d.optimal).toBe(false);
    expect(d.title).toBe('Soppforhold i dag');
  });

  it('sier «Fuktig nok» bare der banneret under også kaller forholdene modne — til og med 22 °C', () => {
    // 10. juli, 21 °C og 75 %: 45 mm på 14 dager, fuktindeks 0,649. Med
    // banneret sluttet på 20 sto «Tørt — soppen venter på regn» rett under
    // «Fuktig nok — men det er tidlig». Scoren gir temperaturpoeng til 22 °C,
    // og nå gjør banneret det samme: 21 °C er modent, og dommen sier «Fuktig nok».
    const VARMT: ExplanationWeather = {
      temperatureC: 21,
      humidityPct: 75,
      rain3dMm: 40,
      rain7dMm: 41.5,
      rain14dMm: 45,
      soilMoistureIndex: 0.649
    };
    for (const locale of ['nb', 'sv'] as const) {
      const d = assessMushroomDay(VARMT, 7, locale, 10);
      expect(d.score, locale).toBe(68);
      expect(d.optimal, locale).toBe(false);
      expect(d.title, locale).toBe(
        locale === 'nb' ? 'Fuktig nok — men det er tidlig i sesongen' : 'Fuktigt nog — men det är tidigt på säsongen'
      );
    }
    expect(assessMushroomDay({ ...VARMT, temperatureC: 22 }, 7, 'nb', 10).title).toBe(
      'Fuktig nok — men det er tidlig i sesongen'
    );
    // Over 22 °C gir scoren ingen temperaturpoeng. Med 85 % når tallet likevel
    // forklaringsterskelen, og da navngir dommen varmen.
    const fuktigLuft = { ...VARMT, humidityPct: 85 };
    expect(assessMushroomDay({ ...fuktigLuft, temperatureC: 22.5 }, 7, 'nb', 10)).toMatchObject({
      score: 65,
      title: 'For varmt for sopp akkurat nå'
    });
    // Samme regel sent i sesongen.
    expect(assessMushroomDay({ ...fuktigLuft, temperatureC: 22 }, 11, 'nb', 10).title).toBe(
      'Fuktig nok — men sesongen er på hell'
    );
    expect(assessMushroomDay({ ...fuktigLuft, temperatureC: 22.5 }, 11, 'nb', 10).title).toBe(
      'For varmt for sopp akkurat nå'
    );
  });

  it('under forklaringsterskelen er den vanlige dommen dekkende, også i en skulder', () => {
    const svakt = { ...GODT_VÆR, temperatureC: 4, humidityPct: 50 };
    const d = assessMushroomDay(svakt, 11, 'nb', 28);
    expect(d.score).toBeLessThan(65);
    expect(d.title).toBe('Soppforhold i dag');
  });

  it('en feiret skulderdag feires fortsatt — porten er urørt', () => {
    const ideelt = { ...GODT_VÆR, humidityPct: 90 };
    const d = assessMushroomDay(ideelt, 11, 'nb', 3);
    expect(d.optimal).toBe(true);
    expect(d.title).toBe('🍄 Perfekt soppdag i dag!');
  });
});

describe('tørr mark og lite regn i en skulder', () => {
  it('sier ikke «Alt stemmer» og «Vær og sesong er på plass» når årstiden holder tallet nede', () => {
    const tørt: ExplanationWeather = {
      temperatureC: 14,
      humidityPct: 85,
      rain3dMm: 2,
      rain7dMm: 10,
      rain14dMm: 45,
      soilMoistureIndex: 0.3
    };
    const juni = assessMushroomDay(tørt, 6, 'nb', 15);
    expect(juni.score).toBeGreaterThanOrEqual(65);
    expect(juni.title).toBe('Tørr mark — og tidlig i sesongen');
    expect(juni.message).not.toContain('sesong er på plass');
    const nov = assessMushroomDay(tørt, 11, 'nb', 16);
    expect(nov.title).toBe('Tørr mark — og sesongen er på hell');
    // «så følger soppen på 1–2 uker» 16. november ville lovet sopp i desember.
    expect(nov.message).not.toContain('1–2 uker');
    expect(nov.message).toContain('usikkert');
    // Høysesongen er som før.
    expect(assessMushroomDay(tørt, 9, 'nb', 15).title).toBe('Alt stemmer — bortsett fra marka');
  });

  it('lite regn i november og i første halvdel av juli', () => {
    const tørrHimmel: ExplanationWeather = {
      temperatureC: 14,
      humidityPct: 85,
      rain3dMm: 1,
      rain7dMm: 6,
      rain14dMm: 12,
      soilMoistureIndex: 0.7
    };
    const nov = assessMushroomDay(tørrHimmel, 11, 'nb', 10);
    expect(nov.score).toBeGreaterThanOrEqual(65);
    expect(nov.title).toBe('For lite regn — og sesongen er på hell');
    const juli = assessMushroomDay(tørrHimmel, 7, 'nb', 14);
    expect(juli.score).toBeGreaterThanOrEqual(65);
    expect(juli.title).toBe('For lite regn — og tidlig i sesongen');
    expect(assessMushroomDay(tørrHimmel, 9, 'nb', 15).title).toBe('Mildt nok — men det har regnet for lite');
  });
});

describe('skuldertekstene på begge språk', () => {
  const FUKTIG: ExplanationWeather = {
    temperatureC: 14,
    humidityPct: 72,
    rain3dMm: 10,
    rain7dMm: 25,
    rain14dMm: 48,
    soilMoistureIndex: 0.8
  };
  const TØRR_MARK: ExplanationWeather = { ...FUKTIG, humidityPct: 85, rain14dMm: 45, soilMoistureIndex: 0.3 };
  const LITE_REGN: ExplanationWeather = {
    ...FUKTIG,
    humidityPct: 85,
    rain3dMm: 1,
    rain7dMm: 6,
    rain14dMm: 12,
    soilMoistureIndex: 0.7
  };

  /** Alle seks skulderdommene (tre tilstander × to skuldre), hver truffet av sitt vær og sin dag. */
  function skulderdommer(locale: 'nb' | 'sv') {
    const treff: Array<[ExplanationWeather, number, number]> = [
      [FUKTIG, 6, 30],
      [TØRR_MARK, 6, 30],
      [LITE_REGN, 7, 14],
      [FUKTIG, 11, 16],
      [TØRR_MARK, 11, 16],
      [LITE_REGN, 11, 10]
    ];
    const ut = new Map<string, string>();
    for (const [w, m, d] of treff) {
      const a = assessMushroomDay(w, m, locale, d);
      expect(a.optimal, `${d}.${m}`).toBe(false);
      expect(a.score, `${d}.${m}`).toBeGreaterThanOrEqual(65);
      ut.set(a.title, a.message);
    }
    return ut;
  }

  it('hver skulderdom finnes på begge språk, og svensk er svensk', () => {
    const nb = skulderdommer('nb');
    const sv = skulderdommer('sv');
    // Tre tilstander × to skuldre.
    expect(nb.size).toBe(6);
    expect(sv.size).toBe(6);
    for (const [tittel, melding] of sv) {
      expect(`${tittel} ${melding}`).not.toMatch(/[æøÆØ]/);
      expect(nb.has(tittel)).toBe(false);
    }
    for (const [tittel, melding] of nb) expect(`${tittel} ${melding}`).not.toMatch(/[äöÄÖ]/);
  });

  it('svensk «bara lite nederbörd», ikke «lite nederbörd» — som på svensk leses «litt nedbør»', () => {
    const littRegn = [
      assessMushroomDay(LITE_REGN, 9, 'sv', 15),
      assessMushroomDay(LITE_REGN, 7, 'sv', 14),
      assessMushroomDay(LITE_REGN, 11, 'sv', 10)
    ];
    expect(littRegn.map((d) => d.title)).toEqual([
      'Milt nog — men det har regnat för lite',
      'För lite regn — och tidigt på säsongen',
      'För lite regn — och säsongen är på upphällningen'
    ]);
    for (const d of littRegn) {
      expect(d.message).toMatch(/[Dd]et har bara kommit lite nederbörd/);
      expect(d.message).not.toMatch(/har kommit lite/);
    }
    // Norsk er uendret.
    expect(assessMushroomDay(LITE_REGN, 9, 'nb', 15).message).toContain('det har kommet lite nedbør');
  });

  it('lover aldri funn, feirer ikke og navngir ingen art', () => {
    for (const locale of ['nb', 'sv'] as const) {
      for (const [tittel, melding] of skulderdommer(locale)) {
        const tekst = `${tittel} ${melding}`;
        expect(tekst).not.toContain('🍄');
        expect(tekst).not.toMatch(/perfekt|ta turen ut|ut i skogen|finner du|hittar du|garanter/i);
        expect(tekst).not.toMatch(/kantarell|steinsopp|karljohan|piggsopp|traktkantarell|trattkantarell/i);
      }
    }
  });
});
