/**
 * Vertstrær og substrat — ordene i `mushroom_species.mycorrhizal_partners` og
 * `.substrate`, på leserens språk.
 *
 * Begge kolonnene er NORSKE i basen ('furu', 'bjørk', 'død ved'). Vokabularet
 * er lite — ti trær og sju korte substratverdier dekker 78 av 80 arter — så en
 * oppslagstabell gjør jobben uten en migrasjon. Navnene er alminnelige svenske
 * treslagsnavn, ikke oversettelser gjort ord for ord («furu» er «tall»).
 *
 * ÉN TABELL. Den svenske tretabellen sto før skrevet ut i «se etter»-linja
 * (what-to-look-for.ts), som nå importerer den herfra. Prediksjonsforklaringen
 * (prediction-explanation.ts) har fortsatt sin egen kopi; testen
 * __tests__/vertstraer.test.ts feiler hvis de to noen gang sier forskjellig
 * ord for samme tre.
 *
 * TO REGLER FOR UKJENTE ORD, med vilje:
 *   - I en SETNING (what-to-look-for.ts) slipper et ukjent ord gjennom uendret:
 *     et norsk trenavn er bedre enn en setning med hull i.
 *   - I FAKTALISTA på artssiden (vertstreListe, substratVisning) vises et
 *     ukjent ord ikke på svensk: en rad som blander språk under en svensk
 *     etikett ser ut som en feil, og resten av lista står fint alene.
 * Kommer det et nytt tre eller substrat inn i basen, må det legges inn her.
 */

/**
 * Norsk: verdiene i basen ER allerede norske. Tabellen retter bare skrivemåter
 * uten æøå og gir prosaformen av «contorta».
 */
export const VERTSTRE_NB: Readonly<Record<string, string>> = {
  bjork: 'bjørk',
  bok: 'bøk',
  lerk: 'lerk',
  contorta: 'contortafuru'
};

/** Svensk navn per vertstre, slik treet står skrevet i basen (og uten æøå). */
export const VERTSTRE_SV: Readonly<Record<string, string>> = {
  gran: 'gran',
  furu: 'tall',
  bjørk: 'björk',
  bjork: 'björk',
  eik: 'ek',
  bøk: 'bok',
  bok: 'bok',
  ask: 'ask',
  alm: 'alm',
  osp: 'asp',
  or: 'al',
  selje: 'sälg',
  rogn: 'rönn',
  hassel: 'hassel',
  lind: 'lind',
  lerk: 'lärk',
  contorta: 'contortatall'
};

/**
 * Substratverdiene som har en kort, entydig svensk form. `substrate` er
 * fritekst i basen; to arter har en hel norsk setning der, og de vises ikke på
 * svensk (se substratVisning).
 */
export const SUBSTRAT_SV: Readonly<Record<string, string>> = {
  jord: 'jord',
  'død ved': 'död ved',
  'jord eller mose': 'jord eller mossa',
  'død ved eller jord': 'död ved eller jord',
  'død ved (stubber)': 'död ved (stubbar)',
  'ved rot/stubbe': 'rötter och stubbar',
  'jord/strø': 'jord och förna'
};

function rens(verdi: unknown): string {
  return typeof verdi === 'string' ? verdi.trim() : '';
}

/**
 * Ett vertstre på leserens språk. `null` når verdien er tom, eller når vi på
 * svensk ikke har et navn for den.
 */
export function vertstreNavn(verdi: unknown, locale: string): string | null {
  const tre = rens(verdi).toLowerCase();
  if (!tre) return null;
  if (locale === 'sv') return VERTSTRE_SV[tre] ?? null;
  return VERTSTRE_NB[tre] ?? tre;
}

/**
 * Artens vertstrær til faktalista, i basens rekkefølge og uten dubletter.
 * Tåler at kolonnen er null, ikke en liste, eller har tomme elementer — raden
 * kommer fra `select('*')` og er ikke typet.
 */
export function vertstreListe(verdier: unknown, locale: string): string[] {
  if (!Array.isArray(verdier)) return [];
  const ut: string[] = [];
  for (const verdi of verdier) {
    const navn = vertstreNavn(verdi, locale);
    if (navn && !ut.includes(navn)) ut.push(navn);
  }
  return ut;
}

/**
 * Substratet til faktalista. Norsk: teksten som står i basen. Svensk: bare
 * verdiene i SUBSTRAT_SV — ellers ingen rad.
 */
export function substratVisning(verdi: unknown, locale: string): string | null {
  const substrat = rens(verdi);
  if (!substrat) return null;
  if (locale === 'sv') return SUBSTRAT_SV[substrat.toLowerCase()] ?? null;
  return substrat;
}
