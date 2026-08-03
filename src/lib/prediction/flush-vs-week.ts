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
}

const COPY: Record<Locale, WeekCopy> = {
  nb: {
    title: (dag) => `Beste dagen denne uka: ${dag}`,
    message: (loft, dager) =>
      `Forholdene er merkbart bedre enn i dag (+${loft} poeng). Det er meldt regn som kan gi en ny bølge om ~${dager} dager, men du trenger ikke vente på den.`
  },
  sv: {
    title: (dag) => `Bästa dagen den här veckan: ${dag}`,
    message: (loft, dagar) =>
      `Förhållandena är märkbart bättre än i dag (+${loft} poäng). Det är aviserat regn som kan ge en ny våg om ~${dagar} dagar, men du behöver inte vänta på den.`
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
  if (flush.status !== 'soon' || flush.daysUntil == null) return flush;
  if (days.length < 2) return flush;

  const today = days.find((d) => d.isToday);
  if (!today) return flush;

  const senere = days.filter((d) => !d.isToday);
  if (senere.length === 0) return flush;

  const best = senere.reduce((a, b) => (b.score > a.score ? b : a));
  const loft = best.score - today.score;
  if (loft < MEANINGFUL_LIFT) return flush;

  // Uavgjort mellom flere dager er ikke en vinner å peke på — se den samme
  // regelen for «Best {dag}» i forecast-best-day.ts.
  const delerToppen = senere.filter((d) => d.score === best.score).length > 1;
  if (delerToppen) return flush;

  const copy = COPY[locale] ?? COPY[DEFAULT_LOCALE];
  return {
    ...flush,
    title: copy.title(best.label),
    message: copy.message(loft, flush.daysUntil)
  };
}
