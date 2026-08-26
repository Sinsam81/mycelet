/**
 * Vurderingsforespørselen: spør om en App Store-vurdering på et GYLLENT
 * ØYEBLIKK — og aldri ellers.
 *
 * Bakgrunn (konkurrentanalysen 26.08.2026): 0 vurderinger dreper konvertering
 * uansett søkeplassering, og hele trekkraft-forspranget til «markedslederne»
 * i den norske butikken er ~26 vurderinger. Sosial bevisbyrde er porten alt
 * annet går gjennom.
 *
 * Reglene er strengere enn Apples egne, med vilje:
 *  · KUN i appskallet (en nettleserbruker kan ikke vurdere i App Store).
 *  · KUN rett etter at brukeren selv fullførte noe verdifullt: lagret et funn
 *    fra AI-identifiseringen, eller avsluttet en tur med funn i kurven.
 *    Aldri ved oppstart, aldri etter feil.
 *  · MAKS ÉN GANG NOENSINNE per enhet, uansett svar. «Nei takk» er et svar.
 *    (Samme filosofi som purremailen: én tapt forespørsel er greit, mas er
 *    det ikke.)
 *
 * Første binærversjon bruker App Stores skriv-vurdering-lenke (åpner
 * App Store-appen). Når neste binær likevel skal bygges, kan dette byttes til
 * SKStoreReviewController via Capacitor-plugin uten å endre reglene her.
 */

export const VURDERING_LAGRINGSNOKKEL = 'mycelet:vurdering-v1';

/** Uten landkode: Apple ruter til brukerens egen butikk. */
export const VURDERING_URL = 'https://apps.apple.com/app/id6784672944?action=write-review';

export type VurderingUtfall = 'vist' | 'vurderte' | 'avslo';

type LagerLes = Pick<Storage, 'getItem'>;
type LagerSkriv = Pick<Storage, 'setItem'>;

/**
 * Skal vi spørre akkurat nå? Ren beslutning — kallstedet står for at
 * øyeblikket faktisk er gyllent.
 */
export function burdeSporre(erNativ: boolean, lager: LagerLes): boolean {
  if (!erNativ) return false;
  try {
    return lager.getItem(VURDERING_LAGRINGSNOKKEL) == null;
  } catch {
    // Utilgjengelig lagring (privat modus): da kan vi ikke huske at vi har
    // spurt, og risikerer mas — la heller være å spørre i det hele tatt.
    return false;
  }
}

/**
 * Merk som håndtert. «vist» settes I DET kortet vises — samme regel som
 * purremailens merk-før-sending: ignorerer brukeren kortet og appen
 * restartes, skal vi IKKE spørre igjen. Knappene overskriver med utfallet.
 */
export function merkSomHandtert(utfall: VurderingUtfall, lager: LagerSkriv): void {
  try {
    lager.setItem(VURDERING_LAGRINGSNOKKEL, utfall);
  } catch {
    // Får vi ikke lagret, aksepterer vi risikoen for ett ekstra spørsmål
    // senere — bedre enn å kaste feil i et suksessøyeblikk.
  }
}
