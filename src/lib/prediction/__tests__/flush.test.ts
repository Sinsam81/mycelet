import { describe, expect, it } from 'vitest';
import { assessFlush } from '@/lib/prediction/flush';
import { assessMushroomDay, isInMushroomSeason, isMildForFlush, seasonShoulder } from '@/lib/prediction/mushroom-day';
import { dayOfYearFromMonth, phenologyFactor } from '@/lib/prediction/phenology';
import { PHENOLOGY } from '@/lib/prediction/phenology-data';
import type { DailyForecast } from '@/lib/weather/forecast';

function fc(precipPerDay: number[], tempC = 12): DailyForecast[] {
  return precipPerDay.map((precipMm, i) => ({
    date: `2026-09-${String(10 + i).padStart(2, '0')}`,
    tempC,
    precipMm,
    humidityPct: 80
  }));
}

// Data-robust species pickers: scan the generated curves for a species that is
// in / out of its fruiting window at a given month + latitude, instead of
// hardcoding ids that could shift when phenology-data is regenerated.
const TEST_LAT = 60; // southern band
function findSpeciesId(month: number, predicate: (factor: number) => boolean): number | null {
  const doy = dayOfYearFromMonth(month);
  for (const key of Object.keys(PHENOLOGY)) {
    const id = Number(key);
    const f = phenologyFactor(id, TEST_LAT, doy);
    if (f != null && predicate(f)) return id;
  }
  return null;
}

describe('assessFlush', () => {
  it('is dormant out of season', () => {
    const r = assessFlush({ month: 1, soilMoistureIndex: 0.9, rain7dMm: 30, currentTempC: 10, forecast: [] });
    expect(r.status).toBe('dormant');
  });

  it('is dormant in a freeze even in season', () => {
    const r = assessFlush({ month: 9, soilMoistureIndex: 0.9, rain7dMm: 30, currentTempC: -1, forecast: [] });
    expect(r.status).toBe('dormant');
  });

  it('says fruiting now when soil is wet and temps mild', () => {
    const r = assessFlush({ month: 9, soilMoistureIndex: 0.7, rain7dMm: 20, currentTempC: 13, forecast: [] });
    expect(r.status).toBe('fruiting');
    expect(r.daysUntil).toBe(0);
  });

  it('says building when it rained recently but ground is drying', () => {
    const r = assessFlush({ month: 9, soilMoistureIndex: 0.4, rain7dMm: 18, currentTempC: 13, forecast: fc([0, 0, 0]) });
    expect(r.status).toBe('building');
    expect(r.daysUntil).toBeGreaterThan(0);
  });

  it('projects a flush from forecast rain when currently dry', () => {
    // dry now, but a soak arrives on forecast day 2
    const r = assessFlush({
      month: 9,
      soilMoistureIndex: 0.2,
      rain7dMm: 2,
      currentTempC: 12,
      forecast: fc([1, 10, 0, 0])
    });
    expect(r.status).toBe('soon');
    expect(r.daysUntil).toBeGreaterThan(2); // rain day + lag
  });

  it('says dry when there is no moisture and nothing coming', () => {
    const r = assessFlush({ month: 9, soilMoistureIndex: 0.15, rain7dMm: 1, currentTempC: 14, forecast: fc([0, 0, 1]) });
    expect(r.status).toBe('dry');
    expect(r.daysUntil).toBeNull();
  });

  it('falls back to a rain proxy when soil index is unavailable', () => {
    const r = assessFlush({ month: 9, soilMoistureIndex: null, rain7dMm: 24, currentTempC: 12, forecast: [] });
    expect(r.status).toBe('fruiting'); // rain7d/25 ≈ 0.96 → wet
  });
});

describe('assessFlush — species-aware flush lag', () => {
  // Dry now, but a soak (≥8 mm cumulative) lands on forecast day 2. Both species
  // therefore project a 'soon' flush; only the genus lag should differ.
  const dryWithRainComing = {
    month: 9,
    soilMoistureIndex: 0.2,
    rain7dMm: 2,
    currentTempC: 14,
    forecast: fc([1, 10, 0, 0])
  };

  it('projects a shorter lag for Boletus than for Cantharellus on the same forecast', () => {
    const boletus = assessFlush(dryWithRainComing, { genus: 'Boletus' });
    const cantharellus = assessFlush(dryWithRainComing, { genus: 'Cantharellus' });

    expect(boletus.status).toBe('soon');
    expect(cantharellus.status).toBe('soon');
    // Boletes flush fast (~5 d), chanterelles are slow responders (~13 d).
    expect(boletus.daysUntil).toBeLessThan(cantharellus.daysUntil!);
  });

  it('matches the no-arg projection for an unknown genus (backwards compatible)', () => {
    const generic = assessFlush(dryWithRainComing);
    const unknown = assessFlush(dryWithRainComing, { genus: 'Nonexistentus' });
    expect(unknown.daysUntil).toBe(generic.daysUntil);
  });
});

describe('assessFlush — per-species phenology gate', () => {
  // Identical, genuinely good weather: wet soil + mild temps, well inside the
  // generic September season. Only the species' own phenology should decide
  // whether it reads as fruiting or dormant.
  const goodWeather = { month: 9, soilMoistureIndex: 0.7, rain7dMm: 20, currentTempC: 13, forecast: [] };

  const inSeasonId = findSpeciesId(9, (f) => f > 0.6); // peak-ish in September
  const outOfSeasonId = findSpeciesId(9, (f) => f < 0.05); // e.g. a spring/early-summer species

  it('a generically-good day is fruiting for an in-season species', () => {
    expect(inSeasonId).not.toBeNull();
    const r = assessFlush(goodWeather, { genus: 'Cantharellus', speciesId: inSeasonId!, lat: TEST_LAT });
    expect(r.status).toBe('fruiting');
    expect(r.daysUntil).toBe(0);
  });

  it('the same day is dormant for a species out of its own season', () => {
    expect(outOfSeasonId).not.toBeNull();
    const r = assessFlush(goodWeather, { genus: 'Morchella', speciesId: outOfSeasonId!, lat: TEST_LAT });
    expect(r.status).toBe('dormant');
    expect(r.daysUntil).toBeNull();
  });

  it('skips the gate when no phenology curve exists (keeps generic behaviour)', () => {
    const r = assessFlush(goodWeather, { genus: 'Cantharellus', speciesId: 999999, lat: TEST_LAT });
    expect(r.status).toBe('fruiting');
  });
});

describe('assessFlush — language', () => {
  const dry = { month: 9, soilMoistureIndex: 0.1, rain7dMm: 0, currentTempC: 12, forecast: fc([0, 0, 0]) };

  it('returns Swedish copy for a Swedish reader', () => {
    const r = assessFlush(dry, undefined, 'sv');
    expect(r.status).toBe('dry');
    expect(r.title).toBe('Torrt — svampen väntar på regn');
    expect(r.message).toContain('nederbörd');
  });

  it('uses Swedish plural for the "rain on the way" projection', () => {
    const r = assessFlush(
      { month: 9, soilMoistureIndex: 0.1, rain7dMm: 0, currentTempC: 12, forecast: fc([0, 12, 0]) },
      undefined,
      'sv'
    );
    expect(r.status).toBe('soon');
    expect(r.title).toContain('dagar');
    expect(r.message).toContain('2 dagar');
  });

  it('defaults to Norwegian when no locale is given', () => {
    expect(assessFlush(dry).title).toBe('Tørt — soppen venter på regn');
  });

  it('svensk «för lite fukt», ikke «lite fukt» — som på svensk leses «litt fukt»', () => {
    expect(assessFlush(dry, undefined, 'sv').message).toBe(
      'För lite fukt och inget regn i sikte. Chanserna är små tills det kommer nederbörd.'
    );
    // Norsk «lite» betyr allerede «ikke mye» — uendret.
    expect(assessFlush(dry).message).toBe('Lite fukt og ingen regn i sikte. Sjansene er små inntil det kommer nedbør.');
  });
});

/**
 * Banneret og ringen sto rett over hverandre med hver sin sesongport: flush
 * slapp gjennom fra `month >= 5`, mushroom-day fra `month >= 6`.
 *
 * Målt over 2 212 maidager: 540 (24,4 %) fikk det grønne «Forholdene er modne
 * nå 🍄 — soppen kommer nå», og 540 av 540 (100 %) hadde en gul ring over seg
 * som sa at forholdene ikke var optimale. `optimal` forekommer i 0,0 % av
 * maidagene, så motsigelsen var strukturell — ikke et uhell i været.
 *
 * Mai er ikke et vilkårlig valg: SEASON_WEIGHT_BY_MONTH gir mai vekten 0.
 * Appens egen scoring har alltid regnet mai som utenfor sesongen.
 */
describe('sesongporten deles med ringen', () => {
  const VÅT_MILD_MAIDAG = {
    month: 5,
    soilMoistureIndex: 0.9,
    rain7dMm: 30,
    currentTempC: 12,
    forecast: []
  };

  it('feirer ikke i mai, der ringen aldri kan bli grønn', () => {
    const f = assessFlush(VÅT_MILD_MAIDAG);
    expect(f.status).toBe('dormant');
    expect(f.title).not.toContain('modne');
  });

  it('bruker samme port som mushroom-day, måned for måned', () => {
    for (let month = 1; month <= 12; month++) {
      const f = assessFlush({ ...VÅT_MILD_MAIDAG, month });
      const iSesong = isInMushroomSeason(month);
      // Uten artskontekst skal de to aldri være uenige om hva som er sesong.
      expect(f.status === 'dormant', `måned ${month}`).toBe(!iSesong);
    }
  });

  it('feirer fortsatt i høysesongen', () => {
    const f = assessFlush({ ...VÅT_MILD_MAIDAG, month: 9 });
    expect(f.status).toBe('fruiting');
  });

  it('lar en art med egen kurve uttale seg utenfor den generelle sesongen', () => {
    // Rekkefølgen på portene er poenget: står månedsporten først, blir en
    // vårart meldt «utenom soppsesongen» selv om kurven sier at det er nå.
    // Uten kurve for arten faller den tilbake på den generelle porten.
    const utenKurve = assessFlush({ ...VÅT_MILD_MAIDAG }, { genus: 'Morchella', speciesId: null, lat: 59.9 });
    expect(utenKurve.status).toBe('dormant');
  });
});

/**
 * Banneret i skuldrene.
 *
 * Målt 16. november 2026 (Oslo): «Forholdene er modne nå 🍄 — Fuktig mark og
 * mildt vær — soppen kommer nå. Ta turen ut!» rett under en gul ring på 69 og
 * over «Det er stille i alle områdene nå». 'fruiting' fyrer på fuktig mark og
 * 3–22 °C hvor som helst i sesongvinduet, og hadde høysesongens ord i november
 * som i september. Statusen er riktig — fukt og temperatur ER der. Det var
 * ordene som ikke visste hvor i året vi var.
 */
describe('assessFlush — skuldrene', () => {
  const MODENT = { soilMoistureIndex: 0.8, rain7dMm: 25, currentTempC: 8, forecast: [] as DailyForecast[] };
  const SISTE_DAG = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const FASIT: Record<'nb' | 'sv', { tidlig: string; topp: string; sent: string }> = {
    nb: {
      tidlig: 'Fuktig og mildt — men tidlig i sesongen',
      topp: 'Forholdene er modne nå 🍄',
      sent: 'Fuktig og mildt — men sent i sesongen'
    },
    sv: {
      tidlig: 'Fuktigt och milt — men tidigt på säsongen',
      topp: 'Nu är det läge för svamp 🍄',
      sent: 'Fuktigt och milt — men sent på säsongen'
    }
  };

  it('gir riktige ord for et «modent» banner alle tolv måneder, på begge språk', () => {
    for (const locale of ['nb', 'sv'] as const) {
      for (let month = 1; month <= 12; month++) {
        for (const dag of [1, 14, 15, SISTE_DAG[month - 1]]) {
          const f = assessFlush({ ...MODENT, month, dayOfMonth: dag }, undefined, locale);
          const hvor = `${dag}.${month} ${locale}`;
          if (!isInMushroomSeason(month)) {
            expect(f.status, hvor).toBe('dormant');
            expect(f.reason, hvor).toBe('offSeason');
            expect(f.shoulder, hvor).toBeUndefined();
            continue;
          }
          // Statusen og tallet er de samme hele sesongen — bare ordene skifter.
          expect(f.status, hvor).toBe('fruiting');
          expect(f.daysUntil, hvor).toBe(0);
          const ventet =
            month === 11 ? 'sent' : month === 6 || (month === 7 && dag < 15) ? 'tidlig' : 'topp';
          expect(f.title, hvor).toBe(FASIT[locale][ventet]);
          expect(f.shoulder, hvor).toBe(ventet === 'sent' ? 'late' : ventet === 'tidlig' ? 'early' : undefined);
          // Feiringens 🍄 hører høysesongen til.
          expect(f.title.includes('🍄'), hvor).toBe(ventet === 'topp');
        }
      }
    }
  });

  it('16. november: sent i sesongen, mindre å finne — og ingen oppfordring', () => {
    const f = assessFlush({ ...MODENT, month: 11, dayOfMonth: 16 });
    expect(f.message).toContain('sene artene');
    expect(f.message).toContain('mindre å finne');
    expect(f.message).not.toMatch(/soppen kommer nå|Ta turen ut/);
    const sv = assessFlush({ ...MODENT, month: 11, dayOfMonth: 16 }, undefined, 'sv');
    expect(sv.message).toContain('sena arterna');
    expect(sv.message).toContain('mindre att hitta');
  });

  it('tidlig: færre arter ute — og andre halvdel av juli har høysesongens ord', () => {
    const juni = assessFlush({ ...MODENT, month: 6, dayOfMonth: 20 });
    expect(juni.message).toContain('færre arter');
    expect(assessFlush({ ...MODENT, month: 7, dayOfMonth: 25 }).title).toBe('Forholdene er modne nå 🍄');
  });

  it('uten dag regnes dagen som midt i måneden: juni tidlig, juli høysesong, november sent', () => {
    expect(assessFlush({ ...MODENT, month: 6 }).shoulder).toBe('early');
    expect(assessFlush({ ...MODENT, month: 7 }).shoulder).toBeUndefined();
    expect(assessFlush({ ...MODENT, month: 11 }).shoulder).toBe('late');
  });

  it('«på vei» og «regn på vei» lover ikke sopp i desember — men holder i en stigende sesong', () => {
    const PÅ_VEI = { soilMoistureIndex: 0.4, rain7dMm: 18, currentTempC: 10, forecast: [] as DailyForecast[] };
    const REGN_KOMMER = { soilMoistureIndex: 0.2, rain7dMm: 2, currentTempC: 10, forecast: fc([1, 10, 0]) };
    for (let month = 6; month <= 11; month++) {
      for (const dag of [1, 15, 28]) {
        const hvor = `${dag}.${month}`;
        const b = assessFlush({ ...PÅ_VEI, month, dayOfMonth: dag });
        const s = assessFlush({ ...REGN_KOMMER, month, dayOfMonth: dag });
        // Status og tall er de samme hele sesongen.
        expect(b.status, hvor).toBe('building');
        expect(b.daysUntil, hvor).toBe(5);
        expect(s.status, hvor).toBe('soon');
        expect(s.daysUntil, hvor).toBe(2 + 8); // regn dag 2 + generisk lag
        if (month === 11) {
          expect(b.shoulder, hvor).toBe('late');
          expect(b.title, hvor).toBe('Det har regnet — men det er sent');
          expect(s.shoulder, hvor).toBe('late');
          expect(s.title, hvor).toBe('Regn på vei — men sent i sesongen');
          expect(s.message, hvor).toContain('om 2 dager');
          // «sopp om ~10 dager» og «så er forholdene gode» peker inn i desember.
          expect(`${b.title} ${b.message} ${s.title} ${s.message}`, hvor).not.toMatch(/sopp om|forholdene gode/);
        } else {
          expect(b.shoulder, hvor).toBeUndefined();
          expect(b.title, hvor).toBe('Soppen er på vei');
          expect(s.shoulder, hvor).toBeUndefined();
          expect(s.title, hvor).toBe('Regn på vei — sopp om ~10 dager');
        }
      }
    }
  });

  it('svensk entall og flertall i «regn på väg» sent i sesongen', () => {
    const s = (forecast: DailyForecast[]) =>
      assessFlush({ soilMoistureIndex: 0.2, rain7dMm: 2, currentTempC: 10, forecast, month: 11, dayOfMonth: 20 }, undefined, 'sv');
    expect(s(fc([10])).message).toContain('om 1 dag,');
    expect(s(fc([0, 0, 10])).message).toContain('om 3 dagar');
    expect(s(fc([10])).title).toBe('Regn på väg — men sent på säsongen');
  });

  it('kaller forholdene modne i nøyaktig det temperaturbåndet dommen leser (isMildForFlush)', () => {
    const temperaturer = [2.5, 3, 12, 20.5, 22, 22.5, 23];
    const modne = temperaturer.map(
      (currentTempC) => assessFlush({ ...MODENT, currentTempC, month: 9, dayOfMonth: 15 }).status === 'fruiting'
    );
    expect(modne).toEqual(temperaturer.map(isMildForFlush));
    // Skrevet ut: 3–22 °C. Den varme kanten er scorens egen, ikke den gamle på 20.
    expect(modne).toEqual([false, true, true, true, true, false, false]);
  });

  it('tørt er tørt hele året — ingen egne skulderord', () => {
    const tørt = { soilMoistureIndex: 0.1, rain7dMm: 0, currentTempC: 10, forecast: fc([0, 0, 0]) };
    for (const [month, dag] of [[6, 10], [9, 15], [11, 25]] as const) {
      const f = assessFlush({ ...tørt, month, dayOfMonth: dag });
      expect(f.status).toBe('dry');
      expect(f.title).toBe('Tørt — soppen venter på regn');
      expect(f.shoulder).toBeUndefined();
    }
  });

  it('feirer der dommen over feirer — også i en skulder', () => {
    // «🍄 Perfekt soppdag i dag!» over et gult «men sent i sesongen» ville vært
    // en ny motsigelse. Mulig 1.–17. november og 10.–14. juli med ideelt vær.
    const nov = assessFlush({ ...MODENT, month: 11, dayOfMonth: 3, dayOptimal: true });
    expect(nov.title).toBe('Forholdene er modne nå 🍄');
    expect(nov.shoulder).toBeUndefined();
    const juli = assessFlush({ ...MODENT, month: 7, dayOfMonth: 12, dayOptimal: true });
    expect(juli.title).toBe('Forholdene er modne nå 🍄');
    // 'building' og 'soon' handler om dagene fram, ikke om i dag: sene uansett.
    const påVei = assessFlush({
      soilMoistureIndex: 0.4,
      rain7dMm: 18,
      currentTempC: 10,
      forecast: [],
      month: 11,
      dayOfMonth: 3,
      dayOptimal: true
    });
    expect(påVei.shoulder).toBe('late');
  });

  it('en art med egen kurve følger sin egen sesong, ikke de generelle skuldrene', () => {
    const iSesongINovember = findSpeciesId(11, (f) => f > 0.3);
    expect(iSesongINovember).not.toBeNull();
    const f = assessFlush(
      { ...MODENT, month: 11, dayOfMonth: 16 },
      { genus: 'Craterellus', speciesId: iSesongINovember!, lat: TEST_LAT }
    );
    expect(f.status).toBe('fruiting');
    expect(f.shoulder).toBeUndefined();
  });

  it('skulderordene finnes på begge språk, svensk er svensk, og ingen lover funn', () => {
    const tilfeller = [
      { ...MODENT, month: 6, dayOfMonth: 10 },
      { ...MODENT, month: 11, dayOfMonth: 16 },
      { soilMoistureIndex: 0.4, rain7dMm: 18, currentTempC: 10, forecast: [] as DailyForecast[], month: 11, dayOfMonth: 16 },
      { soilMoistureIndex: 0.2, rain7dMm: 2, currentTempC: 10, forecast: fc([1, 10, 0]), month: 11, dayOfMonth: 16 }
    ];
    for (const inn of tilfeller) {
      const nb = assessFlush(inn, undefined, 'nb');
      const sv = assessFlush(inn, undefined, 'sv');
      expect(nb.shoulder).toBeDefined();
      expect(sv.shoulder).toBe(nb.shoulder);
      expect(sv.title).not.toBe(nb.title);
      expect(`${sv.title} ${sv.message}`).not.toMatch(/[æøÆØ]/);
      expect(`${nb.title} ${nb.message}`).not.toMatch(/[äöÄÖ]/);
      for (const tekst of [`${nb.title} ${nb.message}`, `${sv.title} ${sv.message}`]) {
        expect(tekst).not.toContain('🍄');
        expect(tekst).not.toMatch(/ta turen ut|ut i skogen|finner du|hittar du|garanter/i);
        expect(tekst).not.toMatch(/kantarell|steinsopp|karljohan|piggsopp/i);
      }
    }
  });
});

/**
 * Fuktig mark utenfor temperaturbåndet. Før falt den gjennom til «Tørt —
 * soppen venter på regn — Lite fukt og ingen regn i sikte», eller til «Regn på
 * vei — sopp om ~N dager» når prognosen hadde regn — som om regn var det som
 * manglet. 20. august, 21 °C og fuktindeks 0,649 sto det rett under «🍄
 * Perfekt soppdag i dag!»: banneret sluttet da på 20 °C, scoren på 22.
 */
describe('assessFlush — fuktig, men for varmt eller for kaldt', () => {
  const FUKTIG = { soilMoistureIndex: 0.649, rain7dMm: 41.5, forecast: [] as DailyForecast[] };

  it('20. august, 21 °C: modent — båndet slutter der scoren gjør, på 22 °C', () => {
    expect(assessFlush({ ...FUKTIG, month: 8, dayOfMonth: 20, currentTempC: 21 })).toMatchObject({
      status: 'fruiting',
      title: 'Forholdene er modne nå 🍄'
    });
    expect(assessFlush({ ...FUKTIG, month: 8, dayOfMonth: 20, currentTempC: 21 }, undefined, 'sv')).toMatchObject({
      status: 'fruiting',
      title: 'Nu är det läge för svamp 🍄'
    });
  });

  it('over 22 °C: «Fuktig, men varmt», grå dvale — ikke «Tørt — Lite fukt»', () => {
    const nb = assessFlush({ ...FUKTIG, month: 8, dayOfMonth: 20, currentTempC: 22.5 });
    expect(nb).toEqual({
      status: 'dormant',
      daysUntil: null,
      title: 'Fuktig, men varmt — soppen venter på kjøligere vær',
      message:
        'Marka er fuktig nok, men det er for varmt for soppen akkurat nå. Det kan bli bedre når det blir kjøligere.',
      reason: 'warm'
    });
    const sv = assessFlush({ ...FUKTIG, month: 8, dayOfMonth: 20, currentTempC: 22.5 }, undefined, 'sv');
    expect(sv).toMatchObject({
      status: 'dormant',
      reason: 'warm',
      title: 'Fuktigt, men varmt — svampen väntar på svalare väder',
      message:
        'Marken är fuktig nog, men det är för varmt för svampen just nu. Det kan bli bättre när det blir svalare.'
    });
  });

  it('mellom frostporten (2 °C) og båndet (3 °C): «Fuktig, men kaldt»', () => {
    const f = assessFlush({ ...FUKTIG, month: 10, dayOfMonth: 10, currentTempC: 2.5 });
    expect(f).toMatchObject({
      status: 'dormant',
      reason: 'cold',
      title: 'Fuktig, men kaldt — soppen venter på mildere vær'
    });
    expect(assessFlush({ ...FUKTIG, month: 10, dayOfMonth: 10, currentTempC: 2.5 }, undefined, 'sv').title).toBe(
      'Fuktigt, men kallt — svampen väntar på mildare väder'
    );
    // Under 2 °C er det frosten som før.
    expect(assessFlush({ ...FUKTIG, month: 10, dayOfMonth: 10, currentTempC: 1.9 }).title).toBe('For kaldt akkurat nå');
  });

  it('regn i prognosen gjør det ikke til «Regn på vei» — det er ikke regn som mangler', () => {
    const f = assessFlush({ ...FUKTIG, forecast: fc([1, 10, 0]), month: 9, dayOfMonth: 15, currentTempC: 23 });
    expect(f.status).toBe('dormant');
    expect(f.reason).toBe('warm');
    expect(f.daysUntil).toBeNull();
  });

  it('sier aldri «Tørt» eller «Lite fukt» om fuktig mark, fra −5 til 30 °C', () => {
    for (let currentTempC = -5; currentTempC <= 30; currentTempC += 0.5) {
      for (const soilMoistureIndex of [0.55, 0.8, 1]) {
        for (const forecast of [[] as DailyForecast[], fc([0, 12, 0])]) {
          for (const locale of ['nb', 'sv'] as const) {
            const f = assessFlush(
              { soilMoistureIndex, rain7dMm: 0, currentTempC, forecast, month: 9, dayOfMonth: 15 },
              undefined,
              locale
            );
            const hvor = `${currentTempC} °C, fukt ${soilMoistureIndex}, ${locale}`;
            expect(['fruiting', 'dormant'], hvor).toContain(f.status);
            expect(`${f.title} ${f.message}`, hvor).not.toMatch(/Tørt|Torrt|Lite fukt|regn på vei|regn på väg/i);
            // Modent nøyaktig i båndet; utenfor det sier banneret hvilken vei.
            expect(f.status === 'fruiting', hvor).toBe(isMildForFlush(currentTempC));
            if (f.status === 'dormant') expect(f.reason, hvor).toBe(currentTempC > 22 ? 'warm' : 'cold');
          }
        }
      }
    }
  });

  it('tørr mark utenfor båndet er fortsatt «Tørt» — det er sant', () => {
    const f = assessFlush({ soilMoistureIndex: 0.3, rain7dMm: 2, currentTempC: 25, forecast: [], month: 8, dayOfMonth: 1 });
    expect(f.status).toBe('dry');
    expect(f.title).toBe('Tørt — soppen venter på regn');
  });

  it('de nye ordene finnes på begge språk, svensk er svensk, og ingen lover funn', () => {
    for (const currentTempC of [2.5, 25]) {
      const nb = assessFlush({ ...FUKTIG, month: 9, dayOfMonth: 15, currentTempC });
      const sv = assessFlush({ ...FUKTIG, month: 9, dayOfMonth: 15, currentTempC }, undefined, 'sv');
      expect(sv.title).not.toBe(nb.title);
      expect(`${sv.title} ${sv.message}`).not.toMatch(/[æøÆØ]/);
      expect(`${nb.title} ${nb.message}`).not.toMatch(/[äöÄÖ]/);
      for (const tekst of [`${nb.title} ${nb.message}`, `${sv.title} ${sv.message}`]) {
        expect(tekst).not.toContain('🍄');
        expect(tekst).not.toMatch(/ta turen ut|ut i skogen|finner du|hittar du|garanter|kantarell|steinsopp/i);
      }
    }
  });
});

describe('assessFlush — en dag dommen feirer, er moden her også', () => {
  // Uten fuktindeks (OpenWeather) slipper dommens fuktveto alt gjennom, mens
  // banneret leser 7-døgnsregnet. 25 mm på 14 dager, men 5 på sju, ga
  // «🍄 Perfekt soppdag i dag!» over «Tørt — soppen venter på regn».
  const UTEN_INDEKS = { soilMoistureIndex: null, rain7dMm: 5, currentTempC: 14, forecast: [] as DailyForecast[] };

  it('feiret dag uten fuktindeks: modent, ikke «Tørt»', () => {
    const dom = assessMushroomDay(
      { temperatureC: 14, humidityPct: 85, rain3dMm: 1, rain7dMm: 5, rain14dMm: 25, soilMoistureIndex: null },
      9,
      'nb',
      15
    );
    expect(dom.optimal).toBe(true);
    expect(assessFlush({ ...UTEN_INDEKS, month: 9, dayOfMonth: 15, dayOptimal: dom.optimal })).toMatchObject({
      status: 'fruiting',
      title: 'Forholdene er modne nå 🍄'
    });
    // Uten feiringen leser banneret sitt eget fuktmål, som før.
    expect(assessFlush({ ...UTEN_INDEKS, month: 9, dayOfMonth: 15 }).status).toBe('dry');
  });

  it('feiringen overstyrer aldri temperaturbåndet', () => {
    const f = assessFlush({ ...UTEN_INDEKS, currentTempC: 22.5, month: 9, dayOfMonth: 15, dayOptimal: true });
    expect(f.status).not.toBe('fruiting');
  });
});

/**
 * Banneret og dommen over det står i samme kort og skal være enige om hvor i
 * året vi er. Begge leser seasonShoulder; dette låser at de faktisk gjør det,
 * for hver måned og hvert slags vær — slik forsidekortet setter dem sammen
 * (/api/mushroom-forecast sender dommens `optimal` til banneret).
 */
describe('banneret og dommen er enige om sesongen', () => {
  const VÆR = [
    { temperatureC: 8, humidityPct: 72, rain7dMm: 25, rain14dMm: 48, soil: 0.8 },
    { temperatureC: 14, humidityPct: 90, rain7dMm: 30, rain14dMm: 60, soil: 0.9 },
    { temperatureC: 14, humidityPct: 85, rain7dMm: 10, rain14dMm: 45, soil: 0.3 },
    { temperatureC: 12, humidityPct: 85, rain7dMm: 6, rain14dMm: 12, soil: 0.7 },
    { temperatureC: 4, humidityPct: 95, rain7dMm: 30, rain14dMm: 70, soil: 1 },
    // Rundt bannerets øvre grense (isMildForFlush), som er scorens egen: 22 °C
    // gir temperaturpoeng og er modent, 22,5 gir ingen og er for varmt.
    { temperatureC: 21, humidityPct: 75, rain7dMm: 41.5, rain14dMm: 45, soil: 0.649 },
    { temperatureC: 22, humidityPct: 75, rain7dMm: 41.5, rain14dMm: 45, soil: 0.649 },
    { temperatureC: 22.5, humidityPct: 85, rain7dMm: 41.5, rain14dMm: 45, soil: 0.649 }
  ];

  /** Dommen som sier «Marka er fuktig og det har kommet nok regn» — tidlig og sent, begge språk. */
  const FUKTIG_NOK = new Set([
    'Fuktig nok — men det er tidlig i sesongen',
    'Fuktig nok — men sesongen er på hell',
    'Fuktigt nog — men det är tidigt på säsongen',
    'Fuktigt nog — men säsongen är på upphällningen'
  ]);

  it('aldri «modne nå 🍄» under en skulderdom, aldri skulderord under «Perfekt soppdag»', () => {
    for (const locale of ['nb', 'sv'] as const) {
      for (let month = 1; month <= 12; month++) {
        for (const dag of [1, 10, 14, 15, 16, 28]) {
          for (const v of VÆR) {
            const hvor = `${dag}.${month} ${locale} ${JSON.stringify(v)}`;
            const dom = assessMushroomDay(
              {
                temperatureC: v.temperatureC,
                humidityPct: v.humidityPct,
                rain3dMm: v.rain7dMm / 2,
                rain7dMm: v.rain7dMm,
                rain14dMm: v.rain14dMm,
                soilMoistureIndex: v.soil
              },
              month,
              locale,
              dag
            );
            const banner = assessFlush(
              {
                month,
                dayOfMonth: dag,
                dayOptimal: dom.optimal,
                soilMoistureIndex: v.soil,
                rain7dMm: v.rain7dMm,
                currentTempC: v.temperatureC,
                forecast: []
              },
              undefined,
              locale
            );
            const skulder = seasonShoulder(month, dag);
            if (banner.title.includes('🍄')) expect(skulder === null || dom.optimal, hvor).toBe(true);
            if (dom.optimal) expect(banner.shoulder, hvor).toBeUndefined();
            if (skulder && !dom.optimal && banner.status === 'fruiting') {
              expect(banner.shoulder, hvor).toBe(skulder);
            }
            // Skulderord bare der det er en skulder.
            if (banner.shoulder) expect(banner.shoulder, hvor).toBe(skulder);
            // «Fuktig nok» står bare over et banner som også kaller forholdene
            // modne — aldri over «Tørt — Lite fukt» (10. juli, 21 °C).
            if (FUKTIG_NOK.has(dom.title)) {
              expect(banner.status, hvor).toBe('fruiting');
              expect(banner.shoulder, hvor).toBe(skulder);
            }
          }
        }
      }
    }
  });
});
