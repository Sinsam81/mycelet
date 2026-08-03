/**
 * Rydder opp når flush-banneret og 7-dagersstripen gir motsatt råd.
 *
 * Banneret svarer «gå nå eller vent?». Stripen svarer «hvilken dag denne uka?».
 * De modellerer to forskjellige ting — banneret projiserer en FLUSH 8–16 døgn
 * etter et gjennomvått regn, stripen viser daglig værgunstighet — så de KAN
 * være uenige uten at noen av dem tar feil. Problemet er at brukeren ikke kan
 * vite det, og de står rett over hverandre i samme kort.
 *
 * Målt (ERA5, 11 steder NO+SE, 2018–2024, 13 482 sesongdøgn, 1 844 «soon»-døgn
 * = 13,7 % av sesongen, altså ikke et hjørnetilfelle):
 *
 *   - daysUntil ligger mellom 9 og 14. Utfallsrommet er låst der, fordi
 *     rainDay ∈ 1..6 og laget er 8–16. **100,0 %** av dem peker utenfor dag 0–6,
 *     som er nøyaktig det stripen rett under viser.
 *   - I **77 %** av de døgnene har stripen selv en dag som er minst 10 poeng
 *     bedre enn i dag (median løft 18 poeng).
 *   - I 36 % er minst én søyle grønn.
 *
 * Altså: «Regn på vei — sopp om ~12 dager» over en graf der torsdag denne uka er
 * ukas beste dag.
 *
 * Løsningen er ikke å skjule den ene. Stripen er det mest umiddelbare og
 * handlingsrettede signalet, så når den har en tydelig vinner innenfor vinduet,
 * skal banneret si det FØRST og la flush-projeksjonen bli tillegget. Da peker
 * begge samme vei, og brukeren får både «dra på torsdag» og «og så kommer det
 * en ny bølge om et par uker».
 */
import type { FlushAssessment } from '@/lib/prediction/flush';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

/**
 * Hvor mye bedre en dag må være enn i dag for at det skal telle som et råd.
 * Under dette er forskjellen innenfor modellens egen usikkerhet, og å sende
 * noen ut på en bestemt dag ville vært en påstand den ikke bærer.
 */
const MEANINGFUL_LIFT = 10;

interface WeekCopy {
  title: (dag: string) => string;
  message: (loft: number, dager: number) => string;
  /** Tillegget når forholdene alt ER modne, men én dag stikker seg ut. */
  peakSuffix: (dag: string, loft: number) => string;
  /** Når flere dager deler toppen — vi peker ikke ut én, men tier ikke heller. */
  tiedTitle: string;
  tiedMessage: (loft: number, dager: number) => string;
  tiedSuffix: (loft: number) => string;
}

const COPY: Record<Locale, WeekCopy> = {
  nb: {
    title: (dag) => `Beste dagen denne uka: ${dag}`,
    message: (loft, dager) =>
      `Forholdene er merkbart bedre enn i dag (+${loft} poeng). Det er meldt regn som kan gi en ny bølge om ~${dager} dager, men du trenger ikke vente på den.`,
    peakSuffix: (dag, loft) => ` Best blir det på ${dag} (+${loft} poeng).`,
    tiedTitle: 'Bedre forhold senere denne uka',
    tiedMessage: (loft, dager) =>
      `Flere dager senere i uka ligger merkbart bedre an enn i dag (+${loft} poeng). Det er meldt regn som kan gi en ny bølge om ~${dager} dager, men du trenger ikke vente på den.`,
    tiedSuffix: (loft) => ` Det blir enda bedre senere i uka (+${loft} poeng).`
  },
  sv: {
    title: (dag) => `Bästa dagen den här veckan: ${dag}`,
    message: (loft, dagar) =>
      `Förhållandena är märkbart bättre än i dag (+${loft} poäng). Det är aviserat regn som kan ge en ny våg om ~${dagar} dagar, men du behöver inte vänta på den.`,
    peakSuffix: (dag, loft) => ` Bäst blir det på ${dag} (+${loft} poäng).`,
    tiedTitle: 'Bättre förhållanden senare i veckan',
    tiedMessage: (loft, dagar) =>
      `Flera dagar senare i veckan ligger märkbart bättre till än i dag (+${loft} poäng). Det är aviserat regn som kan ge en ny våg om ~${dagar} dagar, men du behöver inte vänta på den.`,
    tiedSuffix: (loft) => ` Det blir ännu bättre senare i veckan (+${loft} poäng).`
  }
};

export interface WeekDay {
  label: string;
  score: number;
  isToday: boolean;
}

/**
 * Erstatter banneret når stripen har et tydelig bedre svar innenfor sitt eget
 * vindu. Returnerer vurderingen uendret i alle andre tilfeller — også når
 * statusen ikke er 'soon', for da peker ikke banneret utenfor uka.
 */
export function reconcileFlushWithWeek(
  flush: FlushAssessment,
  days: WeekDay[],
  locale: Locale = DEFAULT_LOCALE
): FlushAssessment {
  if (flush.status !== 'soon' && flush.status !== 'fruiting') return flush;
  if (flush.status === 'soon' && flush.daysUntil == null) return flush;
  if (days.length < 2) return flush;

  const today = days.find((d) => d.isToday);
  if (!today) return flush;

  const senere = days.filter((d) => !d.isToday);
  if (senere.length === 0) return flush;

  const best = senere.reduce((a, b) => (b.score > a.score ? b : a));
  const loft = best.score - today.score;
  if (loft < MEANINGFUL_LIFT) return flush;

  // Uavgjort mellom flere dager er ikke ÉN vinner å peke på — samme regel som
  // «Best {dag}» ellers i appen. Men å tie helt er en overkorreksjon: målt live
  // sto Göteborg på 50 i dag mot 70 på to dager senere i uka, og banneret sa
  // ingenting om det fordi de to delte toppen. Løftet er sant uansett hvem som
  // vinner, så vi sier «senere denne uka» i stedet for å velge en dag.
  const delerToppen = senere.filter((d) => d.score === best.score).length > 1;

  const copy = COPY[locale] ?? COPY[DEFAULT_LOCALE];

  // Er forholdene alt modne, skal vi IKKE be noen vente — soppen står ute nå.
  // Da legges ukas topp til som et tillegg i stedet for å erstatte feiringen.
  //
  // Grunnen til at det trengs: «Forholdene er modne nå» fyrer på 52,5 % av
  // sesongdagene, 66 % i september og 69 % i oktober. Første hypotese var at
  // fuktbøtta metter — 26,2 % av aug–okt ligger nøyaktig på 1,000 med en
  // kapasitet på 50 mm mot et 14-døgnsregn med median 92 mm.
  //
  // MEN: å øke kapasiteten gjør det verre, ikke bedre. Målt mot ekte vær
  // (Open-Meteo ERA5, 6 steder NO+SE, 2019–2024, n = 3 312 aug–okt-døgn):
  //
  //      kapasitet   =1,000   andel >= 0,55 («modne»)
  //          50 mm    26,2 %          76,6 %
  //         120 mm    24,4 %          87,3 %
  //         150 mm    24,0 %          91,1 %
  //
  // En større bøtte tar lengre tid å tømme, og fordampingen er kappet på
  // 5 mm/døgn. Metningen står på ~25 % uansett kapasitet.
  //
  // Konklusjonen er derfor at modellen har rett: marka i en nordisk høst ER
  // våt mesteparten av tiden. Banneret tar ikke feil — det er ubrukelig som
  // RÅD når det sier det samme i tjue dager på rad. Derfor får det si hvilken
  // dag som er best, i stedet for at fuktmodellen skrus på.
  if (flush.status === 'fruiting') {
    const tillegg = delerToppen ? copy.tiedSuffix(loft) : copy.peakSuffix(best.label, loft);
    return { ...flush, message: `${flush.message}${tillegg}` };
  }

  const dager = flush.daysUntil as number;
  return delerToppen
    ? { ...flush, title: copy.tiedTitle, message: copy.tiedMessage(loft, dager) }
    : { ...flush, title: copy.title(best.label), message: copy.message(loft, dager) };
}
