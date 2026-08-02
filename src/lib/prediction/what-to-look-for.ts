/**
 * «Se etter»-linja: én kort setning per art om hva brukeren skal lete etter
 * når hen først står i området.
 *
 * HVORFOR: den romlige valideringen (docs/validering-romlig-signal.md) viser at
 * modellen skiller SKOG fra IKKE-SKOG, men ikke ett skogsted fra et annet noen
 * kilometer unna. Da er en nummerert nål en påstand dataene ikke bærer — mens
 * «arten følger gran og bjørk, se i kanten mot lysninger» er sant uansett hvor
 * nøyaktig punktet er, og er det som faktisk hjelper i felt.
 *
 * KILDER — hver setning skal kunne spores til et felt i `mushroom_species`:
 *   - `mycorrhizal_partners`  → hvilke trær arten følger
 *   - `substrate`             → død ved / rot og stubbe / jord
 *   - `habitat`               → skogtype, åpen mark, myr, mose, brannfelt
 *   - `genus`                 → oppslag i søketabellen under
 *
 * Andre halvdel av setningen (søkerådet) er ALMINNELIG SOPPKUNNSKAP, ikke noe vi
 * har målt. Derfor er den bygget som to oppslagstabeller — én per slekt og én
 * per habitattype — slik at hvert råd kan begrunnes for en hel gruppe arter.
 * Den sier bare noe om hvordan ARTEN vokser (i rekker, i flokk, i kanten mot
 * lysninger), aldri noe om DETTE stedet. Ting vi ikke har data for — skogens
 * alder, bunnvegetasjon vi ikke har en habitat-tagg for, helning, solforhold —
 * skal ikke inn her.
 *
 * Mangler arten både vertstrær, substrat og habitat, returnerer funksjonen null.
 * Ingen linje er bedre enn en tom frase.
 *
 * NB: modulen sier bare HVOR arten vokser — den vurderer ikke spiselighet, og
 * lager like gjerne en linje for grønn fluesopp som for kantarell. Kallstedet
 * må filtrere med `isRecommendableSpecies` (recommendable.ts) før linja vises
 * som et «dra hit og let»-råd.
 *
 * Ren funksjon, og teksten genereres server-side (fliser, /api/prediction), så
 * kopien ligger i en per-språk-tabell her i modulen — samme mønster som
 * flush.ts, mushroom-day.ts og nibio/habitat.ts. next-intl dekker ikke tekst
 * som lages på serveren; se CLAUDE.md.
 */

import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';

/**
 * Radformen fra `mushroom_species`. Feltnavnene er DB-navn med vilje, så et
 * kallsted kan sende raden rett inn — og `getSpeciesDisplayName` leser
 * `norwegian_name`/`swedish_name` fra den samme raden.
 */
export interface WhatToLookForSpecies {
  norwegian_name?: string | null;
  swedish_name?: string | null;
  genus?: string | null;
  habitat?: string[] | null;
  mycorrhizal_partners?: string[] | null;
  substrate?: string | null;
}

/** Habitattypene søkerådet kan slå opp på, i prioritert rekkefølge (se pickHabitatClass). */
type HabitatClass = 'burn' | 'deadwood' | 'moss' | 'wet' | 'forest' | 'open';

// ---------------------------------------------------------------------------
// Tagg-grupper. Verdiene er slik de faktisk står i mushroom_species.habitat —
// inkludert dublettene ('løvskog' og 'lauvskog', 'beite' og 'beitemark').
// ---------------------------------------------------------------------------

const BURN_TAGS = ['brannfelt'];
const MOSS_TAGS = ['mose', 'moserik'];
const WET_TAGS = ['myr', 'myr-kant', 'fuktig', 'fuktig skog', 'elvebredder'];

const DECIDUOUS_FOREST_TAGS = ['løvskog', 'lovskog', 'lauvskog', 'eikeskog', 'fjellbjørkeskog', 'fjellbjorkeskog'];
const CONIFEROUS_FOREST_TAGS = ['barskog', 'granskog', 'furuskog', 'lerkeskog'];
const FOREST_TAGS = [...DECIDUOUS_FOREST_TAGS, ...CONIFEROUS_FOREST_TAGS, 'skog', 'blandingsskog', 'fuktig skog'];

const OPEN_TAGS = ['eng', 'beite', 'beitemark', 'gress', 'gressmark', 'gressplen', 'plen', 'park', 'hage', 'veikant'];

/**
 * Taggene som navngir et STED arten vokser. Resten av habitat-taggene ('mose',
 * 'kalkrik', 'kantsoner', 'eldre bestand' …) er egenskaper ved stedet, ikke et
 * sted i seg selv, og hører ikke hjemme i «vokser i …»-leddet.
 */
const PLACE_TAGS = [...FOREST_TAGS, ...OPEN_TAGS, 'myr'];

/** Hvor mange trær/steder vi navngir før vi skriver «blant annet». */
const MAX_NAMED_TERMS = 3;

// ---------------------------------------------------------------------------
// Kopi
// ---------------------------------------------------------------------------

interface WhatToLookForCopy {
  /** Vertstrærne slik de står i mycorrhizal_partners. Ukjente slipper gjennom uendret. */
  partnerTerms: Record<string, string>;
  /** Habitat-taggene som stedsnavn i løpende tekst. Ukjente slipper gjennom uendret. */
  placeTerms: Record<string, string>;
  and: string;
  deciduousWood: string;
  coniferousWood: string;
  symbiosis: (name: string, trees: string) => string;
  symbiosisPartial: (name: string, trees: string) => string;
  deadWood: (name: string, wood: string | null) => string;
  rootStump: (name: string, tree: string | null) => string;
  growsIn: (name: string, places: string) => string;
  growsOn: (name: string, places: string) => string;
  /** Søkeråd per slekt. Nøkkel = `genus`-kolonnen (stor forbokstav). */
  genusAdvice: Record<string, string>;
  /** Søkeråd per habitattype, brukt når slekten ikke står i tabellen over. */
  classAdvice: Record<HabitatClass, string>;
}

const COPY: Record<Locale, WhatToLookForCopy> = {
  nb: {
    // Verdiene i basen er allerede norske; tabellen retter bare opp skrivemåte
    // og gir prosa-formen av et par tagger.
    partnerTerms: {
      bjork: 'bjørk',
      bok: 'bøk',
      lerk: 'lerk',
      contorta: 'contortafuru'
    },
    placeTerms: {
      lauvskog: 'løvskog',
      lovskog: 'løvskog',
      fjellbjorkeskog: 'fjellbjørkeskog',
      beite: 'beitemark',
      gress: 'gressmark',
      gressplen: 'plen'
    },
    and: 'og',
    deciduousWood: 'løvtrær',
    coniferousWood: 'bartrær',
    symbiosis: (name, trees) => `${name} står i symbiose med ${trees}`,
    symbiosisPartial: (name, trees) => `${name} står i symbiose med blant annet ${trees}`,
    deadWood: (name, wood) => (wood ? `${name} vokser på død ved av ${wood}` : `${name} vokser på død ved`),
    rootStump: (name, tree) =>
      tree ? `${name} vokser ved rot og stubbe av ${tree}` : `${name} vokser ved rot og stubbe`,
    growsIn: (name, places) => `${name} vokser i ${places}`,
    growsOn: (name, places) => `${name} vokser på ${places}`,
    genusAdvice: {
      // Kantarell står typisk i overgangen mellom tett skog og åpning, og følger
      // stier og skrenter — den klassiske «gå i kanten»-regelen.
      Cantharellus: 'se i kanten mot lysninger og langs stier, sjelden inne i tett, mørk skog',
      // Trakt- og trompetsopp vokser i tette flokker i mosen; ett funn betyr som regel mange.
      Craterellus: 'den vokser i tette flokker i mosen, så finner du én står det som regel flere rundt',
      // Piggsopp kommer i rekker og buer langs mycelets kant.
      Hydnum: 'den står ofte i rekker og buer, så let videre langs samme linje når du har funnet den første',
      // Steinsopp og slekten står gjerne der kronedekket åpner seg.
      Boletus: 'se i halvåpne partier under vertstrærne: bestandskanter, stikanter og gamle skogsveier',
      // Rørsoppene i Suillus følger furu, og er vanligst i unge, glisne bestand og langs kanter.
      Suillus: 'den står gjerne i unge, glisne furubestand og langs stikanter',
      // Skrubbene står enkeltvis i halvåpen skog, ikke i klynger.
      Leccinum: 'den står gjerne enkeltvis i halvåpen skog og i kantsoner',
      // Parasollsopp er høy nok til å ses på avstand og danner ringer på åpen mark.
      Macrolepiota: 'den står enkeltvis eller i ring på åpen mark, og er høy nok til å ses på avstand',
      // Nellikhatt danner buer og hekseringer i kortvokst gress.
      Marasmius: 'den danner buer og hekseringer i kortvokst gress',
      // Blomkålsopp kommer igjen på samme rot/stubbe år etter år.
      Sparassis: 'den kommer igjen på samme sted år etter år, så merk deg treet',
      // Musserongene står i grupper og kan være halvt dekket av strø.
      Tricholoma: 'den står gjerne i grupper og kan være halvt skjult under barnåler og strø',
      // Kremlene står spredt, enkeltvis, under vertstrærne.
      Russula: 'den står spredt og enkeltvis under vertstrærne, sjelden i tette klynger'
    },
    classAdvice: {
      burn: 'se etter brannfelt og annen forstyrret mark',
      deadwood: 'se på stubber, nedfalne stammer og døde greiner, ofte står flere sammen på samme ved',
      moss: 'se i mosebunnen, der hatten så vidt kan stikke opp gjennom mosen',
      wet: 'se langs myrkanter og i fuktige partier',
      forest: 'gå sakte langs stier, bestandskanter og små åpninger, der du ser bakken best',
      open: 'gå sakte over den åpne marka, og se også i kantene mot kratt og skog'
    }
  },
  sv: {
    partnerTerms: {
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
    },
    placeTerms: {
      skog: 'skog',
      barskog: 'barrskog',
      granskog: 'granskog',
      furuskog: 'tallskog',
      lerkeskog: 'lärkskog',
      løvskog: 'lövskog',
      lovskog: 'lövskog',
      lauvskog: 'lövskog',
      eikeskog: 'ekskog',
      fjellbjørkeskog: 'fjällbjörkskog',
      fjellbjorkeskog: 'fjällbjörkskog',
      blandingsskog: 'blandskog',
      'fuktig skog': 'fuktig skog',
      myr: 'myr',
      eng: 'äng',
      beite: 'betesmark',
      beitemark: 'betesmark',
      gress: 'gräsmark',
      gressmark: 'gräsmark',
      gressplen: 'gräsmatta',
      plen: 'gräsmatta',
      park: 'park',
      hage: 'trädgård',
      veikant: 'vägkant'
    },
    and: 'och',
    deciduousWood: 'lövträd',
    coniferousWood: 'barrträd',
    symbiosis: (name, trees) => `${name} lever i symbios med ${trees}`,
    symbiosisPartial: (name, trees) => `${name} lever i symbios med bland annat ${trees}`,
    deadWood: (name, wood) => (wood ? `${name} växer på död ved av ${wood}` : `${name} växer på död ved`),
    rootStump: (name, tree) =>
      tree ? `${name} växer vid rot och stubbe av ${tree}` : `${name} växer vid rot och stubbe`,
    growsIn: (name, places) => `${name} växer i ${places}`,
    growsOn: (name, places) => `${name} växer på ${places}`,
    genusAdvice: {
      Cantharellus: 'leta i kanten mot gläntor och längs stigar, sällan inne i tät, mörk skog',
      Craterellus: 'den växer i täta grupper i mossan, så hittar du en står det oftast fler runt omkring',
      Hydnum: 'den står ofta i rader och bågar, så sök vidare längs samma linje när du hittat den första',
      Boletus: 'leta i halvöppna partier under värdträden: beståndskanter, stigkanter och gamla skogsvägar',
      Suillus: 'den står gärna i unga, glesa tallbestånd och längs stigkanter',
      Leccinum: 'den står gärna ensam i halvöppen skog och i kantzoner',
      Macrolepiota: 'den står ensam eller i ring på öppen mark och är hög nog att synas på avstånd',
      Marasmius: 'den bildar bågar och häxringar i kortvuxet gräs',
      Sparassis: 'den kommer igen på samma ställe år efter år, så lägg trädet på minnet',
      Tricholoma: 'den står gärna i grupper och kan vara halvt dold under barr och förna',
      Russula: 'den står spridd och ensam under värdträden, sällan i täta klungor'
    },
    classAdvice: {
      burn: 'leta efter brandfält och annan störd mark',
      deadwood: 'leta på stubbar, liggande stammar och döda grenar, ofta står flera tillsammans på samma ved',
      moss: 'leta i mossan, där hatten nätt och jämnt kan sticka upp',
      wet: 'leta längs myrkanter och i fuktiga partier',
      forest: 'gå långsamt längs stigar, beståndskanter och små gläntor, där du ser marken bäst',
      open: 'gå långsamt över den öppna marken, och titta även i kanterna mot buskage och skog'
    }
  }
};

function copyFor(locale: Locale | undefined): WhatToLookForCopy {
  return COPY[locale ?? DEFAULT_LOCALE] ?? COPY[DEFAULT_LOCALE];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Ikke-tomme, normaliserte verdier fra en array-kolonne som kan være null. */
function cleanList(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values.map(normalize).filter((value) => value.length > 0);
}

function hasAny(values: string[], tags: string[]): boolean {
  return values.some((value) => tags.includes(value));
}

/** «a, b og c» / «a, b och c». */
function joinTerms(terms: string[], copy: WhatToLookForCopy): string {
  if (terms.length <= 1) return terms[0] ?? '';
  return `${terms.slice(0, -1).join(', ')} ${copy.and} ${terms[terms.length - 1]}`;
}

function localize(values: string[], table: Record<string, string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const term = table[value] ?? value;
    if (seen.has(term)) continue;
    seen.add(term);
    out.push(term);
  }
  return out;
}

/**
 * Vokser arten på ved? `substrate` er fritekst i basen ('jord', 'død ved',
 * 'ved rot/stubbe', 'jord/strø'), så vi ser etter ordene.
 */
function woodSubstrate(substrate: string | null | undefined): 'deadwood' | 'rootstump' | null {
  if (!substrate) return null;
  const value = normalize(substrate);
  if (value.includes('rot') || value.includes('stubbe')) return 'rootstump';
  if (value.includes('ved')) return 'deadwood';
  return null;
}

/**
 * Løv eller bar? Utledet av artens egne skogtagger. Null når taggene ikke sier
 * det — da nevner vi ikke treslaget i det hele tatt.
 */
function woodType(habitat: string[], copy: WhatToLookForCopy): string | null {
  const deciduous = hasAny(habitat, DECIDUOUS_FOREST_TAGS);
  const coniferous = hasAny(habitat, CONIFEROUS_FOREST_TAGS);
  if (deciduous && !coniferous) return copy.deciduousWood;
  if (coniferous && !deciduous) return copy.coniferousWood;
  return null;
}

/**
 * Habitattypen søkerådet slås opp på. Rekkefølgen er etter hvor spesifikk
 * taggen er, ikke etter rekkefølgen i basen: 'brannfelt' sier mer enn 'skog'.
 * Åpen mark kommer sist, slik at en art med både skog- og eng-tagger
 * (vorterøyksopp: skog, eng, sti) får skogsrådet.
 */
function pickHabitatClass(habitat: string[], wood: 'deadwood' | 'rootstump' | null): HabitatClass | null {
  if (hasAny(habitat, BURN_TAGS)) return 'burn';
  if (wood) return 'deadwood';
  if (hasAny(habitat, MOSS_TAGS)) return 'moss';
  if (hasAny(habitat, WET_TAGS)) return 'wet';
  if (hasAny(habitat, FOREST_TAGS)) return 'forest';
  if (hasAny(habitat, OPEN_TAGS)) return 'open';
  return null;
}

/**
 * Første halvdel av setningen: forholdet arten har til stedet, utelukkende
 * avledet av radens egne felt. Null når raden ikke sier noe om verken
 * vertstrær, substrat eller sted.
 */
function relationClause(
  name: string,
  habitat: string[],
  partners: string[],
  substrate: string | null | undefined,
  copy: WhatToLookForCopy
): string | null {
  const wood = woodSubstrate(substrate);

  // Vokser den på ved, er den ikke mykorrhiza-partner med treet — substratet
  // vinner over partnerlista (blomkålsopp står ført med furu, men lever på
  // furuas rot, ikke i symbiose med den).
  if (wood === 'rootstump') {
    const tree = localize(partners, copy.partnerTerms)[0] ?? null;
    return copy.rootStump(name, tree);
  }
  if (wood === 'deadwood') {
    return copy.deadWood(name, woodType(habitat, copy));
  }

  if (partners.length > 0) {
    const trees = localize(partners, copy.partnerTerms);
    const named = joinTerms(trees.slice(0, MAX_NAMED_TERMS), copy);
    return trees.length > MAX_NAMED_TERMS ? copy.symbiosisPartial(name, named) : copy.symbiosis(name, named);
  }

  const places = habitat.filter((tag) => PLACE_TAGS.includes(tag));
  if (places.length > 0) {
    const chosen = localize(places, copy.placeTerms).slice(0, MAX_NAMED_TERMS);
    const joined = joinTerms(chosen, copy);
    // «på eng og beitemark», men «i skog» — preposisjonen følger stedet. Har
    // arten både skogs- og engtagger, er skog det bærende stedet.
    const onlyOpen = places.every((tag) => OPEN_TAGS.includes(tag));
    return onlyOpen ? copy.growsOn(name, joined) : copy.growsIn(name, joined);
  }

  return null;
}

/**
 * Én kort «se etter»-setning for arten, på leserens språk — eller null når
 * raden ikke gir grunnlag for noe konkret.
 *
 * Setningen er «<forhold utledet av artsdata> — <søkeråd for slekt/habitattype>.»
 * Mangler søkerådet, står forholdsleddet alene; mangler forholdsleddet, blir
 * det ingen linje.
 */
export function buildWhatToLookFor(
  species: WhatToLookForSpecies,
  locale: Locale = DEFAULT_LOCALE
): string | null {
  const copy = copyFor(locale);
  const name = getSpeciesDisplayName(species, locale);
  if (!name) return null;

  const habitat = cleanList(species.habitat);
  const partners = cleanList(species.mycorrhizal_partners);

  const relation = relationClause(name, habitat, partners, species.substrate, copy);
  if (!relation) return null;

  const genus = species.genus?.trim() ?? '';
  const habitatClass = pickHabitatClass(habitat, woodSubstrate(species.substrate));
  const advice = copy.genusAdvice[genus] ?? (habitatClass ? copy.classAdvice[habitatClass] : null);

  return advice ? `${relation} — ${advice}.` : `${relation}.`;
}
