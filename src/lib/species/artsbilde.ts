/**
 * Hvilken bredde artssiden ber om for hvert artsbilde.
 *
 * `commons-thumb.ts` kan skrive om bredden i en miniatyr-URL. Denne modulen
 * vet hvor langt det er verdt å gå for det ENKELTE bildet: lista i
 * commons-smale-originaler.generated.ts har originalbredden til de bildene som
 * er smalere enn det bredeste trinnet (21 av 72 den 16. november 2026 — tre av
 * dem under 500 piksler). Ber vi Commons om mer enn originalen har, får vi en
 * oppskalert fil: flere byte, samme bilde.
 *
 *   KJENT SMAL   → aldri bredere enn originalen
 *   IKKE I LISTA → behandles som stor. Det er riktig for de 51 store bildene i
 *                  dag, og optimistisk for et bilde som legges til senere uten
 *                  at lista regenereres: et lite bilde hentes da oppskalert til
 *                  noen kjører skriptet. Ingenting går i stykker — komponenten
 *                  som viser bildet (Artsbilde.tsx) faller tilbake på den
 *                  lagrede utgaven hvis en bredde ikke lar seg laste.
 *
 * Krediteringen følger FILA, ikke bredden: fotograf, lisens og filside er de
 * samme for alle utgavene, så <PhotoCredit> trenger ingenting herfra.
 *
 * Brukes på serveren (artssiden). Lista er liten, men det er ingen grunn til å
 * sende den til nettleseren: komponentene får ferdige strenger.
 */

import { COMMONS_SMALE_ORIGINALER } from './commons-smale-originaler.generated';
import { commonsBredde, commonsFilnavn, commonsSrcSet, commonsThumb, commonsUtgaver } from './commons-thumb';

/** Bredden forvekslingskortene ber om. Kortet er opptil ~400 CSS-piksler bredt. */
const KORTBREDDE = 500;

/**
 * Plassen hovedbildet får på artssiden (`sizes`), bredest først: en fast
 * spalte når siden har nådd maksbredden, halve bredden minus spalteavstand fra
 * `md` (PageWrapper wide + grid md:grid-cols-2), full bredde minus sidemargen
 * under det — og 320 piksler på en telefon i høydeformat.
 *
 * Telefontallet er satt med vilje litt UNDER den virkelige bredden (skjermen
 * minus 32). Nettleseren velger det minste trinnet som dekker plassen ganger
 * pikseltettheten, og med den virkelige bredden lander en telefon med tre
 * piksler per punkt på 1280-trinnet: 300–450 kB for hovedbildet, mot 200–330
 * for 960. På 360 punkter er 960 piksler allerede 2,7 per punkt — forskjellen
 * synes ikke, men den lastes ned på mobilnett i skogen. Med 320 velger alle
 * telefoner 960-trinnet. Alt som er 480 punkter bredt eller mer — nettbrett,
 * telefon i breddeformat, et smalt nettleservindu — får det det faktisk trenger.
 */
export const HOVEDBILDE_SIZES =
  '(min-width: 1280px) 604px, (min-width: 768px) calc(50vw - 28px), (min-width: 480px) calc(100vw - 32px), 320px';

/**
 * Lista over smale originaler: Commons-filnavn → bredde. Alle funksjonene
 * under tar den som siste argument med den genererte lista som standard, så
 * testene kan sende inn sin egen og ikke ryker når lista regenereres.
 */
export type SmaleOriginaler = Readonly<Record<string, number>>;

/** Originalens bredde når vi VET at den er smal; `null` = stor eller ukjent. */
function smalOriginal(url: string | null | undefined, smale: SmaleOriginaler): number | null {
  const filnavn = commonsFilnavn(url);
  if (!filnavn || !Object.hasOwn(smale, filnavn)) return null;
  const bredde = smale[filnavn];
  return typeof bredde === 'number' && Number.isFinite(bredde) && bredde > 0 ? bredde : null;
}

/**
 * `srcset` for hovedbildet: den lagrede utgaven pluss de bredere trinnene
 * originalen faktisk har piksler til. `undefined` når det ikke er noe å velge
 * mellom — da brukes den lagrede URL-en alene, som før.
 */
export function hovedbildeSrcSet(
  url: string | null | undefined,
  smale: SmaleOriginaler = COMMONS_SMALE_ORIGINALER
): string | undefined {
  return commonsSrcSet(url, smalOriginal(url, smale));
}

/**
 * Den bredeste utgaven originalen har piksler til — til delingskortet
 * (og:image) og de strukturerte dataene, der bildet vises stort eller ikke i
 * det hele tatt: under 600 piksler får en lenke bare et lite miniatyrbilde i
 * en forhåndsvisning. Alt som ikke er en Commons-miniatyr returneres uendret.
 */
export function bredesteUtgave<T extends string | null | undefined>(
  url: T,
  smale: SmaleOriginaler = COMMONS_SMALE_ORIGINALER
): T | string {
  const utgaver = commonsUtgaver(url, smalOriginal(url, smale));
  return utgaver.length > 0 ? utgaver[utgaver.length - 1].url : url;
}

/**
 * Bildet på et forvekslingskort: 500 piksler bredt når originalen har det,
 * ellers utgaven som er lagret. Halvparten av bildene er lagret 330 brede, og
 * ble strukket nesten tre ganger på et kort i full telefonbredde.
 *
 * Returnerer aldri en SMALERE utgave enn den lagrede, og rører ikke URL-er som
 * ikke er Commons-miniatyrer.
 */
export function kortbilde<T extends string | null | undefined>(
  url: T,
  smale: SmaleOriginaler = COMMONS_SMALE_ORIGINALER
): T | string {
  const lagret = commonsBredde(url);
  // Ikke en Commons-miniatyr, eller allerede bred nok: la den stå.
  if (lagret == null || lagret >= KORTBREDDE) return url;
  const smal = smalOriginal(url, smale);
  if (smal != null && smal < KORTBREDDE) return url;
  return commonsThumb(url, KORTBREDDE);
}
