// Bygg lista over artsbilder som er SMALERE enn det bredeste trinnet artssiden
// ber om, og skriv den til src/lib/species/commons-smale-originaler.generated.ts.
//
// Hvorfor: hovedbildet på artssiden hentes i flere bredder (srcset), opptil
// 1280 piksler. Wikimedia Commons svarer også på et trinn som er BREDERE enn
// originalen — den skalerer opp. `Birkenpilz01.jpg` er 400 piksler bred;
// 1280-utgaven er 393 kB mot 71 kB for 330-utgaven, uten én ny detalj. Lista
// her er taket per bilde, så siden aldri ber om flere piksler enn fila har.
//
// Bare lesing, begge steder:
//   - Supabase: species_photos.image_url og mushroom_species.primary_image_url
//     (offentlig lesbare; anon-nøkkelen holder)
//   - Commons' åpne API: bredden på hver fil (prop=imageinfo, iiprop=size)
// Skriptet skriver ÉN fil i repoet og ingenting i basen.
//
// Kjør:  node --env-file=.env.local scripts/generate-commons-widths.mjs
//
// Kjør på nytt når artsbilder legges til eller byttes ut. Glemmer du det, går
// ingenting i stykker: et bilde som ikke står i lista behandles som stort, og
// et lite bilde hentes da oppskalert til lista er oppdatert.

import { writeFileSync } from 'node:fs';
import { commonsFileNameFromUrl, commonsTitle } from './lib/commons-credit.mjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error(
    'MANGLER MILJØVARIABLER: NEXT_PUBLIC_SUPABASE_URL og NEXT_PUBLIC_SUPABASE_ANON_KEY.\n' +
      'Kjør med:  node --env-file=.env.local scripts/generate-commons-widths.mjs'
  );
  process.exit(1);
}

/** Det bredeste trinnet artssiden ber om. Må følge SRCSET_TRINN i commons-thumb.ts. */
const STORSTE_TRINN = 1280;

// Wikimedias API-retningslinjer krever en identifiserende User-Agent med en
// kontaktvei (samme som backfill-photo-credits.mjs). Kan overstyres.
const USER_AGENT =
  process.env.COMMONS_USER_AGENT || 'MyceletCommonsWidths/1.0 (https://mycelet.com; post@mycelet.com)';
const API = 'https://commons.wikimedia.org/w/api.php';
// Anonyme kall tar maks 50 titler per spørring.
const BUNKE = 50;

const vent = (ms) => new Promise((r) => setTimeout(r, ms));

async function rest(sti) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${sti}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
  if (!res.ok) throw new Error(`REST ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** Map<filnavn, bredde> for en bunke filnavn. Filer Commons ikke kjenner utelates. */
async function hentBredder(filnavn) {
  const titler = filnavn.map(commonsTitle);
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'imageinfo',
    iiprop: 'size',
    redirects: '1',
    maxlag: '5',
    titles: titler.join('|')
  });
  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Commons API svarte ${res.status} ${res.statusText}`);
  const svar = await res.json();
  if (svar.error) throw new Error(`Commons API-feil: ${svar.error.code} — ${svar.error.info}`);

  // Svaret er nøklet på den ENDELIGE tittelen (normalisert, og etter en
  // eventuell omdøping), så kjeden følges tilbake til det vi spurte om.
  const steg = new Map();
  for (const { from, to } of svar.query?.normalized ?? []) steg.set(from, to);
  for (const { from, to } of svar.query?.redirects ?? []) steg.set(from, to);
  const sider = new Map();
  for (const side of svar.query?.pages ?? []) sider.set(side.title, side);

  const ut = new Map();
  for (let i = 0; i < filnavn.length; i++) {
    let tittel = titler[i];
    for (let hopp = 0; hopp < 5 && steg.has(tittel); hopp++) tittel = steg.get(tittel);
    const bredde = sider.get(tittel)?.imageinfo?.[0]?.width;
    if (Number.isInteger(bredde) && bredde > 0) ut.set(filnavn[i], bredde);
  }
  return ut;
}

async function main() {
  const [bilder, arter] = await Promise.all([
    rest('species_photos?select=image_url&limit=5000'),
    rest('mushroom_species?select=primary_image_url&primary_image_url=not.is.null&limit=5000')
  ]);
  const adresser = [...bilder.map((r) => r.image_url), ...arter.map((r) => r.primary_image_url)];
  const filnavn = [...new Set(adresser.map(commonsFileNameFromUrl).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'en')
  );
  console.log(`${adresser.length} bilde-URL-er i basen, ${filnavn.length} ulike Commons-filer.`);
  if (filnavn.length === 0) {
    console.error('Fant ingen Commons-filer — skriver ingenting.');
    process.exit(1);
  }

  const bredder = new Map();
  for (let i = 0; i < filnavn.length; i += BUNKE) {
    const bunke = filnavn.slice(i, i + BUNKE);
    for (const [navn, bredde] of await hentBredder(bunke)) bredder.set(navn, bredde);
    if (i + BUNKE < filnavn.length) await vent(1000);
  }

  const ukjente = filnavn.filter((navn) => !bredder.has(navn));
  if (ukjente.length > 0) {
    // Ikke en feil: bildet behandles som stort. Men det er verdt å vite om.
    console.warn(`⚠ ${ukjente.length} filer fant Commons ikke (omdøpt eller slettet?):`);
    for (const navn of ukjente) console.warn(`    ${navn}`);
  }

  const smale = filnavn.filter((navn) => bredder.has(navn) && bredder.get(navn) < STORSTE_TRINN);
  const dato = new Date().toISOString().slice(0, 10);
  // Enkle anførselstegn, som resten av kildekoden; filnavn kan inneholde dem.
  const somStreng = (navn) => `'${navn.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const linjer = smale.map((navn) => `  ${somStreng(navn)}: ${bredder.get(navn)}`);

  const innhold = `// AUTO-GENERERT av scripts/generate-commons-widths.mjs — IKKE REDIGER FOR HÅND.
// Artsbildene på Wikimedia Commons som er smalere enn ${STORSTE_TRINN} piksler, med
// originalens bredde. Brukes som tak når artssiden velger bildebredde, så den
// aldri ber Commons om en oppskalert utgave (se commons-thumb.ts).
// Et bilde som IKKE står her er enten minst ${STORSTE_TRINN} piksler bredt eller ukjent.
// Regenerer:  node --env-file=.env.local scripts/generate-commons-widths.mjs

export const COMMONS_BREDDER_META = {
  hentet: '${dato}',
  filer: ${filnavn.length},
  smale: ${smale.length},
  storsteTrinn: ${STORSTE_TRINN}
} as const;

/** Commons-filnavn (dekodet, mellomrom i stedet for understrek) → originalens bredde i piksler. */
export const COMMONS_SMALE_ORIGINALER: Readonly<Record<string, number>> = {
${linjer.join(',\n')}
};
`;
  const mal = new URL('../src/lib/species/commons-smale-originaler.generated.ts', import.meta.url);
  writeFileSync(mal, innhold);
  console.log(`Skrev ${smale.length} smale originaler av ${filnavn.length} filer til ${mal.pathname}`);
}

main().catch((feil) => {
  console.error(feil);
  process.exit(1);
});
