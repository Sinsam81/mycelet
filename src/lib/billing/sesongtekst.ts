import { sesongtilstand, type Sesongfase } from '@/lib/sesong/sesongtilstand';

/**
 * Hvilken sesongtekst kjøpsflatene har lov til å vise — avgjort av datoen, ikke
 * skrevet rett inn i teksten.
 *
 * Prissiden sa «🍂 Høysesongen er i gang — september og oktober er årets beste
 * soppmåneder» ubetinget, under en kommentar som lovet «ærlig sesong-urgency …
 * ingen falske nedtellinger». Prøvearkets vilkår sa «resten av høsten nå» også
 * i januar. Begge er påstander på flaten som ber om penger, og begge var usanne
 * ti måneder i året.
 *
 * Rene funksjoner over sesongtilstand() (Oslo-tid, dato sendes inn), og de gir
 * bare NØKLER tilbake — selve teksten ligger i messages/{nb,sv}.json. Ingen av
 * tekstene inneholder beløp (App Store-prisen settes per land av Apple).
 */

/**
 * Linja under overskriften på prissiden.
 *  - 'seasonUrgency'    bare september–oktober: teksten navngir nettopp de to
 *                       månedene, så porten og påstanden er den samme.
 *  - 'seasonOffSeason'  desember–mai: «hele neste soppsesong er med» — sant
 *                       fordi passet gjelder ett år, og et kjøp i de månedene
 *                       dekker hele juni–november som kommer.
 *  - null               juni–august og november: ingen linje. «Hele neste
 *                       sesong» ville vært usant (passet utløper midt i den),
 *                       og «høysesongen er i gang» stemmer ikke ennå/lenger.
 */
export type PrisSesonglinje = 'seasonUrgency' | 'seasonOffSeason';

export function prisSesonglinje(naa: Date = new Date()): PrisSesonglinje | null {
  const { maaned, iHovedsesong } = sesongtilstand(naa);
  if (maaned === 9 || maaned === 10) return 'seasonUrgency';
  if (!iHovedsesong) return 'seasonOffSeason';
  return null;
}

/**
 * Hva et sesongpass kjøpt NÅ dekker — leddet etter kolon i prøvearkets vilkår
 * («gjelder da til {dato}: {dekning}»). Alt det lovpålagte (første belastning,
 * pris, fornyelse, hvordan man avslutter) står i selve vilkårsstrengen og er
 * likt i alle varianter; bare dette leddet følger sesongen.
 *
 *  - 'passDekningHost'           aug–nov: «resten av høsten nå, og neste sesong
 *                                fram til da» (den opprinnelige ordlyden)
 *  - 'passDekningForsesong'      jun–jul: «resten av sesongen nå, og neste
 *                                sesong fram til da»
 *  - 'passDekningUtenomSesong'   des–mai: «hele neste soppsesong er med»
 */
export type PassDekning = 'passDekningHost' | 'passDekningForsesong' | 'passDekningUtenomSesong';

const DEKNING_PER_FASE: Record<Sesongfase, PassDekning> = {
  forsesong: 'passDekningForsesong',
  hoysesong: 'passDekningHost',
  ettersesong: 'passDekningHost',
  vinter: 'passDekningUtenomSesong',
  var: 'passDekningUtenomSesong'
};

export function passDekning(naa: Date = new Date()): PassDekning {
  return DEKNING_PER_FASE[sesongtilstand(naa).fase];
}
