import type { Edibility } from '@/types/species';

/**
 * Forsoningen mellom vår spiselighetsklasse og Norges sopp- og nyttevekstforbunds
 * normliste (https://soppognyttevekster.no/normlisten/).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVORFOR DETTE ER KODE OG IKKE BARE EN KOMMENTAR I EN MIGRASJON
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hele artslisten ble kontrollert mot normlisten 2026-08-04 (migrasjon 047).
 * 66 av 72 arter matchet, og det ga 6 avvik. Det avgjørende funnet var at
 * avvikene IKKE PEKTE SAMME VEI: 3 ville gjort appen mer forsiktig, 3 ville
 * gjort den mindre forsiktig.
 *
 * En naiv regel — «følg normlisten» — ville altså svekket tre advarsler, blant
 * dem sandmorkelen, som har tatt liv i Norden.
 *
 * Regelen som faktisk gjelder er:
 *
 *     Følg normlisten når den er strengere enn oss.
 *     Behold vårt når vi er strengere enn den.
 *
 * Altså: ta den MEST forsiktige av de to. Den regelen ligger i
 * `reconcileWithNormliste()` nedenfor, slik at neste runde ikke må gjenoppdage
 * den — og slik at `DELIBERATE_DIVERGENCES` står i veien for at noen «retter»
 * de tre bevisste avvikene i den tro at de er etterslep.
 */

/** Normlistens seks kategorier, ordrett som de står på nettsidene. */
export type NormlisteCategory =
  | 'Spiselig'
  | 'Spiselig med merknad'
  | 'Spiselig etter avkoking'
  | 'Ikke matsopp'
  | 'Giftig'
  | 'Meget giftig';

/**
 * Normlistens kategori -> vår klasse.
 *
 * Merk at BEGGE de betingede kategoriene lander på `conditionally_edible`. NSNF
 * skiller mellom «må avkokes» og «spiselig, men les merknaden»; vi har én klasse
 * for begge, og merknaden bæres av `edibility_notes`. Det ble vurdert å innføre
 * en egen matstatus-kolonne for skillet og forkastet — se
 * docs/artsliste-normliste-avvik.md.
 */
export const NORMLISTE_TO_EDIBILITY: Record<NormlisteCategory, Edibility> = {
  Spiselig: 'edible',
  'Spiselig med merknad': 'conditionally_edible',
  'Spiselig etter avkoking': 'conditionally_edible',
  'Ikke matsopp': 'inedible',
  Giftig: 'toxic',
  'Meget giftig': 'deadly'
};

/**
 * Hvor forsiktig en klasse er, fra frieste til strengeste.
 *
 * Rekkefølgen er ikke «hvor giftig», men «hvor mye appen holder igjen»:
 * `inedible` ligger over `conditionally_edible` fordi den sier ikke spis,
 * mens den betingede sier spis, men slik.
 *
 * `unknown` ligger øverst med vilje. Den betyr at vi ikke vet, og appen
 * behandler den allerede som farlig (se isDangerousEdibility i
 * src/lib/utils/edibility.ts). Ingen ekstern liste skal kunne snakke oss ned fra
 * den uten at et menneske har sett på arten.
 */
const CAUTION_RANK: Record<Edibility, number> = {
  edible: 0,
  conditionally_edible: 1,
  inedible: 2,
  toxic: 3,
  deadly: 4,
  unknown: 5
};

export function cautionRank(e: Edibility): number {
  return CAUTION_RANK[e];
}

/**
 * Returnerer klassen vi skal bruke: den mest forsiktige av vår egen og
 * normlistens.
 *
 * Dette er den ENESTE riktige måten å ta inn en ekstern kilde på i et felt der
 * feil i én retning kan skade noen. Kilden kan gjøre oss strengere; den kan
 * aldri gjøre oss mildere på egen hånd.
 */
export function reconcileWithNormliste(
  ours: Edibility,
  normliste: NormlisteCategory
): Edibility {
  const theirs = NORMLISTE_TO_EDIBILITY[normliste];
  return cautionRank(theirs) > cautionRank(ours) ? theirs : ours;
}

/**
 * De tre artene der vi bevisst er strengere enn normlisten.
 *
 * ⚠️ IKKE «rett» disse for å matche NSNF. De er vurdert én for én, og hver
 * endring ville svekket en advarsel. Se migrasjon 047 punkt 6.
 */
export const DELIBERATE_DIVERGENCES: ReadonlyArray<{
  latin: string;
  norsk: string;
  normliste: NormlisteCategory;
  vaar: Edibility;
  hvorfor: string;
}> = [
  {
    latin: 'Gyromitra esculenta',
    norsk: 'Sandmorkel',
    normliste: 'Giftig',
    vaar: 'deadly',
    hvorfor:
      'Gyromitrin har tatt liv i Norden. NSNF reserverer «Meget giftig» for ' +
      'amatoksinsoppene, så deres «Giftig» er ikke et signal om at arten er mild. ' +
      'Vi svekker ikke en advarsel på en sopp som har drept for å passe inn i en ' +
      'skala med fire trinn.'
  },
  {
    latin: 'Russula emetica',
    norsk: 'Giftkremle',
    normliste: 'Ikke matsopp',
    vaar: 'toxic',
    hvorfor:
      'Ingen plukker denne som mat uansett, så en for streng klasse koster ' +
      'ingenting — mens en for mild kan koste noe.'
  },
  {
    latin: 'Lactarius scrobiculatus',
    norsk: 'Svovelriske',
    normliste: 'Spiselig etter avkoking',
    vaar: 'inedible',
    hvorfor:
      'Å følge normlisten her ville vært en OPPGRADERING mot spiselig. Det er den ' +
      'ene retningen som kan skade noen, og ingen har etterspurt arten.'
  }
];

/**
 * Arter som ikke står på normlisten i det hele tatt.
 *
 * Normlisten er en pensumliste på 218 arter, ikke et komplett register. At en
 * art mangler er derfor IKKE en fordømmelse — men det betyr at klassen er vår
 * egen vurdering, og det skal være synlig. I databasen bærer disse
 * `verified = false`.
 */
export const NOT_ON_NORMLISTE: ReadonlyArray<{ latin: string; norsk: string }> = [
  { latin: 'Morchella elata', norsk: 'Spiss morkel' },
  { latin: 'Verpa bohemica', norsk: 'Stankmorkel' },
  { latin: 'Russula cyanoxantha', norsk: 'Broket kremle' },
  { latin: 'Hypholoma lateritium', norsk: 'Tegltoppsopp' },
  { latin: 'Russula xerampelina', norsk: 'Sildekremle' },
  { latin: 'Cantharellus pallens', norsk: 'Blek kantarell' }
];
