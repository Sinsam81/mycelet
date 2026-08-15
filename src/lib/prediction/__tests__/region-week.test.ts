import { describe, expect, it } from 'vitest';
import { beskrivToppdag, computeRegionWeek } from '../region-week';
import type { WeatherSummary } from '@/lib/weather';
import type { DailyForecast } from '@/lib/weather/forecast';

/**
 * «Uka framover»-stripen for områdesidene. Testene låser tre ting:
 *
 *  1. Stripen trykker aldri score-tall — bare høyder, etiketter og setninger.
 *  2. Uavgjort behandles som uavgjort, og jevn uke uthever ingen søyle
 *     (forecast-best-day.ts / forecast-bars.ts sine regler skal overleve
 *     innpakningen).
 *  3. Språket følger landet: svensk på SE-sider, norsk på NO-sider.
 *
 * Datoene er faste (august 2026, midt i sesong) så sesongleddet ikke gjør
 * testene årstidsavhengige.
 */

// En torsdag. Prognosedagene blir fre, lør, søn, man, tir, ons.
const NOW = new Date('2026-08-13T10:00:00Z');
const TODAY = '2026-08-13';

function vær(overrides: Partial<WeatherSummary> = {}): WeatherSummary {
  return {
    source: 'met_frost',
    temperatureC: 14,
    humidityPct: 80,
    humidityEstimated: false,
    rain3dMm: 12,
    rain7dMm: 25,
    rain14dMm: 40,
    minTemp7dC: 8,
    maxTemp7dC: 18,
    soilMoistureIndex: 0.7,
    precipDailyMm: [2, 3, 0, 5, 4, 1, 0, 6, 2, 3, 0, 4, 5, 3],
    ...overrides
  };
}

function prognose(dager: Array<{ precipMm?: number; tempC?: number }>): DailyForecast[] {
  return dager.map((d, i) => {
    const dato = new Date(Date.UTC(2026, 7, 14 + i)); // 14. aug og utover
    return {
      date: dato.toISOString().slice(0, 10),
      tempC: d.tempC ?? 14,
      precipMm: d.precipMm ?? 3,
      humidityPct: 80
    };
  });
}

describe('computeRegionWeek', () => {
  it('gir null uten prognose — stripen skal aldri være en feilkilde', () => {
    expect(computeRegionWeek(vær(), null, { land: 'NO', now: NOW })).toBeNull();
    expect(computeRegionWeek(vær(), [], { land: 'NO', now: NOW })).toBeNull();
  });

  it('gir null når prognosen har for få kommende dager til å være en uke', () => {
    const kort = prognose([{}, {}]); // bare 2 dager fram
    expect(computeRegionWeek(vær(), kort, { land: 'NO', now: NOW })).toBeNull();
  });

  it('ignorerer prognosedager som ikke er strengt etter i dag', () => {
    const medIdag: DailyForecast[] = [
      { date: TODAY, tempC: 14, precipMm: 50, humidityPct: 80 },
      ...prognose([{}, {}, {}, {}])
    ];
    const uke = computeRegionWeek(vær(), medIdag, { land: 'NO', now: NOW });
    expect(uke).not.toBeNull();
    // Dag 0 er alltid observert vær, aldri en prognoserad for samme dato.
    expect(uke!.days[0].isToday).toBe(true);
    expect(uke!.days.filter((d) => d.date === TODAY)).toHaveLength(1);
  });

  it('eksponerer aldri score-tall — bare høyder i [14, 100]', () => {
    const uke = computeRegionWeek(vær(), prognose([{}, {}, {}, {}, {}, {}]), { land: 'NO', now: NOW });
    expect(uke).not.toBeNull();
    for (const dag of uke!.days) {
      expect(dag.heightPct).toBeGreaterThanOrEqual(14);
      expect(dag.heightPct).toBeLessThanOrEqual(100);
      expect('score' in dag).toBe(false);
    }
  });

  it('jevn uke: ingen søyle utheves, og linjen sier det rett ut', () => {
    // Identisk vær hver dag → flat stripe (samme invariant som forsidens
    // «sju identiske søyler»-tester).
    const uke = computeRegionWeek(
      vær({ precipDailyMm: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3], rain3dMm: 9, rain7dMm: 21, rain14dMm: 42 }),
      prognose([{}, {}, {}, {}, {}, {}]),
      { land: 'NO', now: NOW }
    );
    expect(uke).not.toBeNull();
    expect(uke!.days.every((d) => !d.erTopp)).toBe(true);
    expect(uke!.line).toContain('ingen klar toppdag');
    const høyder = new Set(uke!.days.map((d) => d.heightPct));
    expect(høyder.size).toBe(1);
  });

  it('klar toppdag: riktig søyle utheves og dagen navngis på norsk', () => {
    // Tørr start, kraftig regn mot slutten → siste dager klart best.
    const uke = computeRegionWeek(
      vær({ soilMoistureIndex: 0.35, rain3dMm: 0, rain7dMm: 4, precipDailyMm: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 1] }),
      prognose([{ precipMm: 0 }, { precipMm: 0 }, { precipMm: 2 }, { precipMm: 18, tempC: 13 }, { precipMm: 15, tempC: 13 }, { precipMm: 12, tempC: 13 }]),
      { land: 'NO', now: NOW }
    );
    expect(uke).not.toBeNull();
    const topper = uke!.days.filter((d) => d.erTopp);
    if (topper.length === 1) {
      // Navngitt dag: linjen skal inneholde ukedagsnavnet eller «i dag».
      expect(uke!.line).toMatch(/Ser best ut (på (mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)|i dag)\./);
    } else {
      // Uavgjort er et gyldig utfall — men da skal linjen si det, ikke peke.
      expect(topper.length).toBeGreaterThan(1);
      expect(uke!.line).toMatch(/ser like gode ut|deler toppen/);
    }
    // Uansett utfall: toppsøylene er ukas høyeste.
    const maks = Math.max(...uke!.days.map((d) => d.heightPct));
    for (const t of topper) expect(t.heightPct).toBe(maks);
  });

  it('svensk side: svensk overskrift, svenske etiketter og svensk linje', () => {
    const uke = computeRegionWeek(vær({ source: 'smhi' }), prognose([{}, {}, {}, {}, {}, {}]), {
      land: 'SE',
      now: NOW
    });
    expect(uke).not.toBeNull();
    expect(uke!.heading).toBe('Veckan framöver');
    // fredag 14. aug: svensk kortform «fre»; søndag er «sön» (ikke «søn»).
    const etiketter = uke!.days.map((d) => d.label);
    // «Idag» i ett ord, som resten av de svenske områdesidene — ikke appens
    // delte «I dag». Tre skrivemåter i samme skjermbilde er slurv.
    expect(etiketter[0]).toBe('Idag');
    expect(etiketter).toContain('sön');
    expect(etiketter).not.toContain('søn');
    expect(uke!.honesty).toContain('rangordnar');
  });

  it('norsk side beholder «I dag» på dag 0', () => {
    const uke = computeRegionWeek(vær(), prognose([{}, {}, {}, {}, {}, {}]), { land: 'NO', now: NOW });
    expect(uke!.days[0].label).toBe('I dag');
  });

  it('toppdag i dag omtales som «i dag», ikke som ukedagsnavn', () => {
    // Vått nå, uttørking og varme utover → i dag best.
    const uke = computeRegionWeek(
      vær({ soilMoistureIndex: 0.9, rain3dMm: 30, rain7dMm: 45, precipDailyMm: [0, 0, 0, 0, 0, 0, 0, 5, 3, 2, 10, 12, 8, 10] }),
      prognose([
        { precipMm: 0, tempC: 24 },
        { precipMm: 0, tempC: 25 },
        { precipMm: 0, tempC: 26 },
        { precipMm: 0, tempC: 26 },
        { precipMm: 0, tempC: 27 },
        { precipMm: 0, tempC: 27 }
      ]),
      { land: 'NO', now: NOW }
    );
    expect(uke).not.toBeNull();
    if (uke!.days[0].erTopp && uke!.days.filter((d) => d.erTopp).length === 1) {
      expect(uke!.line).toBe('Ser best ut i dag.');
    }
  });
});

/**
 * Setningen under stripen testes direkte: forgreningene (uavgjort mellom to,
 * mellom flere, jevn uke) er vanskelige å lokke fram gjennom værmodellen, og
 * det er nettopp de som bærer budskapet for en skjermleser — søylene er
 * aria-hidden.
 *
 * Dagene er torsdag 13. aug 2026 og de seks påfølgende.
 */
describe('beskrivToppdag', () => {
  const DAGER = [
    { date: '2026-08-13' }, // i dag (torsdag)
    { date: '2026-08-14' }, // fredag
    { date: '2026-08-15' }, // lørdag
    { date: '2026-08-16' }, // søndag
    { date: '2026-08-17' }, // mandag
    { date: '2026-08-18' }, // tirsdag
    { date: '2026-08-19' } //  onsdag
  ];

  it('én klar vinner navngis med ukedag', () => {
    const r = beskrivToppdag(DAGER, [60, 62, 61, 88, 60, 59, 61], 'NO');
    expect(r.line).toBe('Ser best ut på søndag.');
    expect(r.toppIndekser).toEqual([3]);
  });

  it('vinneren i dag omtales som «i dag», ikke som torsdag', () => {
    const r = beskrivToppdag(DAGER, [90, 62, 61, 60, 60, 59, 61], 'NO');
    expect(r.line).toBe('Ser best ut i dag.');
    expect(r.toppIndekser).toEqual([0]);
  });

  it('to dager uavgjort: begge navngis, setningen starter med stor bokstav', () => {
    const r = beskrivToppdag(DAGER, [60, 88, 61, 88, 60, 59, 61], 'NO');
    expect(r.line).toBe('Fredag og søndag ser like gode ut.');
    expect(r.toppIndekser).toEqual([1, 3]);
  });

  it('tre dager uavgjort: alle tre navngis — ellers får skjermleseren ingenting', () => {
    const r = beskrivToppdag(DAGER, [60, 88, 88, 88, 60, 59, 61], 'NO');
    expect(r.line).toBe('Fredag, lørdag og søndag deler toppen denne uka.');
    expect(r.toppIndekser).toEqual([1, 2, 3]);
  });

  it('over fire uavgjorte: oppramsingen blir uleselig, og da sier vi «flere»', () => {
    const r = beskrivToppdag(DAGER, [88, 88, 88, 88, 88, 60, 88], 'NO');
    expect(r.line).toBe('Flere dager deler toppen denne uka.');
    expect(r.toppIndekser).toHaveLength(6);
  });

  it('jevn uke sjekkes først — sju like dager gir ingen uthevede søyler', () => {
    const r = beskrivToppdag(DAGER, [80, 80, 80, 80, 80, 80, 80], 'NO');
    expect(r.line).toBe('Jevne forhold hele uka — ingen klar toppdag.');
    expect(r.toppIndekser).toEqual([]);
  });

  it('små forskjeller er ikke en toppdag — under terskelen regnes uka som jevn', () => {
    const r = beskrivToppdag(DAGER, [80, 81, 82, 83, 84, 83, 82], 'NO');
    expect(r.toppIndekser).toEqual([]);
    expect(r.line).toContain('ingen klar toppdag');
  });

  it('svensk: alle variantene er på svensk', () => {
    expect(beskrivToppdag(DAGER, [60, 62, 61, 88, 60, 59, 61], 'SE').line).toBe('Ser bäst ut på söndag.');
    expect(beskrivToppdag(DAGER, [90, 62, 61, 60, 60, 59, 61], 'SE').line).toBe('Ser bäst ut idag.');
    expect(beskrivToppdag(DAGER, [60, 88, 61, 88, 60, 59, 61], 'SE').line).toBe(
      'Fredag och söndag ser lika bra ut.'
    );
    expect(beskrivToppdag(DAGER, [60, 88, 88, 88, 60, 59, 61], 'SE').line).toBe(
      'Fredag, lördag och söndag delar toppen den här veckan.'
    );
    expect(beskrivToppdag(DAGER, [80, 80, 80, 80, 80, 80, 80], 'SE').line).toContain('ingen tydlig toppdag');
  });
});
