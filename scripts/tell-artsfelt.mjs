// Teller hvor mange arter som har hvert av feltene artssiden viser — og
// hvilke arter som mangler dem. Bare lesing; skriver aldri.
//
// Hvorfor: artssiden viser det basen har (src/lib/species/artsfakta.ts), og
// ingenting for et felt som er tomt. «Kjennetegn»-seksjonen (hatt, skiver,
// stilk, lukt) finnes i dag bare for de åtte forvekslingsartene fra migrasjon
// 049, og åtte arter mangler bilde. Dette skriptet er status FØR og ETTER en
// innholdsrunde: hva er fylt, og hvem står igjen.
//
// Kjør:  node --env-file=.env.local scripts/tell-artsfelt.mjs
//        node --env-file=.env.local scripts/tell-artsfelt.mjs --mangler   (list artene per felt)
//
// Tabellen er offentlig lesbar, så anon-nøkkelen holder.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error(
    'MANGLER MILJØVARIABLER: NEXT_PUBLIC_SUPABASE_URL og NEXT_PUBLIC_SUPABASE_ANON_KEY.\n' +
      'Kjør med:  node --env-file=.env.local scripts/tell-artsfelt.mjs'
  );
  process.exit(1);
}

const VIS_MANGLER = process.argv.includes('--mangler');

/** Kolonnene artssiden leser, i den rekkefølgen den viser dem. */
const FELT = [
  ['primary_image_url', 'Bilde'],
  ['primary_image_photographer', 'Fotograf (kreditering)'],
  ['primary_image_license', 'Lisens (kreditering)'],
  ['description', 'Beskrivelse'],
  ['swedish_name', 'Svensk navn'],
  ['english_name', 'Engelsk navn'],
  ['habitat', 'Habitat'],
  ['mycorrhizal_partners', 'Vokser med (vertstrær)'],
  ['substrate', 'Vokser på (substrat)'],
  ['commonality', 'Hvor vanlig'],
  ['family', 'Familie'],
  ['genus', 'Slekt'],
  ['synonyms', 'Andre vitenskapelige navn'],
  ['cap_description', 'Kjennetegn: hatt'],
  ['gills_description', 'Kjennetegn: skiver'],
  ['stem_description', 'Kjennetegn: stilk'],
  ['flesh_description', 'Kjennetegn: kjøtt'],
  ['smell', 'Kjennetegn: lukt']
];

function harVerdi(verdi) {
  if (Array.isArray(verdi)) return verdi.some((element) => typeof element === 'string' && element.trim() !== '');
  return typeof verdi === 'string' ? verdi.trim() !== '' : verdi != null;
}

const kolonner = ['id', 'norwegian_name', 'edibility', ...FELT.map(([kolonne]) => kolonne)].join(',');
const res = await fetch(`${SUPABASE_URL}/rest/v1/mushroom_species?select=${kolonner}&order=id&limit=5000`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
});
if (!res.ok) {
  console.error(`Kunne ikke lese artslista: ${res.status} ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const arter = await res.json();

console.log(`${arter.length} arter i katalogen.\n`);
const bredde = Math.max(...FELT.map(([, navn]) => navn.length));
for (const [kolonne, navn] of FELT) {
  const mangler = arter.filter((art) => !harVerdi(art[kolonne]));
  const fylt = arter.length - mangler.length;
  console.log(`${navn.padEnd(bredde)}  ${String(fylt).padStart(3)} av ${arter.length}`);
  if (VIS_MANGLER && mangler.length > 0 && mangler.length <= arter.length / 2) {
    for (const art of mangler) console.log(`    mangler: #${art.id} ${art.norwegian_name} (${art.edibility})`);
  }
}

// De to hullene som betyr mest for den som skal sammenligne en sopp med siden:
// arter helt uten bilde, og om de i det minste har kjennetegnene i tekst.
const utenBilde = arter.filter((art) => !harVerdi(art.primary_image_url));
if (utenBilde.length > 0) {
  console.log(`\n${utenBilde.length} arter uten bilde:`);
  for (const art of utenBilde) {
    const tekst = ['cap_description', 'gills_description', 'stem_description', 'smell'].filter((k) => harVerdi(art[k]));
    console.log(
      `  #${art.id} ${art.norwegian_name} (${art.edibility}) — kjennetegn i tekst: ${tekst.length > 0 ? `${tekst.length} av 4` : 'INGEN'}`
    );
  }
}
