import { sesongtilstand, type Sesongfase } from '@/lib/sesong/sesongtilstand';

/**
 * Hvilken sesongtekst kjøpsflatene har lov til å vise — avgjort av datoen, ikke
 * skrevet rett inn i teksten.
 *
 * Prissiden sa «🍂 Høysesongen er i gang — september og oktober er årets beste
 * soppmåneder» ubetinget, under en kommentar som lovet «ærlig sesong-urgency …
 * ingen falske nedtellinger». Prøvearkets vilkår sa «resten av høsten nå» også
 * i januar, og brødteksten over dem «Alle 12 lovende områder nær deg». Alle er
 * påstander på flaten som ber om penger, og alle var usanne store deler av
 * året.
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

/**
 * Kan en kjøpsflate love lovende områder som noe kunden får NÅ?
 *
 * Prøvearket sa «Alle 12 lovende områder nær deg» hele året, og Premium-kortene
 * på forsiden og prissiden «lovende områder nær deg». Men ⭐ Lovende på kartet
 * viser bare ruter fra «moderat» (50 av 100, CONDITION_THRESHOLDS.moderate) —
 * for alle, også betalende — og rutenettet regner uten funnhistorikk, så
 * scoren er miljøleddet (høyst 50) pluss sesongleddet fra
 * computeSeasonalScore: 15 i august–oktober, 10 i juli og november, 5 i
 * mai–juni og 2 ellers. Fra desember til april når praktisk talt ingen rute
 * opp. I november trengs en mild dag (rundt 5 °C eller mer), mye regn og tett
 * skog — det skjer av og til på Vestlandet og rundt Göteborg, sjelden rundt
 * Oslo og Stockholm. I mai og juni gir sesongleddet bare 5, så det trengs
 * mye regn (se juni under). Kartet sier det selv når søket stopper
 * (lovende-sok.ts): «forholdene er for svake til at vi kaller noe lovende
 * akkurat nå». En prøveuke startet i januar ville gitt null lovende områder
 * før belastningen på dag åtte.
 *
 * Derfor følger løftet MÅNEDEN — verken iHovedsesong (juni–november) eller
 * fasen (forsesong er juni–juli). November er soppsesong i kalenderen, og
 * {dekning}-leddet over sier fortsatt «resten av høsten nå» — det er sant om
 * hva passet DEKKER. Dette handler om hva kartet LEVERER i uka kunden prøver
 * det, og det er kulda, ikke kalenderen, som stenger i november.
 *
 * Juni står med mai, ikke med resten av sommeren. Sesongleddet er 5 i begge
 * månedene, så samme vær gir samme score. Regnet slik rutenettet regner (ingen
 * art, ingen funnhistorikk, 14 °C, 200 moh.): en vanlig granskog (bonitet 14,
 * 250 m³/ha) når 50 i juni først med 12 mm eller mer over tre dager og 80–85 %
 * luftfuktighet; 6–8 mm og 75–85 % gir 43–49. Selv rik skog (bonitet 20,
 * 400 m³/ha) trenger rundt 8 mm og 80 %. I juli er sesongleddet 10, og der
 * holder 6–8 mm og 80 % også for den vanlige granskogen. At soppsesongen
 * starter i juni, som de andre flatene sier, endrer ikke hva kartet leverer
 * i juni.
 *
 *  - 'naa'       juli–oktober: «Alle 12 lovende områder nær deg» (arket),
 *                «lovende områder nær deg» (Premium-punktene)
 *  - 'betinget'  november–juni: ingen «12», og arket sier rett ut at
 *                forholdene fra november til juni ofte er for svake til at
 *                kartet kaller noe lovende — kartets egne ord. Premium-
 *                punktene sier «når forholdene tillater det». Arket navngir
 *                månedene, så porten og påstanden er den samme (testen låser
 *                dem sammen, og låser juni til mais sesongledd).
 */
export type LovendeLofte = 'naa' | 'betinget';

/** Første og siste måned (Oslo-tid) kjøpsflatene kan love lovende områder nå. */
const LOVENDE_FRA_MANED = 7;
const LOVENDE_TIL_MANED = 10;

export function lovendeLofte(naa: Date = new Date()): LovendeLofte {
  const { maaned } = sesongtilstand(naa);
  return maaned >= LOVENDE_FRA_MANED && maaned <= LOVENDE_TIL_MANED ? 'naa' : 'betinget';
}

/**
 * Prøvearkets brødtekst for alle utløsere unntatt «begrenset». Den har sin
 * egen («Gratis viser 3 … alle 12») og vises bare etter at kartet faktisk har
 * vist lovende områder — da er tallet sant.
 */
export type ProvearkTekst = 'tekstStart' | 'tekstStartBetinget';

export function provearkTekst(naa: Date = new Date()): ProvearkTekst {
  return lovendeLofte(naa) === 'naa' ? 'tekstStart' : 'tekstStartBetinget';
}

/** Prediksjonspunktet på forsidens Premium-kort (navnerommet Home). */
export type PrediksjonspunktHjem = 'premiumFeatureFullPrediction' | 'premiumFeatureFullPredictionBetinget';

export function prediksjonspunktHjem(naa: Date = new Date()): PrediksjonspunktHjem {
  return lovendeLofte(naa) === 'naa' ? 'premiumFeatureFullPrediction' : 'premiumFeatureFullPredictionBetinget';
}

/** Samme punkt på Premium-kortet på prissiden (navnerommet Pricing). */
export type PrediksjonspunktPris = 'premiumFeature2' | 'premiumFeature2Betinget';

export function prediksjonspunktPris(naa: Date = new Date()): PrediksjonspunktPris {
  return lovendeLofte(naa) === 'naa' ? 'premiumFeature2' : 'premiumFeature2Betinget';
}
