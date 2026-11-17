import { describe, expect, it } from 'vitest';
import { buildWeek, filterUpcomingDays } from '@/lib/prediction/week-scores';
import { assessFlush, type FlushAssessment } from '@/lib/prediction/flush';
import { reconcileFlushWithWeek } from '@/lib/prediction/flush-vs-week';
import { utenomSesongTekst } from '@/lib/sesong/utenom-sesong-tekst';
import type { WeatherSummary } from '@/lib/weather';
import type { DailyForecast } from '@/lib/weather/forecast';

/**
 * Dommen og banneret på forsidekortet, uttømmende — satt sammen nøyaktig slik
 * /api/mushroom-forecast gjør det: buildWeek → assessFlush (med dommens
 * `optimal`) → reconcileFlushWithWeek.
 *
 * Feilen som gjorde dette nødvendig: scoren gir temperaturpoeng opp til 22 °C,
 * banneret kalte forholdene modne bare mellom 3 og 20. 20. august, 21 °C, 85 %,
 * fuktindeks 0,649 og 45 mm på 14 dager ga score 90 og «🍄 Perfekt soppdag i
 * dag!» rett over «Tørt — soppen venter på regn — Lite fukt og ingen regn i
 * sikte». Og fuktig mark utenfor båndet fikk alltid «Lite fukt».
 *
 * Matrisen: 12 måneder × 7 dager i måneden × 38 temperaturer (−5 til 30 °C,
 * pluss 2,5 og 20,5 ved bannerets grenser) × fuktindeks null/0,3/0,55/0,8 ×
 * 6 regnmønstre × 3 luftfuktigheter × tørr/våt prognose × nb/sv = 919 296
 * kort. Mot koden før rettelsen: 6 687–7 448 brudd per måned og språk i
 * juni–november, desember–mai rene.
 *
 * IKKE DEKKET HER — to spenninger i regndimensjonen, eldre enn temperatur-
 * båndet, som trenger en beslutning om ordlyd (telt i denne matrisen):
 *  - «Mildt nok — men det har regnet for lite … Første ordentlige regnværet
 *    setter det i gang» over «Forholdene er modne nå 🍄 … soppen kommer nå»
 *    (16 608 kort): fuktindeksen sier fuktig, 14-døgnsregnet er under 15 mm.
 *  - «Alt stemmer — bortsett fra marka … Den trenger et skikkelig regn» over
 *    «Soppen er på vei — Det regnet nylig — gi det noen dager» (10 464 kort).
 */

type Dom =
  | 'perfekt'
  | 'vanlig'
  | 'tørrMark'
  | 'litenRegn'
  | 'sesongTidlig'
  | 'sesongSent'
  | 'forVarmt'
  | 'forKaldt'
  | 'utenom';

type Banner =
  | 'modent'
  | 'modentTidlig'
  | 'modentSent'
  | 'påVei'
  | 'regnPåVei'
  | 'tørt'
  | 'fuktigVarmt'
  | 'fuktigKaldt'
  | 'frost'
  | 'utenom';

/** Hver dom etter tittel, på begge språk. En tittel som ikke står her, feiler testen. */
const DOMMER: Record<Exclude<Dom, 'utenom'>, string[]> = {
  perfekt: ['🍄 Perfekt soppdag i dag!', '🍄 Perfekt svampdag i dag!'],
  vanlig: ['Soppforhold i dag', 'Svampförhållanden i dag'],
  tørrMark: [
    'Alt stemmer — bortsett fra marka',
    'Tørr mark — og tidlig i sesongen',
    'Tørr mark — og sesongen er på hell',
    'Allt stämmer — utom marken',
    'Torr mark — och tidigt på säsongen',
    'Torr mark — och säsongen är på upphällningen'
  ],
  litenRegn: [
    'Mildt nok — men det har regnet for lite',
    'For lite regn — og tidlig i sesongen',
    'For lite regn — og sesongen er på hell',
    'Milt nog — men det har regnat för lite',
    'För lite regn — och tidigt på säsongen',
    'För lite regn — och säsongen är på upphällningen'
  ],
  sesongTidlig: ['Fuktig nok — men det er tidlig i sesongen', 'Fuktigt nog — men det är tidigt på säsongen'],
  sesongSent: ['Fuktig nok — men sesongen er på hell', 'Fuktigt nog — men säsongen är på upphällningen'],
  forVarmt: ['For varmt for sopp i dag', 'För varmt för svamp i dag'],
  forKaldt: ['For kaldt for sopp i dag', 'För kallt för svamp i dag']
};

const UTENOM_TITLER = new Set(
  [1, 4].flatMap((m) => (['nb', 'sv'] as const).map((l) => utenomSesongTekst(m, l).title))
);

function domFor(tittel: string): Dom {
  if (UTENOM_TITLER.has(tittel)) return 'utenom';
  for (const [dom, titler] of Object.entries(DOMMER)) {
    if (titler.includes(tittel)) return dom as Dom;
  }
  throw new Error(`Ukjent dom: «${tittel}»`);
}

const FROST_TITLER = ['For kaldt akkurat nå', 'För kallt just nu'];

function bannerFor(f: FlushAssessment): Banner {
  switch (f.status) {
    case 'fruiting':
      return f.shoulder === 'early' ? 'modentTidlig' : f.shoulder === 'late' ? 'modentSent' : 'modent';
    case 'building':
      return 'påVei';
    case 'soon':
      return 'regnPåVei';
    case 'dry':
      return 'tørt';
    case 'dormant':
      if (f.reason === 'offSeason') return 'utenom';
      if (f.reason === 'warm') return 'fuktigVarmt';
      if (f.reason === 'cold') return FROST_TITLER.includes(f.title) ? 'frost' : 'fuktigKaldt';
      throw new Error(`Ukjent dvale: ${JSON.stringify(f)}`);
  }
}

/**
 * DE FORBUDTE PARENE — dom over banner som sier det motsatte.
 *
 * Hvert par har en grunn. Det som IKKE står her, er enten forenlig («Soppforhold
 * i dag» påstår ingenting; «For varmt» over «Tørt» sier nei to ganger), eller en
 * av de to spenningene i regndimensjonen øverst i filen.
 */
const FORBUDTE_PAR: Array<[Dom, Banner[], string]> = [
  [
    'perfekt',
    ['modentTidlig', 'modentSent', 'påVei', 'regnPåVei', 'tørt', 'fuktigVarmt', 'fuktigKaldt', 'frost', 'utenom'],
    'en feiret dag har bare «Forholdene er modne nå 🍄» under seg'
  ],
  [
    'sesongTidlig',
    ['modent', 'modentSent', 'påVei', 'regnPåVei', 'tørt', 'fuktigVarmt', 'fuktigKaldt', 'frost', 'utenom'],
    '«Marka er fuktig … tidlig» står bare over det tidlige «Fuktig og mildt»'
  ],
  [
    'sesongSent',
    ['modent', 'modentTidlig', 'påVei', 'regnPåVei', 'tørt', 'fuktigVarmt', 'fuktigKaldt', 'frost', 'utenom'],
    '«Marka er fuktig … på hell» står bare over det sene «Fuktig og mildt»'
  ],
  [
    'forVarmt',
    ['modent', 'modentTidlig', 'modentSent', 'påVei', 'fuktigKaldt', 'frost', 'utenom'],
    '«for varmt» over et banner som kaller været mildt eller kaldt'
  ],
  [
    'forKaldt',
    ['modent', 'modentTidlig', 'modentSent', 'påVei', 'fuktigVarmt', 'utenom'],
    '«for kaldt» over et banner som kaller været mildt eller varmt'
  ],
  [
    'litenRegn',
    ['fuktigVarmt', 'fuktigKaldt', 'frost', 'utenom'],
    '«Mildt nok» / «regn setter det i gang» over «for varmt», «for kaldt» eller «fuktig nok»'
  ],
  [
    'tørrMark',
    ['modent', 'modentTidlig', 'modentSent', 'fuktigVarmt', 'fuktigKaldt', 'frost', 'utenom'],
    '«marka er for tørr» / «Vær og sesong er på plass» over «fuktig» eller «for kaldt»'
  ],
  ['vanlig', ['utenom'], 'en dom i sesongen over «utenom sesongen»'],
  [
    'utenom',
    ['modent', 'modentTidlig', 'modentSent', 'påVei', 'regnPåVei', 'tørt', 'fuktigVarmt', 'fuktigKaldt', 'frost'],
    '«utenom sesongen» over et banner i sesongen'
  ]
];

const FORBUDT = new Map<string, string>();
for (const [dom, bannere, grunn] of FORBUDTE_PAR) {
  for (const b of bannere) FORBUDT.set(`${dom}|${b}`, grunn);
}

const SISTE_DAG = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const TEMPERATURER = [...Array.from({ length: 36 }, (_, i) => i - 5), 2.5, 20.5];
const FUKTINDEKSER: Array<number | null> = [null, 0.3, 0.55, 0.8];
const LUFTFUKTIGHETER = [50, 70, 85];
/** [3 d, 7 d, 14 d] — tørke, lite, akkurat over porten, gammelt regn, vått, og OpenWeather (uten 14 d). */
const REGN: Array<[number, number, number | null]> = [
  [0, 1, 4],
  [2, 6, 12],
  [4, 8, 16],
  [1, 5, 25],
  [10, 22.5, 45],
  [5, 14, null]
];
const PROGNOSER: Record<'tørr' | 'våt', number[]> = {
  tørr: [0, 0, 0, 0, 0, 0],
  våt: [1, 10, 0, 0, 0, 0]
};

function dato(month: number, dag: number): string {
  return `2026-${String(month).padStart(2, '0')}-${String(dag).padStart(2, '0')}`;
}

/** De seks datoene etter `fra`, ÅÅÅÅ-MM-DD. */
function datoerEtter(fra: string): string[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(`${fra}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i + 1);
    return d.toISOString().slice(0, 10);
  });
}

function prognose(datoer: string[], mm: number[], tempC: number, humidityPct: number): DailyForecast[] {
  return mm.map((precipMm, i) => ({ date: datoer[i], tempC, precipMm, humidityPct }));
}

interface Utfall {
  par: Map<string, number>;
  brudd: string[];
  antall: number;
}

/** Ett kort per kombinasjon, satt sammen som ruta gjør. */
function kjorManed(month: number, locale: 'nb' | 'sv'): Utfall {
  const par = new Map<string, number>();
  const brudd: string[] = [];
  let antall = 0;
  const dager = [1, 10, 14, 15, 16, 25, SISTE_DAG[month - 1]];
  for (const dag of dager) {
    const iDag = dato(month, dag);
    const prognosedatoer = datoerEtter(iDag);
    for (const temperatureC of TEMPERATURER) {
      for (const soil of FUKTINDEKSER) {
        for (const [rain3dMm, rain7dMm, rain14dMm] of REGN) {
          for (const humidityPct of LUFTFUKTIGHETER) {
            for (const [prognosenavn, mm] of Object.entries(PROGNOSER)) {
              const observed: WeatherSummary = {
                source: 'met_frost',
                temperatureC,
                humidityPct,
                humidityEstimated: false,
                rain3dMm,
                rain7dMm,
                rain14dMm,
                minTemp7dC: temperatureC - 3,
                maxTemp7dC: temperatureC + 3,
                soilMoistureIndex: soil,
                precipDailyMm: null
              };
              const future = filterUpcomingDays(prognose(prognosedatoer, mm, temperatureC, humidityPct), iDag);
              const { today, days } = buildWeek(observed, future, {
                todayKey: iDag,
                month,
                dayOfMonth: dag,
                locale
              });
              const flush = reconcileFlushWithWeek(
                assessFlush(
                  {
                    month,
                    dayOfMonth: dag,
                    dayOptimal: today.optimal,
                    soilMoistureIndex: observed.soilMoistureIndex,
                    rain7dMm: observed.rain7dMm ?? observed.rain3dMm * 2,
                    currentTempC: observed.temperatureC,
                    forecast: future
                  },
                  undefined,
                  locale
                ),
                days,
                locale
              );
              antall++;
              const dom = domFor(today.title);
              const banner = bannerFor(flush);
              const nokkel = `${dom}|${banner}`;
              par.set(nokkel, (par.get(nokkel) ?? 0) + 1);

              // Stedet skrives bare ut når noe feiler — strengen koster mer enn resten.
              const hvor = () =>
                `${iDag} ${locale} ${temperatureC} °C, ${humidityPct} %, fukt ${soil}, regn ${rain3dMm}/${rain7dMm}/${rain14dMm}, prognose ${prognosenavn}`;
              const grunn = FORBUDT.get(nokkel);
              if (grunn) brudd.push(`${hvor()}: «${today.title}» over «${flush.title}» — ${grunn}`);

              // Banneret sier aldri «tørt» — eller at det er regn som mangler — om fuktig mark.
              if (soil != null && soil >= 0.55 && (banner === 'tørt' || banner === 'regnPåVei' || banner === 'påVei')) {
                brudd.push(`${hvor()}: fuktig mark, men banneret sier «${flush.title} — ${flush.message}»`);
              }
              // «Lite fukt» står aldri over et kort der dommen kaller marka fuktig eller feirer.
              if (banner === 'tørt' && (dom === 'perfekt' || dom === 'sesongTidlig' || dom === 'sesongSent')) {
                brudd.push(`${hvor()}: «${today.title}» over «${flush.message}»`);
              }
              // Ordene om temperaturen følger bannerets bånd, 3–20 °C — skrevet ut
              // her, ikke lånt fra koden som testes.
              const t = temperatureC > 20 ? 'warm' : temperatureC >= 3 ? 'mild' : 'cold';
              if ((banner === 'modent' || banner === 'modentTidlig' || banner === 'modentSent' || banner === 'påVei') && t !== 'mild') {
                brudd.push(`${hvor()}: «${flush.title}» utenfor 3–20 °C`);
              }
              if (banner === 'fuktigVarmt' && t !== 'warm') brudd.push(`${hvor()}: «${flush.title}» uten at det er varmt`);
              if (banner === 'fuktigKaldt' && t !== 'cold') brudd.push(`${hvor()}: «${flush.title}» uten at det er kaldt`);
              if (dom === 'forVarmt' && t !== 'warm') brudd.push(`${hvor()}: «${today.title}» uten at det er varmt`);
              if (dom === 'forKaldt' && t !== 'cold') brudd.push(`${hvor()}: «${today.title}» uten at det er kaldt`);
              if (dom === 'perfekt' && t !== 'mild') brudd.push(`${hvor()}: feiret utenfor 3–20 °C`);
            }
          }
        }
      }
    }
  }
  return { par, brudd, antall };
}

const SPRAK = ['nb', 'sv'] as const;

/** Hver måned regnes én gang, uansett hvilken test som spør først — også når én test kjøres alene. */
const utfallCache = new Map<string, Utfall>();
function utfall(month: number, locale: 'nb' | 'sv'): Utfall {
  const nokkel = `${month}|${locale}`;
  let u = utfallCache.get(nokkel);
  if (!u) {
    u = kjorManed(month, locale);
    utfallCache.set(nokkel, u);
  }
  return u;
}

describe('dommen og banneret motsier aldri hverandre — uttømmende, gjennom rutas sammensetning', () => {
  for (const locale of SPRAK) {
    for (let month = 1; month <= 12; month++) {
      it(
        `måned ${month}, ${locale}`,
        () => {
          const { brudd } = utfall(month, locale);
          expect(brudd.slice(0, 5), `${brudd.length} brudd`).toEqual([]);
        },
        60_000
      );
    }
  }

  it('matrisen er hel, og de nye tilstandene forekommer faktisk', () => {
    const alle = new Map<string, number>();
    let totalt = 0;
    for (const locale of SPRAK) {
      for (let month = 1; month <= 12; month++) {
        const { par, antall } = utfall(month, locale);
        for (const [k, n] of par) alle.set(k, (alle.get(k) ?? 0) + n);
        totalt += antall;
      }
    }
    // 12 × 7 × 38 × 4 × 6 × 3 × 2 × 2.
    expect(totalt).toBe(12 * 7 * 38 * 4 * 6 * 3 * 2 * 2);
    const forekommer = (dom: Dom, banner: Banner) => (alle.get(`${dom}|${banner}`) ?? 0) > 0;
    // Saken som ble meldt: 21 °C i høysesong er nå «for varmt» over «fuktig, men varmt».
    expect(forekommer('forVarmt', 'fuktigVarmt')).toBe(true);
    expect(forekommer('forKaldt', 'fuktigKaldt')).toBe(true);
    expect(forekommer('forKaldt', 'frost')).toBe(true);
    // Uten tørr mark under: «for varmt» over «Tørt» er forenlig — begge sier nei.
    expect(forekommer('forVarmt', 'tørt')).toBe(true);
    // Feiringen, skuldrene og de vanlige dommene finnes fortsatt.
    expect(forekommer('perfekt', 'modent')).toBe(true);
    expect(forekommer('sesongTidlig', 'modentTidlig')).toBe(true);
    expect(forekommer('sesongSent', 'modentSent')).toBe(true);
    expect(forekommer('tørrMark', 'tørt')).toBe(true);
    expect(forekommer('utenom', 'utenom')).toBe(true);
  }, 120_000);
});
