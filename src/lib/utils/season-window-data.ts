// AUTO-GENERERT av scripts/generate-season-windows.mjs — IKKE REDIGER FOR HÅND.
// Empiriske sesongvinduer fra 325288 daterte GBIF/Artsdatabanken-funn.
// Vinduet er den korteste sammenhengende rekken av måneder som dekker minst
// 90 % av artens funn. Månedsmaske: bit 0 = januar … bit 11 = desember.
// Regenerer:  node --env-file=.env.local scripts/generate-season-windows.mjs

export interface SpeciesSeasonWindow {
  /** Månedsmaske for hele Norden. */
  all: number;
  /** Breddegradsbånd, kun når båndet har minst 150 daterte funn. */
  south?: number;
  central?: number;
  north?: number;
  /** Antall daterte funn bak `all`. */
  n: number;
}

/** Andelen av funnene vinduene dekker. Brukes i UI-teksten. */
export const SEASON_WINDOW_COVERAGE = 0.9;

export const SEASON_WINDOW_META = {
  finds: 325288,
  species: 70,
  withBands: 68,
  minSampleAll: 40,
  minSampleBand: 150
} as const;

export const SEASON_WINDOWS: Record<string, SpeciesSeasonWindow> = {
  // Kantarell (Cantharellus cibarius) — n=8394 — hele Norden: jun jul aug sep okt — sør (<61°N): jun jul aug sep okt — sentralt (61–64°N): jul aug sep okt — nord (>64°N): jun jul aug sep
  '1': { all: 992, south: 992, central: 960, north: 480, n: 8394 },
  // Steinsopp (Boletus edulis) — n=8387 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): jul aug sep — nord (>64°N): jul aug sep
  '2': { all: 896, south: 896, central: 448, north: 448, n: 8387 },
  // Traktkantarell (Craterellus tubaeformis) — n=8383 — hele Norden: aug sep okt nov — sør (<61°N): aug sep okt nov — sentralt (61–64°N): aug sep okt — nord (>64°N): aug sep okt nov
  '3': { all: 1920, south: 1920, central: 896, north: 1920, n: 8383 },
  // Svart trompetsopp (Craterellus cornucopioides) — n=3997 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): jul aug sep
  '4': { all: 896, south: 896, central: 448, n: 3997 },
  // Rødskrubb (Leccinum aurantiacum) — n=2879 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): jul aug sep
  '5': { all: 896, south: 896, central: 448, n: 2879 },
  // Brunskrubb (Leccinum scabrum) — n=8351 — hele Norden: jun jul aug sep — sør (<61°N): jul aug sep okt — sentralt (61–64°N): jul aug sep — nord (>64°N): jul aug sep
  '6': { all: 480, south: 960, central: 448, north: 448, n: 8351 },
  // Piggsopp (Hydnum repandum) — n=4305 — hele Norden: jul aug sep okt — sør (<61°N): jul aug sep okt — sentralt (61–64°N): jul aug sep okt — nord (>64°N): aug sep okt
  '7': { all: 960, south: 960, central: 960, north: 896, n: 4305 },
  // Smørsopp (Suillus luteus) — n=7049 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): jul aug sep — nord (>64°N): aug sep
  '8': { all: 896, south: 896, central: 448, north: 384, n: 7049 },
  // Seig kusopp (Suillus bovinus) — n=6779 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): aug sep — nord (>64°N): aug sep
  '9': { all: 896, south: 896, central: 384, north: 384, n: 6779 },
  // Sjampinjong (Agaricus campestris) — n=2220 — hele Norden: jul aug sep okt — sør (<61°N): jul aug sep okt — sentralt (61–64°N): jul aug sep
  '10': { all: 960, south: 960, central: 448, n: 2220 },
  // Honningsopp (Armillaria mellea) — n=3211 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): aug sep — nord (>64°N): aug sep
  '11': { all: 896, south: 896, central: 384, north: 384, n: 3211 },
  // Skjeggriske (Lactarius torminosus) — n=7601 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): aug sep — nord (>64°N): aug sep
  '12': { all: 896, south: 896, central: 384, north: 384, n: 7601 },
  // Storkremle (Russula paludosa) — n=6372 — hele Norden: jul aug sep — sør (<61°N): jul aug sep — sentralt (61–64°N): jul aug sep — nord (>64°N): jul aug sep
  '13': { all: 448, south: 448, central: 448, north: 448, n: 6372 },
  // Østerssopp (Pleurotus ostreatus) — n=5070 — hele Norden: jan feb mar jun jul aug sep okt nov des — sør (<61°N): jan feb mar jun jul aug sep okt nov des — sentralt (61–64°N): jun jul aug sep okt nov
  '14': { all: 4071, south: 4071, central: 2016, n: 5070 },
  // Rød fluesopp (Amanita muscaria) — n=8395 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): aug sep okt — nord (>64°N): jul aug sep
  '15': { all: 896, south: 896, central: 896, north: 448, n: 8395 },
  // Hvit fluesopp (Amanita virosa) — n=5557 — hele Norden: aug sep — sør (<61°N): aug sep — sentralt (61–64°N): aug sep
  '16': { all: 384, south: 384, central: 384, n: 5557 },
  // Spiss giftslørsopp (Cortinarius rubellus) — n=4768 — hele Norden: jul aug sep — sør (<61°N): jul aug sep — sentralt (61–64°N): aug sep
  '17': { all: 448, south: 448, central: 384, n: 4768 },
  // Pluggsopp (Paxillus involutus) — n=4444 — hele Norden: jul aug sep okt — sør (<61°N): jul aug sep okt — sentralt (61–64°N): jul aug sep — nord (>64°N): jul aug sep
  '18': { all: 960, south: 960, central: 448, north: 448, n: 4444 },
  // Vanlig morkel (Morchella esculenta) — n=1744 — hele Norden: apr mai jun — sør (<61°N): apr mai jun — sentralt (61–64°N): mai jun — nord (>64°N): mai jun jul
  '19': { all: 56, south: 56, central: 48, north: 112, n: 1744 },
  // Spiss morkel (Morchella elata) — n=141 — hele Norden: mai jun
  '20': { all: 48, n: 141 },
  // Stankmorkel (Verpa bohemica) — n=147 — hele Norden: apr mai jun
  '21': { all: 56, n: 147 },
  // Falsk kantarell (Hygrophoropsis aurantiaca) — n=6301 — hele Norden: jul aug sep okt — sør (<61°N): aug sep okt nov — sentralt (61–64°N): aug sep okt — nord (>64°N): aug sep okt
  '22': { all: 960, south: 1920, central: 896, north: 896, n: 6301 },
  // Karbol-sjampinjong (Agaricus xanthodermus) — n=529 — hele Norden: jul aug sep okt — sør (<61°N): jul aug sep okt
  '23': { all: 960, south: 960, n: 529 },
  // Svovelsopp (Hypholoma fasciculare) — n=6197 — hele Norden: jul aug sep okt nov — sør (<61°N): jul aug sep okt nov — sentralt (61–64°N): mai jun jul aug sep okt
  '24': { all: 1984, south: 1984, central: 1008, n: 6197 },
  // Galleboletus (Tylopilus felleus) — n=5240 — hele Norden: jul aug sep — sør (<61°N): jul aug sep — sentralt (61–64°N): jul aug sep
  '25': { all: 448, south: 448, central: 448, n: 5240 },
  // Fåresopp (Albatrellus ovinus) — n=5828 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): jul aug sep — nord (>64°N): aug sep okt
  '26': { all: 896, south: 896, central: 448, north: 896, n: 5828 },
  // Granmatriske (Lactarius deterrimus) — n=7553 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): jul aug sep — nord (>64°N): aug sep
  '32': { all: 896, south: 896, central: 448, north: 384, n: 7553 },
  // Furumatriske (Lactarius deliciosus) — n=4472 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): aug sep okt
  '33': { all: 896, south: 896, central: 896, n: 4472 },
  // Rødbrun steinsopp (Boletus pinophilus) — n=3057 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): jul aug sep — nord (>64°N): jul aug sep
  '34': { all: 896, south: 896, central: 448, north: 448, n: 3057 },
  // Sandsopp (Suillus variegatus) — n=7001 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): aug sep — nord (>64°N): jul aug sep
  '35': { all: 896, south: 896, central: 384, north: 448, n: 7001 },
  // Rødgul piggsopp (Hydnum rufescens) — n=3746 — hele Norden: jul aug sep okt — sør (<61°N): jul aug sep okt — sentralt (61–64°N): aug sep okt — nord (>64°N): aug sep okt
  '36': { all: 960, south: 960, central: 896, north: 896, n: 3746 },
  // Bleklodden steinsopp (Boletus reticulatus) — n=2821 — hele Norden: jun jul aug sep — sør (<61°N): jun jul aug sep
  '37': { all: 480, south: 480, n: 2821 },
  // Broket kremle (Russula cyanoxantha) — n=5180 — hele Norden: jul aug sep okt — sør (<61°N): jul aug sep okt
  '38': { all: 960, south: 960, n: 5180 },
  // Nøttekremle (Russula vesca) — n=6372 — hele Norden: jul aug sep — sør (<61°N): jul aug sep — sentralt (61–64°N): jul aug sep
  '39': { all: 448, south: 448, central: 448, n: 6372 },
  // Parasollsopp (Macrolepiota procera) — n=4288 — hele Norden: aug sep okt — sør (<61°N): aug sep okt
  '40': { all: 896, south: 896, n: 4288 },
  // Skogsjampinjong (Agaricus sylvaticus) — n=2387 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): aug sep okt
  '41': { all: 896, south: 896, central: 896, n: 2387 },
  // Grønn fluesopp (Amanita phalloides) — n=2618 — hele Norden: aug sep okt — sør (<61°N): aug sep okt
  '52': { all: 896, south: 896, n: 2618 },
  // Panterfluesopp (Amanita pantherina) — n=4127 — hele Norden: jul aug sep okt — sør (<61°N): jul aug sep okt
  '53': { all: 960, south: 960, n: 4127 },
  // Brun fluesopp (Amanita regalis) — n=2026 — hele Norden: jul aug sep — sør (<61°N): jul aug sep — sentralt (61–64°N): jul aug sep — nord (>64°N): jul aug sep
  '54': { all: 448, south: 448, central: 448, north: 448, n: 2026 },
  // Rødnende fluesopp (Amanita rubescens) — n=8299 — hele Norden: jul aug sep okt — sør (<61°N): jul aug sep okt — sentralt (61–64°N): jul aug sep — nord (>64°N): jul aug sep
  '55': { all: 960, south: 960, central: 448, north: 448, n: 8299 },
  // Flatklokkehatt (Galerina marginata) — n=5969 — hele Norden: aug sep okt nov — sør (<61°N): sep okt nov — sentralt (61–64°N): jul aug sep okt — nord (>64°N): jul aug sep
  '56': { all: 1920, south: 1792, central: 960, north: 448, n: 5969 },
  // Steinmorkel (Gyromitra esculenta) — n=3809 — hele Norden: apr mai jun — sør (<61°N): mar apr mai — sentralt (61–64°N): apr mai jun — nord (>64°N): mai jun
  '57': { all: 56, south: 28, central: 56, north: 48, n: 3809 },
  // Butt giftslørsopp (Cortinarius orellanus) — n=330 — hele Norden: aug sep okt — sør (<61°N): aug sep okt
  '58': { all: 896, south: 896, n: 330 },
  // Giftkremle (Russula emetica) — n=6797 — hele Norden: jul aug sep okt — sør (<61°N): jul aug sep okt — sentralt (61–64°N): jul aug sep — nord (>64°N): jul aug
  '61': { all: 960, south: 960, central: 448, north: 192, n: 6797 },
  // Giftrødskivesopp (Entoloma sinuatum) — n=1344 — hele Norden: aug sep okt — sør (<61°N): aug sep okt
  '62': { all: 896, south: 896, n: 1344 },
  // Potetrøyksopp (Scleroderma citrinum) — n=3325 — hele Norden: jul aug sep okt nov — sør (<61°N): jul aug sep okt nov
  '63': { all: 1984, south: 1984, n: 3325 },
  // Tegltoppsopp (Hypholoma lateritium) — n=3916 — hele Norden: aug sep okt nov — sør (<61°N): aug sep okt nov — sentralt (61–64°N): aug sep okt nov
  '64': { all: 1920, south: 1920, central: 1920, n: 3916 },
  // Brunstokket rørsopp (Imleria badia) — n=6197 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): aug sep okt
  '65': { all: 896, south: 896, central: 896, n: 6197 },
  // Lerkesopp (Suillus grevillei) — n=2657 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): jul aug sep — nord (>64°N): aug sep
  '66': { all: 896, south: 896, central: 448, north: 384, n: 2657 },
  // Sildekremle (Russula xerampelina) — n=2928 — hele Norden: jul aug sep okt — sør (<61°N): jul aug sep okt — sentralt (61–64°N): aug sep — nord (>64°N): aug sep
  '67': { all: 960, south: 960, central: 384, north: 384, n: 2928 },
  // Grønnkremle (Russula aeruginea) — n=4678 — hele Norden: jun jul aug sep — sør (<61°N): jul aug sep okt — sentralt (61–64°N): jul aug sep — nord (>64°N): jul aug sep
  '68': { all: 480, south: 960, central: 448, north: 448, n: 4678 },
  // Gulkremle (Russula claroflava) — n=6598 — hele Norden: jul aug sep — sør (<61°N): jul aug sep — sentralt (61–64°N): jul aug sep — nord (>64°N): aug sep
  '69': { all: 448, south: 448, central: 448, north: 384, n: 6598 },
  // Gulnende kremle (Russula decolorans) — n=7996 — hele Norden: jul aug sep — sør (<61°N): jul aug sep — sentralt (61–64°N): aug sep — nord (>64°N): jul aug
  '70': { all: 448, south: 448, central: 384, north: 192, n: 7996 },
  // Gul trompetsopp (Craterellus lutescens) — n=5777 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): aug sep okt — nord (>64°N): aug sep okt
  '71': { all: 896, south: 896, central: 896, north: 896, n: 5777 },
  // Gråmusserong (Tricholoma portentosum) — n=2435 — hele Norden: sep okt nov — sør (<61°N): sep okt nov — sentralt (61–64°N): aug sep okt — nord (>64°N): aug sep okt
  '72': { all: 1792, south: 1792, central: 896, north: 896, n: 2435 },
  // Frostvarsler (Hygrophorus hypothejus) — n=3540 — hele Norden: sep okt nov — sør (<61°N): sep okt nov — sentralt (61–64°N): sep okt nov — nord (>64°N): aug sep okt
  '73': { all: 1792, south: 1792, central: 1792, north: 896, n: 3540 },
  // Ametystsopp (Laccaria amethystina) — n=6737 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): aug sep okt
  '74': { all: 896, south: 896, central: 896, n: 6737 },
  // Blomkålsopp (Sparassis crispa) — n=4787 — hele Norden: aug sep okt nov — sør (<61°N): aug sep okt nov
  '75': { all: 1920, south: 1920, n: 4787 },
  // Judasøre (Auricularia auricula-judae) — n=2145 — hele Norden: jan feb mar apr mai aug sep okt nov des — sør (<61°N): jan feb mar apr mai aug sep okt nov des
  '76': { all: 3999, south: 3999, n: 2145 },
  // Vintersopp (Flammulina velutipes) — n=6217 — hele Norden: jan feb mar sep okt nov des — sør (<61°N): jan feb mar sep okt nov des — sentralt (61–64°N): jan feb mar sep okt nov des — nord (>64°N): jan feb aug sep okt nov des
  '77': { all: 3847, south: 3847, central: 3847, north: 3971, n: 6217 },
  // Snøballsjampinjong (Agaricus arvensis) — n=2810 — hele Norden: jun jul aug sep okt — sør (<61°N): jun jul aug sep okt — sentralt (61–64°N): jul aug sep okt
  '78': { all: 992, south: 992, central: 960, n: 2810 },
  // Blåtutt (Lepista nuda) — n=4880 — hele Norden: sep okt nov — sør (<61°N): sep okt nov — sentralt (61–64°N): sep okt — nord (>64°N): aug sep okt
  '79': { all: 1792, south: 1792, central: 768, north: 896, n: 4880 },
  // Vårfagerhatt (Calocybe gambosa) — n=2275 — hele Norden: mai jun — sør (<61°N): mai jun
  '80': { all: 48, south: 48, n: 2275 },
  // Vorterøyksopp (Lycoperdon perlatum) — n=6471 — hele Norden: aug sep okt nov — sør (<61°N): aug sep okt nov — sentralt (61–64°N): aug sep okt — nord (>64°N): jul aug sep
  '81': { all: 1920, south: 1920, central: 896, north: 448, n: 6471 },
  // Nellikhatt (Marasmius oreades) — n=4448 — hele Norden: jun jul aug sep okt — sør (<61°N): jun jul aug sep okt — sentralt (61–64°N): jun jul aug sep
  '82': { all: 992, south: 992, central: 480, n: 4448 },
  // Grovriske (Lactarius trivialis) — n=7357 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): aug sep — nord (>64°N): jul aug sep
  '83': { all: 896, south: 896, central: 384, north: 448, n: 7357 },
  // Sammenvokst fåresopp (Albatrellopsis confluens) — n=1197 — hele Norden: jul aug sep — sør (<61°N): jul aug sep — sentralt (61–64°N): aug sep
  '84': { all: 448, south: 448, central: 384, n: 1197 },
  // Sherryhatt (Hygrophorus camarophyllus) — n=3605 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): aug sep — nord (>64°N): aug sep
  '85': { all: 896, south: 896, central: 384, north: 384, n: 3605 },
  // Blek kantarell (Cantharellus pallens) — n=1466 — hele Norden: jul aug sep — sør (<61°N): jul aug sep
  '86': { all: 448, south: 448, n: 1466 },
  // Svovelriske (Lactarius scrobiculatus) — n=6315 — hele Norden: aug sep okt — sør (<61°N): aug sep okt — sentralt (61–64°N): aug sep okt — nord (>64°N): aug sep
  '87': { all: 896, south: 896, central: 896, north: 384, n: 6315 },
};
