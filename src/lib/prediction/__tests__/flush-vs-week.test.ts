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

  it('peker ikke ut EN vinner når flere deler toppen — men tier ikke heller', () => {
    // Samme regel som «Best {dag}»: uavgjort er ikke én vinner. Men å tie helt
    // var en overkorreksjon — målt live sto Göteborg på 50 i dag mot 70 på to
    // dager senere i uka, og banneret sa ingenting. Løftet er sant uansett
    // hvilken av dem som vinner.
    const ut = reconcileFlushWithWeek(SOON, uke([50, 59, 59, 70, 70, 67, 55]), 'nb');
    expect(ut.title).toBe('Bedre forhold senere denne uka');
    // Ingen enkeltdag navngis.
    for (const dag of ['tor', 'fre', 'lør', 'søn', 'man', 'tir']) {
      expect(ut.title).not.toContain(dag);
    }
    expect(ut.message).toContain('20'); // løftet, 70 − 50
    expect(ut.message).toContain('12'); // projeksjonen beholdes
  });

  it('sier «senere i uka» også når forholdene alt er modne og toppen er delt', () => {
    const modent = { ...SOON, status: 'fruiting' as const, daysUntil: 0 };
    const ut = reconcileFlushWithWeek(modent, uke([50, 59, 59, 70, 70, 67, 55]), 'nb');
    expect(ut.title).toBe(modent.title); // feiringen står
    expect(ut.message).toContain(modent.message);
    expect(ut.message).toContain('senere i uka');
  });

  it('rører ikke building, dry eller dormant', () => {
    for (const status of ['building', 'dry', 'dormant'] as const) {
      const annen = { ...SOON, status };
      expect(reconcileFlushWithWeek(annen, uke([50, 90, 60, 60, 60, 60, 60]), 'nb')).toEqual(annen);
    }
  });

  /**
   * «Forholdene er modne nå» fyrer på 52,5 % av sesongdagene — 66 % i september,
   * 69 % i oktober. Første hypotese var at fuktbøtta metter, men målingen drepte
   * den: å øke kapasiteten fra 50 til 150 mm tar andelen «modne» dager FRA
   * 76,6 % TIL 91,1 % (n = 3 312 aug–okt-døgn, 6 steder, 2019–2024). En større
   * bøtte tømmes saktere.
   *
   * Modellen har altså rett — nordisk høstmark ER våt. Banneret er ikke feil,
   * det er ubrukelig som råd når det sier det samme i tjue dager. Så det får si
   * hvilken dag som er best, uten å be noen vente.
   */
  it('ber ikke folk vente når soppen alt står ute — men sier når det blir best', () => {
    const modent = { ...SOON, status: 'fruiting' as const, daysUntil: 0 };
    const ut = reconcileFlushWithWeek(modent, uke([60, 70, 87, 72, 68, 65, 62]), 'nb');
    // Feiringen står — vi skal ikke sende noen hjem fra en moden skog.
    expect(ut.title).toBe(modent.title);
    expect(ut.status).toBe('fruiting');
    // …men tillegget forteller hvilken dag som blir toppen.
    expect(ut.message).toContain(modent.message);
    expect(ut.message).toContain('fre');
    expect(ut.message).toContain('27');
  });

  it('lar modne forhold stå urørt på en jevn uke', () => {
    const modent = { ...SOON, status: 'fruiting' as const, daysUntil: 0 };
    expect(reconcileFlushWithWeek(modent, uke([80, 82, 79, 81, 78, 80, 83]), 'nb')).toEqual(modent);
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
