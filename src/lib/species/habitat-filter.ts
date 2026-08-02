/**
 * Habitatfilteret på artssiden.
 *
 * Bakgrunn: `mushroom_species.habitat` er en tekstliste med NORSKE ord —
 * «barskog», «løvskog», «blandingsskog» og 30 til. Filteret gjorde et rått
 * delstrengsøk mot de ordene, mens den svenske plassholderen ba brukeren
 * skrive «barrskog». Svensk staving traff ingenting: «barrskog» ga 0 arter,
 * «lövskog» ga 0. Filteret var altså ubrukelig på svensk for samtlige
 * habitatverdier — brukeren fulgte appens egen instruksjon og fikk et tomt
 * bibliotek.
 *
 * Norsk hadde en mindre variant av samme problem: basen bruker BÅDE «løvskog»
 * (28 arter) og «lauvskog» (2 arter — blant dem steinsopp), så et søk på
 * «løvskog» skjulte steinsopp.
 *
 * Løsningen er ett oppslag: hver databaseverdi får listet opp de andre
 * skrivemåtene en bruker kan finne på å skrive. Vi søker mot alle
 * skrivemåtene, ikke bare den som tilfeldigvis står i basen. Delstreng-
 * semantikken beholdes, så «skog» treffer fortsatt barskog, løvskog og
 * granskog — og «barr» treffer barskog gjennom aliaset «barrskog».
 *
 * NB: dette er en oversettelsestabell, ikke en sannhet om basen. Kommer det
 * en ny habitatverdi inn i `mushroom_species.habitat`, virker fritekstsøket
 * på den norske skrivemåten uansett; den svenske må legges inn her.
 */

export interface HabitatTerm {
  /** Verdien slik den står i mushroom_species.habitat (norsk, små bokstaver). */
  nb: string;
  /** Svensk skrivemåte av samme habitat. */
  sv: string;
  /** Andre norske skrivemåter som skal treffe samme habitat. */
  also?: string[];
}

/**
 * De 33 distinkte habitatverdiene i basen per august 2026, med svensk
 * skrivemåte. Svenske former er alminnelige svenske naturord (barrskog,
 * lövskog, blandskog, tallskog …), ikke oversettelser gjort ord for ord.
 */
export const HABITAT_TERMS: readonly HabitatTerm[] = [
  { nb: 'barskog', sv: 'barrskog' },
  { nb: 'løvskog', sv: 'lövskog', also: ['lauvskog'] },
  { nb: 'lauvskog', sv: 'lövskog', also: ['løvskog'] },
  { nb: 'blandingsskog', sv: 'blandskog' },
  { nb: 'furuskog', sv: 'tallskog' },
  { nb: 'granskog', sv: 'granskog' },
  { nb: 'eikeskog', sv: 'ekskog' },
  { nb: 'fjellbjørkeskog', sv: 'fjällbjörkskog' },
  { nb: 'lerkeskog', sv: 'lärkskog' },
  { nb: 'skog', sv: 'skog' },
  { nb: 'fuktig skog', sv: 'fuktig skog' },
  { nb: 'fuktig', sv: 'fuktig' },
  { nb: 'eng', sv: 'äng' },
  { nb: 'beite', sv: 'betesmark' },
  { nb: 'gress', sv: 'gräs' },
  { nb: 'gressplen', sv: 'gräsmatta', also: ['plen'] },
  { nb: 'plen', sv: 'gräsmatta', also: ['gressplen'] },
  { nb: 'hage', sv: 'trädgård' },
  { nb: 'park', sv: 'park' },
  { nb: 'myr', sv: 'myr' },
  { nb: 'myr-kant', sv: 'myrkant' },
  { nb: 'mose', sv: 'mossa' },
  { nb: 'moserik', sv: 'mossrik' },
  { nb: 'kantsoner', sv: 'kantzoner' },
  { nb: 'elvebredder', sv: 'älvstränder' },
  { nb: 'lysninger', sv: 'gläntor' },
  { nb: 'brannfelt', sv: 'brandfält' },
  { nb: 'kalkrik', sv: 'kalkrik' },
  { nb: 'sur jord', sv: 'sur jord' },
  { nb: 'sandig mark', sv: 'sandig mark' },
  { nb: 'sandgrunn', sv: 'sandgrund' },
  { nb: 'eldre bestand', sv: 'äldre bestånd' },
  { nb: 'sti', sv: 'stig' }
];

const TERMS_BY_NB = new Map(HABITAT_TERMS.map((term) => [term.nb, term]));

/**
 * Alle skrivemåtene én habitatverdi fra basen skal kunne finnes på.
 * Ukjente verdier gir seg selv — fritekstsøket virker fortsatt.
 */
export function habitatSearchTerms(habitat: string): string[] {
  const value = habitat.trim().toLowerCase();
  const term = TERMS_BY_NB.get(value);
  if (!term) return [value];
  return [...new Set([value, term.sv, ...(term.also ?? [])])];
}

/**
 * Treffer denne artens habitatliste det brukeren skrev?
 * Tom søketekst treffer alt (filteret er da ikke i bruk).
 */
export function matchesHabitat(habitats: readonly string[] | null | undefined, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (habitats ?? []).some((habitat) =>
    habitatSearchTerms(habitat).some((term) => term.includes(needle))
  );
}

/**
 * Forslagene i nedtrekkslista under fritekstfeltet, på brukerens språk.
 * Sortert slik at brukeren ser de vanligste skogtypene først — rekkefølgen
 * i HABITAT_TERMS — og uten duplikater (løvskog og lauvskog er samme ord på
 * svensk).
 */
export function habitatSuggestions(locale: string): string[] {
  const key = locale === 'sv' ? 'sv' : 'nb';
  return [...new Set(HABITAT_TERMS.map((term) => term[key]))];
}
