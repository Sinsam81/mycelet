import { describe, expect, it } from 'vitest';
import { forecastBarHeights, isFlatWeek } from '../forecast-bars';

/**
 * Søylehøyden var `Math.max(10, score)%` — en absolutt skala i en 48 px-boks.
 * Målt aug–okt (ERA5, 14 steder NO+SE, 2014–2024, n = 14 168 uker): spennet
 * innenfor ÉN uke har median 17 poeng, som ble 8,2 piksler. Under det øyet leser
 * som forskjell.
 */
describe('forecastBarHeights', () => {
  it('gjør ukas beste dag synlig høyest', () => {
    // Kristiansand, ekte tall fra målingen. Onsdag/torsdag på 96 ble tegnet
    // nesten like høyt som dagens 78.
    const uke = [78, 78, 95, 96, 96, 90, 80];
    const h = forecastBarHeights(uke);
    const beste = Math.max(...h);
    const idag = h[0];
    // Terskelen var 50 da bunnen sto fast på 14 %. Nå forankres bunnen i hvor
    // god ukas svakeste dag er (78 ⇒ ~56 %), så avstanden blir 44,5 i stedet.
    // Fortsatt over 20 piksler i en 48 px-boks — og langt fra de ~18
    // prosentpoengene den absolutte skalaen ga, som var den opprinnelige feilen.
    expect(beste - idag).toBeGreaterThan(35);
    expect(beste).toBe(100);
  });

  it('bruker hele boksen selv når spennet er lite', () => {
    const h = forecastBarHeights([70, 74, 78, 82, 76, 72, 71]);
    expect(Math.max(...h)).toBe(100);
    // Beste og verste dag må være tydelig ulike — det er hele poenget med stripa.
    expect(Math.max(...h) - Math.min(...h)).toBeGreaterThan(40);
  });

  it('lar ingen søyle forsvinne', () => {
    for (const uke of [[10, 100], [0, 50, 100], [95, 96, 97, 98, 99, 100, 40]]) {
      for (const v of forecastBarHeights(uke)) expect(v).toBeGreaterThanOrEqual(14);
    }
  });

  /**
   * REGRESJONSVAKT — den ekte uka fra produksjon 2026-08-07 (Oslo).
   *
   * Lørdagens 72 ble tegnet som 14 %: nesten ingenting, fordi den tilfeldigvis
   * var ukas laveste. 72 er over 25-persentilen i sesong (p25 = 73, median 86),
   * altså en helt grei soppdag. Forsiden sa «Høysesong!» og tegnet en tom søyle
   * i morgen — og det er den slags selvmotsigelse som koster tillit.
   */
  it('tegner ikke en grei dag som nesten ingenting fordi den er ukas laveste', () => {
    const h = forecastBarHeights([90, 72, 80, 81, 83, 84, 82]);
    const [idag, lordag] = h;
    expect(lordag, 'lørdagens 72 er en grei dag og skal ikke se tom ut').toBeGreaterThan(40);
    expect(idag, 'dagens 90 skal fortsatt være synlig best').toBe(100);
    expect(idag - lordag, 'forskjellen må fortsatt være lett å lese').toBeGreaterThan(25);
  });

  it('lar bunnen følge hvor god ukas svakeste dag faktisk er', () => {
    // Samme spenn (18 poeng), helt ulik kvalitet. Den svake uka skal starte
    // lavere enn den gode — det var nettopp dette den faste bunnen skjulte.
    const god = forecastBarHeights([90, 72, 80, 81, 83, 84, 82]);
    const svak = forecastBarHeights([48, 30, 38, 39, 41, 42, 40]);
    expect(Math.min(...svak)).toBeLessThan(Math.min(...god));
  });

  it('lar en jevnt elendig uke se lav ut, og en jevnt god uke høy', () => {
    // Begge er «jevne» uker uten en beste dag. Før fikk begge 55 %.
    const elendig = forecastBarHeights([30, 31, 32, 30, 29, 31, 30]);
    const god = forecastBarHeights([88, 89, 90, 88, 87, 89, 88]);
    expect(new Set(elendig).size).toBe(1);
    expect(new Set(god).size).toBe(1);
    expect(elendig[0]).toBeLessThan(god[0]);
  });

  it('blåser ikke opp støy til fjell på en jevn uke', () => {
    // 2 poengs forskjell er ikke «dagen å dra ut». Å tegne den dobbelt så høy
    // ville vært en påstand modellen ikke bærer.
    const h = forecastBarHeights([80, 81, 82, 80, 79, 81, 80]);
    expect(new Set(h).size).toBe(1);
  });

  it('takler tom og enkelt-dags uke', () => {
    expect(forecastBarHeights([])).toEqual([]);
    expect(forecastBarHeights([70])).toHaveLength(1);
    expect(forecastBarHeights([70])[0]).toBeGreaterThan(0);
  });

  it('isFlatWeek skiller jevn fra ujevn', () => {
    expect(isFlatWeek([80, 81, 82])).toBe(true);
    expect(isFlatWeek([70, 85, 90])).toBe(false);
    expect(isFlatWeek([])).toBe(true);
  });
});
