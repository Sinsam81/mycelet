import { describe, expect, it } from 'vitest';
import { reconcileFlushWithWeek, type WeekDay } from '../flush-vs-week';
import type { FlushAssessment } from '../flush';

/**
 * «Regn på vei — sopp om ~N dager» har utfallsrom 9–14 dager, mens stripen rett
 * under viser dag 0–6. Målt (ERA5, 11 steder, 2018–2024, 1 844 «soon»-døgn):
 * 100,0 % av bannerne pekte utenfor stripen, og i 77 % hadde stripen selv en dag
 * som var ≥10 poeng bedre enn i dag. To paneler i samme kort, motsatt råd.
 */
const SOON: FlushAssessment = {
  status: 'soon',
  daysUntil: 12,
  title: 'Regn på vei — sopp om ~12 dager',
  message: 'Det er meldt regn om 4 dager. Soppen følger gjerne ~1 uke etter.'
};

const uke = (scores: number[]): WeekDay[] =>
  scores.map((score, i) => ({ score, label: ['I dag', 'tor', 'fre', 'lør', 'søn', 'man', 'tir'][i], isToday: i === 0 }));

describe('reconcileFlushWithWeek', () => {
  it('lar stripens vinner overstyre en projeksjon utenfor vinduet', () => {
    // Göteborg, ekte tilfelle: «sopp om ~12 dager» mens fredag står på 87.
    const ut = reconcileFlushWithWeek(SOON, uke([60, 70, 87, 72, 68, 65, 62]), 'nb');
    expect(ut.title).toContain('fre');
    expect(ut.title).not.toContain('12');
    // Projeksjonen kastes ikke — den blir tillegget.
    expect(ut.message).toContain('12');
    expect(ut.message).toContain('27'); // løftet, 87 − 60
  });

  it('rører ikke banneret når uka ikke har noe bedre å tilby', () => {
    const uendret = reconcileFlushWithWeek(SOON, uke([80, 82, 79, 81, 78, 80, 83]), 'nb');
    expect(uendret).toEqual(SOON);
  });

  it('peker ikke ut en vinner når flere deler toppen', () => {
    // Samme regel som «Best {dag}» ellers i appen: uavgjort er ikke en vinner.
    const uendret = reconcileFlushWithWeek(SOON, uke([60, 90, 90, 70, 65, 62, 61]), 'nb');
    expect(uendret).toEqual(SOON);
  });

  it('rører bare status soon', () => {
    for (const status of ['fruiting', 'building', 'dry', 'dormant'] as const) {
      const annen = { ...SOON, status };
      expect(reconcileFlushWithWeek(annen, uke([50, 90, 60, 60, 60, 60, 60]), 'nb')).toEqual(annen);
    }
  });

  it('svarer på svensk', () => {
    const ut = reconcileFlushWithWeek(SOON, uke([60, 70, 87, 72, 68, 65, 62]), 'sv');
    expect(ut.title).toContain('Bästa dagen');
    expect(ut.message).toContain('bättre');
  });

  it('takler manglende eller kort stripe', () => {
    expect(reconcileFlushWithWeek(SOON, [], 'nb')).toEqual(SOON);
    expect(reconcileFlushWithWeek(SOON, uke([60]), 'nb')).toEqual(SOON);
  });
});
