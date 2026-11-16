import { describe, expect, it } from 'vitest';
import { reconcileFlushWithWeek, type WeekDay } from '../flush-vs-week';
import { assessFlush, type FlushAssessment } from '../flush';
import type { DailyForecast } from '@/lib/weather/forecast';

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

/**
 * Sent i sesongen (november) har flush.ts egne ord for «regn på vei»: «… usikkert
 * om soppen rekker å følge etter før sesongen er over». Erstatningen over lover
 * «en ny bølge om ~N dager», og 22. november lander det i desember, der dommen
 * sier «Utenom soppsesongen». Målt: 45 av 72 sene «regn på vei» 22.–30. november
 * ble skrevet om slik.
 */
describe('reconcileFlushWithWeek — sent i sesongen', () => {
  const UKEDAG = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];

  /** Stripen med datoer, slik ruta sender den (WeekDayScore). */
  function ukeFra(fra: string, scores: number[]): WeekDay[] {
    return scores.map((score, i) => {
      const d = new Date(`${fra}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      return { date: d.toISOString().slice(0, 10), score, label: i === 0 ? 'I dag' : UKEDAG[d.getUTCDay()], isToday: i === 0 };
    });
  }

  /** Tørr mark, 4 °C, regn i prognosen på dag `regndag` — flush.ts sitt sene «regn på vei». */
  function sentRegnPaVei(dayOfMonth: number, regndag: number, locale: 'nb' | 'sv' = 'nb'): FlushAssessment {
    const forecast: DailyForecast[] = ukeFra(`2026-11-${dayOfMonth}`, Array<number>(7).fill(0))
      .slice(1)
      .map((d, i) => ({ date: d.date!, tempC: 6, precipMm: i + 1 === regndag ? 10 : 0, humidityPct: 90 }));
    return assessFlush(
      { month: 11, dayOfMonth, soilMoistureIndex: 0.35, rain7dMm: 1.4, currentTempC: 4, forecast },
      undefined,
      locale
    );
  }

  it('beholder de sene ordene og legger til ukas beste dag — ingen «ny bølge» inn i desember', () => {
    const sent = sentRegnPaVei(22, 2);
    expect(sent).toMatchObject({ status: 'soon', daysUntil: 10, shoulder: 'late', title: 'Regn på vei — men sent i sesongen' });

    // 22. november er en søndag; tirsdag 24. stikker seg ut.
    const ut = reconcileFlushWithWeek(sent, ukeFra('2026-11-22', [32, 41, 55, 50, 49, 48, 47]), 'nb');
    expect(ut).toMatchObject({ status: 'soon', daysUntil: 10, shoulder: 'late', title: sent.title });
    expect(ut.message).toBe(`${sent.message} Best blir det på tir (+23 poeng).`);
    expect(ut.message).not.toMatch(/ny bølge|~10 dager/);
  });

  it('delt topp: «senere i uka», uten «enda bedre» — forholdene er ikke modne i dag', () => {
    const sent = sentRegnPaVei(22, 2);
    // Stripen 22. november fra gjennomgangen: 50 deles av tirsdag og onsdag.
    const ut = reconcileFlushWithWeek(sent, ukeFra('2026-11-22', [32, 41, 50, 50, 49, 48, 47]), 'nb');
    expect(ut.title).toBe(sent.title);
    expect(ut.message).toBe(`${sent.message} Flere dager senere i uka ligger merkbart bedre an enn i dag (+18 poeng).`);
    expect(ut.message).not.toMatch(/enda bedre|ny bølge/);
  });

  it('svarer på svensk', () => {
    const sent = sentRegnPaVei(22, 2, 'sv');
    const en = reconcileFlushWithWeek(sent, ukeFra('2026-11-22', [32, 41, 55, 50, 49, 48, 47]), 'sv');
    expect(en.title).toBe('Regn på väg — men sent på säsongen');
    expect(en.message).toBe(`${sent.message} Bäst blir det på tir (+23 poäng).`);
    const delt = reconcileFlushWithWeek(sent, ukeFra('2026-11-22', [32, 41, 50, 50, 49, 48, 47]), 'sv');
    expect(delt.message).toBe(
      `${sent.message} Flera dagar senare i veckan ligger märkbart bättre till än i dag (+18 poäng).`
    );
    for (const m of [en.message, delt.message]) expect(m).not.toMatch(/ny våg|ännu bättre|[æøÆØ]/);
  });

  it('navngir ingen dag etter 30. november — da står de sene ordene alene', () => {
    // 27. november: regnet kommer 1.–2. desember, og ukas topp er torsdag 3. desember.
    const sent = sentRegnPaVei(27, 5);
    const desemberuke = ukeFra('2026-11-27', [28, 37, 37, 36, 35, 45, 54]);
    expect(reconcileFlushWithWeek(sent, desemberuke, 'nb')).toEqual(sent);
    // Det samme for et sent «modent» banner.
    const modent: FlushAssessment = { ...sent, status: 'fruiting', daysUntil: 0 };
    expect(reconcileFlushWithWeek(modent, desemberuke, 'nb')).toEqual(modent);
    // Er toppen fortsatt i november, legges den til som før.
    const novembertopp = reconcileFlushWithWeek(modent, ukeFra('2026-11-24', [28, 45, 37, 36, 35, 30, 30]), 'nb');
    expect(novembertopp.message).toBe(`${modent.message} Best blir det på ons (+17 poeng).`);
  });

  it('en jevn uke lar de sene ordene stå urørt', () => {
    const sent = sentRegnPaVei(22, 2);
    expect(reconcileFlushWithWeek(sent, ukeFra('2026-11-22', [32, 35, 38, 36, 34, 33, 32]), 'nb')).toEqual(sent);
  });

  it('i høysesongen er alt som før: stripens vinner leder, projeksjonen blir tillegget', () => {
    const ut = reconcileFlushWithWeek(SOON, ukeFra('2026-10-01', [60, 70, 87, 72, 68, 65, 62]), 'nb');
    expect(ut.title).toBe('Beste dagen denne uka: lør');
    expect(ut.message).toContain('ny bølge om ~12 dager');
  });
});
