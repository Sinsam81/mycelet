import type { Locale } from '@/i18n/config';
import {
  compareSpeciesByDisplayName,
  getSpeciesDisplayName,
  type LocalizedSpeciesName
} from '@/lib/utils/species-name';

/**
 * Søket i artsbiblioteket — treff og rangering, i nettleseren.
 *
 * HVORFOR DET IKKE LENGER GÅR VIA DATABASEN. Biblioteket hadde to søkeveier,
 * og begge sviktet på hver sin måte:
 *
 *  · Norsk gikk til RPC-en `search_species` (migrasjon 001). Den leser
 *    norwegian_name, latin_name, english_name og description — aldri
 *    swedish_name og aldri synonymene fra migrasjon 034 — og bretter ingen
 *    tegn. «karljohan», «stensopp», «flugsvamp» og «Clitocybe dealbata» ga
 *    null arter, og «rodskrubb» (uten ø) likeså. Fordi den søkte i
 *    BESKRIVELSEN, ga «sjampinjong» også den dødelige hvite fluesoppen: teksten
 *    om den nevner sjampinjong som forvekslingsart.
 *  · Svensk limte søketeksten rått inn i et PostgREST `.or(…)`-filter, så et
 *    komma eller en parentes i søket ga en tolkefeil og «Kunde inte hämta
 *    arter».
 *
 * Katalogen er 80 rader. Hele lista hentes derfor én gang (useSpecies.ts), og
 * dette er alt som avgjør hva et søk treffer:
 *
 *  · Navnene det søkes i: norsk, svensk, latinsk og engelsk navn, pluss de
 *    eldre vitenskapelige navnene (`synonyms_text`). ALDRI beskrivelsen — et
 *    søk på én art skal ikke gi en annen art som bare nevner den, minst av alt
 *    på en side som viser spiselighetsmerker.
 *  · Tegn brettes likt på begge sider: små bokstaver, æ/ä → a, ø/ö → o, å → a,
 *    aksenter bort. Da finner et tastatur uten æøå «rødskrubb» med «rodskrubb»,
 *    og norsk og svensk skrivemåte av samme lyd møtes.
 *  · Mellomrom, bindestreker og tegnsetting teller ikke: «karl johan» er
 *    «karljohan», og «rødfluesopp» er «rød fluesopp». Komma og parenteser er
 *    dermed bare støy.
 *
 * Bevisst IKKE med: bokstavbytter på tvers av språk (sj/ch, ei/e, øy/ö). De
 * ville fått «champignon» til å treffe «sjampinjong», men slår også sammen
 * navn som ikke er samme art. Det svenske «champinjon» treffer uansett
 * gjennom swedish_name.
 *
 * Rangeringen (lavest først) er grunnen til at RPC-ens egen sortering ikke
 * holdt: kallstedet sorterte alt alfabetisk etterpå, så «kantarell» listet
 * Blek kantarell og Falsk kantarell foran Kantarell.
 *
 *   0  navnet leseren ser er nøyaktig søket
 *   1  et av de andre navnene er nøyaktig søket
 *   2  navnet leseren ser starter med søket          3  et annet navn gjør det
 *   4  et senere ord i navnet leseren ser starter med søket   5  … i et annet navn
 *   6  søket står et sted inne i navnet leseren ser   7  … i et annet navn
 *   8  bare et eldre vitenskapelig navn treffer
 *
 * BØYDE FORMER. RPC-en brukte Postgres' norske ordstammer, så «kantareller» og
 * «fluesoppene» traff navnene i entall. Det gjør ikke en ren tekstsammenligning:
 * «kantareller» står ikke i «Kantarell». Derfor ett forsiktig ekstra forsøk i
 * `sokIArter`: gir søket INGEN treff i hele lista, prøves det på nytt uten en
 * norsk eller svensk bøyningsendelse (BOYNINGSENDELSER), korteste endelse
 * først. Det kan aldri endre eller omrokkere et søk som allerede treffer noe —
 * bare gjøre et tomt svar om til det samme svaret som stammen gir. Da står
 * også treffene stille mens man skriver «kantarell» → «kantarelle» →
 * «kantareller». Stammen må være minst MIN_STAMMELENGDE tegn, ellers ville
 * «karen» blitt til «kar» og truffet karbol-sjampinjong.
 *
 * Ord på trykklett -el, -er og -en mister e-en når de bøyes: morkel → morkler,
 * morklene; svensk tryffel → tryfflar. Der hjelper det ikke å klippe: «morkl»
 * står ikke i «morkel», så «morkler» ga null treff selv om katalogen har fire
 * morkler — nettopp artene kalenderen peker på om våren. Treffer heller ingen
 * stamme, prøves derfor søket og stammene én gang til med e-en satt inn igjen
 * (`medInnsattE`: «morkl» → «morkel»), i samme rekkefølge.
 *
 *  · Det skjer alltid SIST, så alt som ga treff uten, gir nøyaktig de samme
 *    treffene som før.
 *  · Også søket selv får e-en. Det er det som holder treffene stille forbi
 *    «morkl» og «morkle» på vei mot «morkler».
 *  · E-en faller bare ut i siste stavelse av et norsk eller svensk ord. Formen
 *    med e må derfor SLUTTE et ord i det norske eller svenske navnet
 *    (`treffMedInnsattE`). Uten det traff «navle» vintersopp gjennom skjøten i
 *    «Flammulina velutipes», og «rødr», på vei mot en art katalogen ikke har,
 *    potetrøyksopp gjennom «Scleroderma».
 *
 * Rent: ingen I/O, ingen klokke.
 */

/** Feltene søket leser. Bare de to folkenavnene er alltid med i et oppslag. */
export interface SokbarArt extends LocalizedSpeciesName {
  latin_name?: string | null;
  english_name?: string | null;
  /** Eldre vitenskapelige navn, flatet til én streng med mellomrom (migrasjon 034). */
  synonyms_text?: string | null;
}

/** Kortere søk enn dette filtrerer ikke: én bokstav treffer nesten hele katalogen. */
export const MIN_SOKELENGDE = 2;

/** Rangen til et treff som bare finnes i et eldre vitenskapelig navn. */
export const SYNONYMRANG = 8;

/** ø og æ har ingen Unicode-dekomponering, så NFD-steget under tar dem ikke. */
const UDELELIGE: Record<string, string> = { ø: 'o', æ: 'a' };

/**
 * Ordene i en tekst, brettet: små bokstaver, uten aksenter, delt på alt som
 * ikke er bokstav eller tall. ä, ö og å løses opp av NFD (a + ¨, o + ¨, a + °)
 * og mister så merket — også når teksten allerede kom dekomponert.
 */
function ordI(tekst: string): string[] {
  return tekst
    .toLowerCase()
    .replace(/[øæ]/g, (tegn) => UDELELIGE[tegn])
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Formen to tekster sammenlignes i: brettet, og uten mellomrom og tegnsetting. */
export function normaliserSok(tekst: string): string {
  return ordI(tekst).join('');
}

/** 0 = hele navnet, 1 = starten av navnet, 2 = starten av et senere ord, 3 = inne i navnet. */
type Treff = 0 | 1 | 2 | 3;

function treffINavn(navn: string | null | undefined, sok: string): Treff | null {
  if (!navn) return null;
  const ord = ordI(navn);
  const samlet = ord.join('');
  if (samlet === sok) return 0;
  if (samlet.startsWith(sok)) return 1;
  for (let i = 1; i < ord.length; i++) {
    if (ord.slice(i).join('').startsWith(sok)) return 2;
  }
  return samlet.includes(sok) ? 3 : null;
}

/**
 * Synonymfeltet er flere vitenskapelige navn etter hverandre uten skille. Et
 * treff må derfor starte ved et ord eller ligge inne i ett ord — ellers ville
 * «ap» truffet i skjøten mellom «xanthoderma» og «Psalliota».
 */
function trefferSynonym(synonymer: string | null | undefined, sok: string): boolean {
  if (!synonymer) return false;
  const ord = ordI(synonymer);
  if (ord.some((etOrd) => etOrd.includes(sok))) return true;
  for (let i = 0; i < ord.length; i++) {
    if (ord.slice(i).join('').startsWith(sok)) return true;
  }
  return false;
}

function rangerMotNormalisert(art: SokbarArt, sok: string, locale: Locale | string): number | null {
  const kandidater: Array<[string | null | undefined, boolean]> = [
    [getSpeciesDisplayName(art, locale), true],
    [art.norwegian_name, false],
    [art.swedish_name, false],
    [art.latin_name, false],
    [art.english_name, false]
  ];

  let beste: number | null = null;
  for (const [navn, erVisningsnavn] of kandidater) {
    const treff = treffINavn(navn, sok);
    if (treff == null) continue;
    const rang = treff * 2 + (erVisningsnavn ? 0 : 1);
    if (beste == null || rang < beste) beste = rang;
  }
  if (beste != null) return beste;
  return trefferSynonym(art.synonyms_text, sok) ? SYNONYMRANG : null;
}

/**
 * Hvor godt arten svarer på søket: lavere er bedre, `null` er ikke noe treff.
 * Et søk kortere enn MIN_SOKELENGDE (etter normalisering) filtrerer ikke, og
 * gir 0 for alle arter.
 *
 * Søket tas som det står. Forsøket uten bøyningsendelse gjelder hele lista og
 * ligger i `sokIArter`.
 */
export function rangerArt(art: SokbarArt, sok: string, locale: Locale | string): number | null {
  const normalisert = normaliserSok(sok);
  if (normalisert.length < MIN_SOKELENGDE) return 0;
  return rangerMotNormalisert(art, normalisert, locale);
}

/**
 * Endelsene et søk prøves uten når det ikke treffer noe som det står: flertall
 * og bestemt form på norsk og svensk («kantareller», «kremlene», «soppen»,
 * «flugsvamparna», «murklor», «judasøret»), og engelsk flertalls-s. Allerede
 * brettet (små bokstaver, ingen æøå).
 *
 * Endelsen sier bare hva som kan klippes — ikke at resten er et ord. Det
 * avgjør katalogen: stammen må treffe et navn, ellers er svaret fortsatt tomt.
 */
export const BOYNINGSENDELSER: readonly string[] = [
  'a', 'e', 'n', 'r', 's', 't',
  'ar', 'en', 'er', 'et', 'na', 'ne', 'or',
  'ane', 'ene',
  'arna', 'erna', 'orna'
];

/** Kortere stammer enn dette prøves ikke: «karen» skal ikke bli til «kar». */
export const MIN_STAMMELENGDE = 4;

const ENDELSER = new Set(BOYNINGSENDELSER);
const LENGSTE_ENDELSE = Math.max(...BOYNINGSENDELSER.map((endelse) => endelse.length));

/** Søket uten en bøyningsendelse — minst klipp først. Tom liste når ingen endelse passer. */
function stammerAv(normalisert: string): string[] {
  const stammer: string[] = [];
  for (let klipp = 1; klipp <= LENGSTE_ENDELSE; klipp++) {
    if (normalisert.length - klipp < MIN_STAMMELENGDE) break;
    if (ENDELSER.has(normalisert.slice(-klipp))) stammer.push(normalisert.slice(0, -klipp));
  }
  return stammer;
}

/**
 * Slutten på en stamme der en trykklett e har falt ut: konsonant + l, r eller
 * n («morkl» av morkler, «tryffl» av tryfflar, «fingr» av fingrene). Etter en
 * vokal har ingen e falt ut — «kantarell» + «er» klippes rent. Teksten er
 * allerede brettet, så vokalene er a, e, i, o, u og y.
 */
const UTFALT_E = /[bcdfghjklmnpqrstvwxz][lnr]$/;

/**
 * Kandidaten med e-en satt inn igjen foran siste bokstav («morkl» → «morkel»),
 * eller `null` når det ikke mangler noen. Samme minstelengde som for stammene.
 */
function medInnsattE(kandidat: string): string | null {
  if (kandidat.length < MIN_STAMMELENGDE || !UTFALT_E.test(kandidat)) return null;
  return `${kandidat.slice(0, -1)}e${kandidat.slice(-1)}`;
}

/**
 * Om søket slutter der et ord i navnet slutter: «morkel» gjør det i «Vanlig
 * morkel» og i «Sandmorkel», «vinter» gjør det ikke i «Vintersopp».
 */
function slutterEtOrd(navn: string | null | undefined, sok: string): boolean {
  if (!navn) return false;
  let hittil = '';
  for (const ord of ordI(navn)) {
    hittil += ord;
    if (hittil.endsWith(sok)) return true;
  }
  return false;
}

function treffFor<T extends SokbarArt>(arter: readonly T[], normalisert: string, locale: Locale | string): T[] {
  const treff: Array<{ art: T; rang: number }> = [];
  for (const art of arter) {
    const rang = rangerMotNormalisert(art, normalisert, locale);
    if (rang != null) treff.push({ art, rang });
  }
  return treff
    .sort((a, b) => a.rang - b.rang || compareSpeciesByDisplayName(a.art, b.art, locale))
    .map(({ art }) => art);
}

/**
 * Treffene for en form med e-en satt inn igjen: rangert som ethvert annet søk,
 * men bare artene der formen slutter et ord i det norske eller svenske navnet
 * (se filhodet). Latinske og engelske navn bøyes ikke slik.
 */
function treffMedInnsattE<T extends SokbarArt>(arter: readonly T[], medE: string, locale: Locale | string): T[] {
  return treffFor(arter, medE, locale).filter(
    (art) => slutterEtOrd(art.norwegian_name, medE) || slutterEtOrd(art.swedish_name, medE)
  );
}

/**
 * Artene som treffer søket, beste treff først og ellers etter navnet leseren
 * ser. Uten søk (eller med et for kort ett): hele lista, etter navn.
 * Returnerer alltid en ny liste.
 *
 * Treffer søket ingenting som det står, prøves det uten bøyningsendelse, og til
 * sist med en utfalt e satt inn igjen (se filhodet). Gi derfor inn HELE
 * katalogen, og filtrer på spiselighet, sesong og habitat etterpå: hva et søk
 * betyr skal ikke avhenge av hvilke andre filtre som står på.
 */
export function sokIArter<T extends SokbarArt>(arter: readonly T[], sok: string, locale: Locale | string): T[] {
  const normalisert = normaliserSok(sok);
  if (normalisert.length < MIN_SOKELENGDE) {
    return [...arter].sort((a, b) => compareSpeciesByDisplayName(a, b, locale));
  }

  const treff = treffFor(arter, normalisert, locale);
  if (treff.length > 0) return treff;

  const stammer = stammerAv(normalisert);
  for (const stamme of stammer) {
    const medStamme = treffFor(arter, stamme, locale);
    if (medStamme.length > 0) return medStamme;
  }

  // Ingen stamme traff heller: «morkler» → «morkl» → «morkel». Søket selv er
  // med, så «morkl» ikke tømmer rutenettet midt i ordet.
  for (const kandidat of [normalisert, ...stammer]) {
    const medE = medInnsattE(kandidat);
    if (medE == null) continue;
    const treffMedE = treffMedInnsattE(arter, medE, locale);
    if (treffMedE.length > 0) return treffMedE;
  }
  return [];
}
