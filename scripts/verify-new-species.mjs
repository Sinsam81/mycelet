// One-off verification helper for the species expansion (run while building
// migrations 017+). For each candidate it:
//   1. confirms the Latin name resolves on GBIF (catches typos / bad names),
//   2. fetches the species' lead image from Wikipedia (no → en) — far more
//      reliable than guessing a Commons filename.
// Output is a review table; nothing is written to the DB.
//
// Run: node scripts/verify-new-species.mjs

const CANDIDATES = [
  // --- TOXIC / DEADLY (safety priority) ---
  ['Grønn fluesopp', 'Amanita phalloides', 'deadly'],
  ['Panterfluesopp', 'Amanita pantherina', 'toxic'],
  ['Brun fluesopp', 'Amanita regalis', 'toxic'],
  ['Rødnende fluesopp', 'Amanita rubescens', 'conditionally_edible'],
  ['Flatklokkehatt', 'Galerina marginata', 'deadly'],
  ['Steinmorkel', 'Gyromitra esculenta', 'deadly'],
  ['Butt giftslørsopp', 'Cortinarius orellanus', 'deadly'],
  ['Hvit trakttsopp', 'Clitocybe dealbata', 'toxic'],
  ['Rødnende trådsopp', 'Inocybe erubescens', 'toxic'],
  ['Giftkremle', 'Russula emetica', 'toxic'],
  ['Giftrødskivesopp', 'Entoloma sinuatum', 'toxic'],
  ['Potetrøyksopp', 'Scleroderma citrinum', 'toxic'],
  ['Tegltoppsopp', 'Hypholoma lateritium', 'inedible'],

  // --- EDIBLE / CHOICE ---
  ['Brunstokket rørsopp', 'Imleria badia', 'edible'],
  ['Lerkesopp', 'Suillus grevillei', 'edible'],
  ['Sildekremle', 'Russula xerampelina', 'edible'],
  ['Grønnkremle', 'Russula aeruginea', 'edible'],
  ['Gulkremle', 'Russula claroflava', 'edible'],
  ['Gulnende kremle', 'Russula decolorans', 'edible'],
  ['Gul trompetsopp', 'Craterellus lutescens', 'edible'],
  ['Gråmusserong', 'Tricholoma portentosum', 'edible'],
  ['Frostvarsler', 'Hygrophorus hypothejus', 'edible'],
  ['Ametystsopp', 'Laccaria amethystina', 'edible'],
  ['Blomkålsopp', 'Sparassis crispa', 'edible'],
  ['Judasøre', 'Auricularia auricula-judae', 'edible'],
  ['Vintersopp', 'Flammulina velutipes', 'edible'],
  ['Snøballsjampinjong', 'Agaricus arvensis', 'edible'],
  ['Blåtutt', 'Lepista nuda', 'edible'],
  ['Vårfagerhatt', 'Calocybe gambosa', 'edible'],
  ['Vorterøyksopp', 'Lycoperdon perlatum', 'edible'],
  ['Nellikhatt', 'Marasmius oreades', 'edible'],
  ['Grovriske', 'Lactarius trivialis', 'conditionally_edible'],
  ['Sammenvokst fåresopp', 'Albatrellus confluens', 'edible'],
  ['Sherryhatt', 'Hygrophorus camarophyllus', 'edible'],
  ['Blek kantarell', 'Cantharellus pallens', 'edible'],
  ['Svovelriske', 'Lactarius scrobiculatus', 'inedible'],
  ['Storkremle (gul)', 'Russula claroflava', 'edible'] // dup guard test — will dedupe below
];

// Dedupe by latin (keeps first).
const seen = new Set();
const list = CANDIDATES.filter(([, latin]) => (seen.has(latin) ? false : seen.add(latin)));

async function gbif(latin) {
  try {
    const r = await fetch(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(latin)}`);
    const j = await r.json();
    return { matchType: j.matchType, canonical: j.canonicalName ?? j.scientificName ?? '', key: j.usageKey ?? '' };
  } catch {
    return { matchType: 'ERR', canonical: '', key: '' };
  }
}

// MediaWiki action API with redirects + pageimages — follows redirects and
// returns the article's lead image (the actual species photo). Try the Latin
// name on en/no, then the Norwegian common name on no.
async function wikiImageFor(title, lang) {
  try {
    const u = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=400&titles=${encodeURIComponent(title)}`;
    const r = await fetch(u, { headers: { 'User-Agent': 'mycelet.com species seed (support@mycelet.com)' } });
    if (!r.ok) return null;
    const j = await r.json();
    const pages = j?.query?.pages ?? {};
    for (const k of Object.keys(pages)) {
      const src = pages[k]?.thumbnail?.source;
      if (src) return src;
    }
  } catch {
    // fall through
  }
  return null;
}

async function wikiImage(latin, no) {
  return (
    (await wikiImageFor(latin, 'en')) ||
    (await wikiImageFor(latin, 'no')) ||
    (await wikiImageFor(no, 'no')) ||
    '(ingen bilde)'
  );
}

console.log('NO_NAVN\tLATIN\tEDIBILITY\tGBIF\tWIKI_BILDE');
for (const [no, latin, edi] of list) {
  const g = await gbif(latin);
  const img = await wikiImage(latin, no);
  const flag = g.matchType === 'EXACT' ? 'EXACT' : `⚠️${g.matchType}->${g.canonical}`;
  console.log(`${no}\t${latin}\t${edi}\t${flag}\t${img}`);
}
console.log(`\nTotalt: ${list.length} arter`);
