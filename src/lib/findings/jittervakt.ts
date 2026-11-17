/**
 * Snubletråd for vakten i migrasjon 042.
 *
 * Alt som oppdaterer et funn uten å endre delingen — nytt notat, ny art,
 * sletting, gjenoppretting — hviler på at triggeren `set_display_location` lar
 * display_* stå i fred når verken posisjon, synlighet eller sone er endret. Det
 * er 042 som gir den oppførselen. Uten den trekker HVER oppdatering av et
 * omtrentlig funn et nytt tilfeldig punkt, og da er et rettet notat nok til å
 * flytte prikken på kartet.
 *
 * Migrasjonene limes inn for hånd, og en manglende 042 gir ingen feilkode —
 * bare et punkt som stille har flyttet seg. Appen kan ikke spørre databasen om
 * funksjonen er på plass (pg_proc er ikke eksponert gjennom PostgREST), men den
 * kan SE det: rutene leser display_* før og etter en oppdatering som ikke
 * skulle røre dem. Er de forskjellige, mangler vakten.
 *
 * Da er ett punkt allerede lekket for det funnet. Snubletråden hindrer de
 * neste: flagget står til instansen dør, og PATCH-ruta avviser i mellomtiden
 * notat- og artsendringer på omtrentlige funn (se route.ts). Hendelsen logges
 * som feil, med JITTERVAKT_TILTAK, så den som eier driften får vite hva som må
 * kjøres.
 *
 * Flagget er per serverinstans og dør ved kaldstart. Det er en nødbrems, ikke
 * en erstatning for migrasjonen — hovedboka (docs/migrasjoner-a-kjore.md) har
 * spørringen som svarer på om vakten er på plass (raden 042).
 */

/**
 * Det loggen ber driften gjøre når vakten mangler.
 *
 * 075, ikke 042: begge skriver set_display_location, og 075 inneholder vakten
 * fra 042 PLUSS rettingen av sone-ruta. Limes 042 inn etter 075, er vakten på
 * plass — men sone-funn røper breddegraden sin igjen. Et råd i en feillogg
 * blir fulgt uten at noen leser hovedboka først, så det må være det trygge.
 */
export const JITTERVAKT_TILTAK =
  'Kjør supabase/migrations/075_sonerute_uten_breddegradslekkasje.sql (den inneholder vakten fra 042). Lim ikke inn 042 etter 075.';

/** Det rutene leser av raden før og etter oppdateringen. */
export interface Stempling {
  visibility: string;
  is_zone_finding: boolean | null;
  zone_precision_km: number | null;
  display_latitude: number | null;
  display_longitude: number | null;
}

let mangler = false;

/** Flyttet det viste punktet seg? */
export function jitterFlyttet(
  foer: Pick<Stempling, 'display_latitude' | 'display_longitude'>,
  etter: Pick<Stempling, 'display_latitude' | 'display_longitude'>
): boolean {
  return foer.display_latitude !== etter.display_latitude || foer.display_longitude !== etter.display_longitude;
}

/**
 * Flyttet punktet seg under en oppdatering som ikke skulle røre det — UTEN at
 * noe triggeren har lov til å reagere på, er endret?
 *
 * Lesingen og skrivingen er to kall. Kommer en annen forespørsel imellom og
 * endrer delingen (to faner, et dobbelt trykk), SKAL punktet stemples på nytt,
 * og det er ikke et tegn på at vakten mangler. Derfor sammenlignes også de tre
 * delingskolonnene triggeren vokter: bare når de er like før og etter, er et
 * flyttet punkt et bevis. Uten dette ville ett sammenfall slått på nødbremsen
 * for alle og sendt driften på jakt etter en migrasjon som alt var kjørt.
 */
export function flyttetUtenGrunn(foer: Stempling, etter: Stempling): boolean {
  const sammeDeling =
    foer.visibility === etter.visibility &&
    (foer.is_zone_finding === true) === (etter.is_zone_finding === true) &&
    foer.zone_precision_km === etter.zone_precision_km;
  return sammeDeling && jitterFlyttet(foer, etter);
}

export function meldJitterVaktMangler(): void {
  mangler = true;
}

export function jitterVaktMangler(): boolean {
  return mangler;
}

/** Kun for tester. */
export function _nullstillJitterVakt(): void {
  mangler = false;
}
