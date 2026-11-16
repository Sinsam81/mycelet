import type { Edibility } from '@/types/species';

/**
 * Artskatalogen slik den sto i `mushroom_species` 10. november 2026 — alle 80
 * radene, med navnene, sesongmånedene, spiseligheten og habitatene søket og
 * kalenderen leser. Lest fra basen (kun lesing); beskrivelser og bilder er ikke
 * med.
 *
 * Testene for artssøket og kalenderen er skrevet mot disse radene og ikke mot
 * oppdiktede eksempler: feilene de skal fange — «karljohan» som ikke fant
 * steinsopp, sandmorkel i samme liste som morklene — fantes bare i de ekte
 * navnene og de ekte sesongvinduene. Id-ene matcher de empiriske vinduene i
 * src/lib/utils/season-window-data.ts.
 *
 * Dette er et øyeblikksbilde for tester, ikke en kilde: appen leser alltid
 * basen. Kommer det nye arter, trenger ikke fila oppdateres før en test
 * handler om dem.
 */
export interface KatalogArt {
  id: number;
  norwegian_name: string;
  swedish_name: string | null;
  latin_name: string;
  english_name: string | null;
  /** Tom streng når arten ikke har eldre vitenskapelige navn (generert kolonne, migrasjon 034). */
  synonyms_text: string;
  description: string | null;
  habitat: string[];
  season_start: number;
  season_end: number;
  peak_season_start: number | null;
  peak_season_end: number | null;
  edibility: Edibility;
  primary_image_url: string | null;
}

type Rad = [
  id: number,
  norsk: string,
  svensk: string | null,
  latin: string,
  engelsk: string | null,
  synonymer: string,
  sesongStart: number,
  sesongSlutt: number,
  toppStart: number | null,
  toppSlutt: number | null,
  spiselighet: Edibility,
  habitat: string[]
];

const RADER: Rad[] = [
  [1, 'Kantarell', 'Kantarell', 'Cantharellus cibarius', 'Chanterelle', '', 7, 9, 8, 9, 'edible', ['barskog', 'blandingsskog', 'mose']],
  [2, 'Steinsopp', 'Karljohan', 'Boletus edulis', 'Penny bun', '', 7, 10, 8, 9, 'edible', ['barskog', 'lauvskog', 'eldre bestand', 'kantsoner']],
  [3, 'Traktkantarell', 'Trattkantarell', 'Craterellus tubaeformis', 'Trumpet chanterelle', '', 8, 11, 9, 10, 'edible', ['granskog', 'moserik', 'fuktig']],
  [4, 'Svart trompetsopp', 'Svart trumpetsvamp', 'Craterellus cornucopioides', 'Black trumpet', '', 9, 10, 9, 10, 'edible', ['lauvskog', 'fuktig', 'mose']],
  [5, 'Rødskrubb', 'Aspsopp', 'Leccinum aurantiacum', 'Orange birch bolete', '', 7, 10, 8, 9, 'conditionally_edible', ['løvskog', 'blandingsskog']],
  [6, 'Brunskrubb', 'Björksopp', 'Leccinum scabrum', 'Birch bolete', '', 6, 10, 8, 9, 'edible', ['løvskog', 'blandingsskog']],
  [7, 'Piggsopp', 'Blek taggsvamp', 'Hydnum repandum', 'Hedgehog mushroom', '', 9, 11, 10, 11, 'edible', ['granskog', 'blandingsskog', 'kalkrik']],
  [8, 'Smørsopp', 'Smörsopp', 'Suillus luteus', 'Slippery jack', '', 7, 10, 8, 9, 'edible', ['barskog']],
  [9, 'Seig kusopp', 'Örsopp', 'Suillus bovinus', 'Jersey cow mushroom', '', 7, 10, 8, 9, 'edible', ['barskog', 'sandig mark']],
  [10, 'Sjampinjong', 'Ängschampinjon', 'Agaricus campestris', 'Field mushroom', '', 6, 10, 8, 9, 'edible', ['eng', 'beite', 'gressplen']],
  [11, 'Honningsopp', 'Honungsskivling', 'Armillaria mellea', 'Honey fungus', '', 8, 11, 9, 10, 'inedible', ['løvskog', 'blandingsskog']],
  [12, 'Skjeggriske', 'Skäggriska', 'Lactarius torminosus', 'Woolly milkcap', '', 7, 10, 8, 9, 'conditionally_edible', ['løvskog', 'blandingsskog']],
  [13, 'Storkremle', 'Storkremla', 'Russula paludosa', 'Hintapick', '', 7, 10, 8, 9, 'edible', ['barskog', 'myr-kant']],
  [14, 'Østerssopp', 'Ostronmussling', 'Pleurotus ostreatus', 'Oyster mushroom', '', 10, 3, 11, 2, 'edible', ['løvskog']],
  [15, 'Rød fluesopp', 'Röd flugsvamp', 'Amanita muscaria', 'Fly agaric', '', 7, 10, 8, 9, 'toxic', ['barskog', 'blandingsskog', 'løvskog']],
  [16, 'Hvit fluesopp', 'Vit flugsvamp', 'Amanita virosa', 'Destroying angel', '', 7, 10, 8, 9, 'deadly', ['barskog', 'blandingsskog']],
  [17, 'Spiss giftslørsopp', 'Toppig giftspindling', 'Cortinarius rubellus', 'Deadly webcap', '', 8, 10, 9, 10, 'deadly', ['barskog']],
  [18, 'Pluggsopp', 'Pluggskivling', 'Paxillus involutus', 'Brown roll-rim', '', 7, 10, 8, 9, 'toxic', ['løvskog', 'blandingsskog']],
  [19, 'Vanlig morkel', 'Rundmurkla', 'Morchella esculenta', 'Common morel', '', 4, 6, 4, 5, 'conditionally_edible', ['løvskog', 'blandingsskog', 'elvebredder']],
  [20, 'Spiss morkel', 'Toppmurkla', 'Morchella elata', 'Black morel', '', 4, 6, 5, 5, 'conditionally_edible', ['barskog', 'brannfelt']],
  [21, 'Stankmorkel', 'Vindlad klockmurkla', 'Verpa bohemica', 'Wrinkled thimble-cap', '', 4, 5, 4, 5, 'inedible', ['løvskog', 'elvebredder']],
  [22, 'Falsk kantarell', 'Narrkantarell', 'Hygrophoropsis aurantiaca', 'False chanterelle', '', 7, 11, 8, 10, 'inedible', ['barskog', 'blandingsskog']],
  [23, 'Karbol-sjampinjong', 'Giftchampinjon', 'Agaricus xanthodermus', 'Yellow stainer', 'Agaricus xanthoderma Psalliota xanthoderma', 6, 10, 8, 9, 'toxic', ['eng', 'beite', 'gressplen', 'park']],
  [24, 'Svovelsopp', 'Svavelgul slöjskivling', 'Hypholoma fasciculare', 'Sulphur tuft', '', 6, 11, 9, 10, 'toxic', ['løvskog', 'blandingsskog']],
  [25, 'Gallerørsopp', 'Gallsopp', 'Tylopilus felleus', 'Bitter bolete', '', 7, 10, 8, 9, 'inedible', ['barskog', 'blandingsskog']],
  [26, 'Fåresopp', 'Fårticka', 'Albatrellus ovinus', 'Sheep polypore', '', 8, 10, 9, 10, 'edible', ['barskog']],
  [32, 'Granmatriske', 'Granblodriska', 'Lactarius deterrimus', 'False saffron milkcap', '', 8, 10, 9, 10, 'edible', ['granskog', 'mose']],
  [33, 'Furumatriske', 'Tallblodriska', 'Lactarius deliciosus', 'Saffron milkcap', '', 8, 10, 9, 10, 'edible', ['furuskog']],
  [34, 'Rødbrun steinsopp', 'Rödbrun stensopp', 'Boletus pinophilus', 'Pine bolete', '', 8, 10, 8, 9, 'edible', ['furuskog', 'barskog']],
  [35, 'Sandsopp', 'Sandsopp', 'Suillus variegatus', 'Velvet bolete', '', 8, 10, 9, 10, 'edible', ['furuskog']],
  [36, 'Rødgul piggsopp', 'Rödgul taggsvamp', 'Hydnum rufescens', 'Terracotta hedgehog', '', 9, 11, 9, 10, 'edible', ['barskog', 'blandingsskog']],
  [37, 'Bleklodden steinsopp', 'Finluden stensopp', 'Boletus reticulatus', 'Summer bolete', '', 6, 9, 7, 8, 'edible', ['løvskog', 'eikeskog']],
  [38, 'Broket kremle', 'Brokkremla', 'Russula cyanoxantha', 'Charcoal burner', '', 7, 10, 8, 9, 'edible', ['løvskog', 'blandingsskog']],
  [39, 'Nøttekremle', 'Kantkremla', 'Russula vesca', 'The flirt', '', 7, 10, 8, 9, 'edible', ['løvskog', 'blandingsskog']],
  [40, 'Parasollsopp', 'Stolt fjällskivling', 'Macrolepiota procera', 'Parasol mushroom', '', 8, 10, 9, 9, 'edible', ['eng', 'beite', 'kantsoner', 'lysninger']],
  [41, 'Skogsjampinjong', 'Skogschampinjon', 'Agaricus sylvaticus', 'Scaly wood mushroom', 'Agaricus silvaticus', 8, 10, 8, 9, 'edible', ['barskog', 'granskog']],
  [52, 'Grønn fluesopp', 'Lömsk flugsvamp', 'Amanita phalloides', 'Death cap', '', 8, 10, 8, 9, 'deadly', ['løvskog', 'eikeskog']],
  [53, 'Panterfluesopp', 'Panterflugsvamp', 'Amanita pantherina', 'Panther cap', '', 8, 10, 8, 9, 'toxic', ['løvskog', 'blandingsskog']],
  [54, 'Brun fluesopp', 'Brun flugsvamp', 'Amanita regalis', 'Royal fly agaric', '', 8, 10, 8, 9, 'toxic', ['barskog', 'fjellbjørkeskog']],
  [55, 'Rødnende fluesopp', 'Rodnande flugsvamp', 'Amanita rubescens', 'Blusher', '', 7, 10, 8, 9, 'conditionally_edible', ['barskog', 'løvskog', 'blandingsskog']],
  [56, 'Flatklokkehatt', 'Gifthätting', 'Galerina marginata', 'Funeral bell', '', 8, 11, 9, 10, 'deadly', ['barskog']],
  [57, 'Sandmorkel', 'Stenmurkla', 'Gyromitra esculenta', 'False morel', '', 4, 6, 5, 5, 'deadly', ['furuskog', 'sandgrunn']],
  [58, 'Butt giftslørsopp', 'Orangebrun giftspindling', 'Cortinarius orellanus', 'Fool\'s webcap', '', 8, 10, 8, 9, 'deadly', ['løvskog']],
  [59, 'Hvit traktsopp', 'Gifttrattskivling', 'Clitocybe rivulosa', 'Ivory funnel', 'Clitocybe dealbata Clitocybe rivulosa var. dealbata', 8, 10, 9, 10, 'toxic', ['eng', 'beite', 'plen', 'gress']],
  [60, 'Rødnende trådsopp', 'Gifttråding', 'Inosperma erubescens', 'Deadly fibrecap', 'Inocybe erubescens Inocybe patouillardii', 5, 8, 6, 7, 'toxic', ['løvskog']],
  [61, 'Giftkremle', 'Giftkremla', 'Russula emetica', 'The sickener', '', 7, 10, 8, 9, 'toxic', ['barskog', 'myr', 'fuktig skog']],
  [62, 'Giftrødskivesopp', 'Bolmörtsskivling', 'Entoloma sinuatum', 'Livid entoloma', '', 8, 10, 8, 9, 'toxic', ['løvskog']],
  [63, 'Potetrøyksopp', 'Gul rottryffel', 'Scleroderma citrinum', 'Common earthball', '', 7, 11, 8, 10, 'toxic', ['skog', 'sur jord']],
  [64, 'Tegltoppsopp', 'Tegelröd slöjskivling', 'Hypholoma lateritium', 'Brick cap', '', 8, 11, 9, 10, 'inedible', ['løvskog']],
  [65, 'Svartbrun rørsopp', 'Brunsopp', 'Imleria badia', 'Bay bolete', '', 8, 11, 9, 10, 'edible', ['barskog', 'blandingsskog']],
  [66, 'Lerkesopp', 'Lärksopp', 'Suillus grevillei', 'Larch bolete', '', 8, 10, 9, 10, 'edible', ['lerkeskog', 'blandingsskog']],
  [67, 'Sildekremle', 'Tallsillkremla', 'Russula xerampelina', 'Crab brittlegill', '', 8, 10, 8, 9, 'edible', ['barskog', 'blandingsskog']],
  [68, 'Grønnkremle', 'Grönkremla', 'Russula aeruginea', 'Green brittlegill', '', 7, 10, 8, 9, 'edible', ['løvskog', 'blandingsskog']],
  [69, 'Gulkremle', 'Gulkremla', 'Russula claroflava', 'Yellow swamp brittlegill', '', 8, 10, 8, 9, 'edible', ['løvskog', 'myr', 'fuktig skog']],
  [70, 'Gulrød kremle', 'Tegelkremla', 'Russula decolorans', 'Copper brittlegill', '', 8, 10, 8, 9, 'edible', ['barskog', 'furuskog']],
  [71, 'Gul trompetsopp', 'Rödgul trumpetsvamp', 'Craterellus lutescens', 'Yellow foot', '', 8, 11, 9, 10, 'edible', ['barskog', 'mose', 'fuktig skog']],
  [72, 'Gråmusserong', 'Streckmusseron', 'Tricholoma portentosum', 'Sooty head', '', 9, 11, 10, 11, 'edible', ['furuskog', 'barskog']],
  [73, 'Frostvokssopp', 'Frostvaxskivling', 'Hygrophorus hypothejus', 'Herald of winter', '', 9, 11, 10, 11, 'edible', ['furuskog', 'barskog']],
  [74, 'Ametystsopp', 'Ametistskivling', 'Laccaria amethystina', 'Amethyst deceiver', '', 8, 11, 9, 10, 'inedible', ['løvskog', 'barskog', 'blandingsskog']],
  [75, 'Blomkålsopp', 'Blomkålssvamp', 'Sparassis crispa', 'Cauliflower fungus', '', 8, 10, 9, 10, 'edible', ['furuskog']],
  [76, 'Judasøre', 'Judasöra', 'Auricularia auricula-judae', 'Wood ear', '', 1, 12, 9, 11, 'edible', ['løvskog']],
  [77, 'Vintersopp', 'Vinterskivling', 'Flammulina velutipes', 'Velvet shank', '', 10, 12, 11, 12, 'edible', ['løvskog']],
  [78, 'Snøballsjampinjong', 'Snöbollschampinjon', 'Agaricus arvensis', 'Horse mushroom', '', 7, 10, 8, 9, 'edible', ['eng', 'beite', 'gress']],
  [79, 'Blå ridderhatt', 'Blåmusseron', 'Lepista nuda', 'Wood blewit', '', 9, 12, 10, 11, 'edible', ['løvskog', 'barskog', 'hage']],
  [80, 'Vårfagerhatt', 'Vårmusseron', 'Calocybe gambosa', 'St. George\'s mushroom', '', 5, 6, 5, 6, 'edible', ['eng', 'kantsoner', 'beite']],
  [81, 'Vorterøyksopp', 'Vårtig röksvamp', 'Lycoperdon perlatum', 'Common puffball', '', 7, 11, 8, 10, 'edible', ['skog', 'eng', 'sti']],
  [82, 'Nellikhatt', 'Nejlikbrosking', 'Marasmius oreades', 'Fairy ring champignon', '', 6, 10, 8, 9, 'edible', ['eng', 'plen', 'beite', 'gress']],
  [83, 'Hulriske', 'Skogsriska', 'Lactarius trivialis', 'Slimy milkcap', '', 8, 10, 9, 10, 'conditionally_edible', ['barskog', 'løvskog', 'fuktig skog']],
  [84, 'Franskbrødsopp', 'Brödticka', 'Albatrellopsis confluens', 'Merging polypore', 'Albatrellus confluens Polyporus confluens', 8, 10, 9, 10, 'edible', ['barskog', 'granskog']],
  [85, 'Sotvokssopp', 'Sotvaxskivling', 'Hygrophorus camarophyllus', 'Sooty waxcap', '', 9, 11, 9, 10, 'edible', ['barskog', 'granskog']],
  [86, 'Blek kantarell', 'Blek kantarell', 'Cantharellus pallens', 'Pale chanterelle', '', 7, 10, 8, 9, 'edible', ['barskog', 'løvskog', 'blandingsskog']],
  [87, 'Svovelriske', 'Svavelriska', 'Lactarius scrobiculatus', 'Spotted milkcap', '', 8, 10, 9, 10, 'inedible', ['granskog', 'barskog']],
  [90, 'Pantermusserong', 'Pantermusseron', 'Tricholoma filamentosum', null, '', 8, 11, null, null, 'toxic', ['løvskog', 'edelløvskog']],
  [91, 'Gallemusserong', 'Gallmusseron', 'Tricholoma virgatum', 'Ashen Knight', '', 8, 10, null, null, 'inedible', ['barskog', 'blandingsskog', 'løvskog']],
  [92, 'Såpemusserong', 'Såpmusseron', 'Tricholoma saponaceum', 'Soapy knight', '', 7, 10, null, null, 'inedible', ['barskog', 'løvskog', 'blandingsskog']],
  [93, 'Brungul musserong', 'Kantmusseron s. str.', 'Tricholoma arvernense', null, '', 8, 10, null, null, 'inedible', ['furuskog', 'barskog', 'granskog']],
  [94, 'Lakrisriske', 'Lakritsriska', 'Lactarius helvus', 'Fenugreek milkcap', '', 7, 10, null, null, 'toxic', ['barskog', 'granskog', 'fuktig skog', 'myr', 'mose']],
  [95, 'Klubbetraktsopp', 'Klubbtrattskivling', 'Ampulloclitocybe clavipes', 'Club foot', '', 8, 11, null, null, 'inedible', ['barskog', 'granskog', 'furuskog', 'løvskog', 'mose']],
  [96, 'Brunkjøttbukkesopp', 'Bockspindling', 'Cortinarius traganus', 'Gassy Webcap', '', 8, 10, null, null, 'inedible', ['barskog', 'granskog', 'furuskog', 'blandingsskog', 'mose', 'gammelskog']],
  [97, 'Krittøsterssopp', 'Öronmussling', 'Pleurocybella porrigens', 'Angel\'s Wings', '', 8, 11, null, null, 'inedible', ['barskog', 'granskog', 'furuskog', 'gammelskog', 'hogstflate', 'plantet skog']]
];

export const ARTSKATALOG: readonly KatalogArt[] = RADER.map(
  ([id, norsk, svensk, latin, engelsk, synonymer, sesongStart, sesongSlutt, toppStart, toppSlutt, spiselighet, habitat]) => ({
    id,
    norwegian_name: norsk,
    swedish_name: svensk,
    latin_name: latin,
    english_name: engelsk,
    synonyms_text: synonymer,
    description: null,
    habitat,
    season_start: sesongStart,
    season_end: sesongSlutt,
    peak_season_start: toppStart,
    peak_season_end: toppSlutt,
    edibility: spiselighet,
    primary_image_url: null
  })
);

/** Slår opp én art på norsk navn. Kaster når navnet ikke finnes, så en skrivefeil i en test ikke blir til `undefined`. */
export function art(norskNavn: string): KatalogArt {
  const funnet = ARTSKATALOG.find((rad) => rad.norwegian_name === norskNavn);
  if (!funnet) throw new Error(`Ingen art i fixturen heter «${norskNavn}»`);
  return funnet;
}
