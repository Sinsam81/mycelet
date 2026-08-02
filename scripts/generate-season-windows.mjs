/**
 * Bygg empiriske sesongvinduer per art fra de daterte GBIF/Artsdatabanken-
 * funnene og skriv dem til src/lib/utils/season-window-data.ts.
 *
 * Hvorfor: de håndsatte season_start/season_end i mushroom_species er
 * systematisk for smale. Målt mot 327k daterte funn lå 9,0 % av alle funn i
 * måneder appen sa arten IKKE var i sesong — verst for piggsopp (37,5 %),
 * gulnende kremle (39,6 %), østerssopp (38,8 %) og vintersopp (54,8 %).
 *
 * Definisjonen vi bruker: sesongvinduet er den KORTESTE sammenhengende rekken
 * av måneder (sirkulær, så vintersopp kan gå sep→feb) som dekker minst
 * COVERAGE av artens daterte funn. Det er en persentil av den faktiske
 * funnfordelingen, ikke en utvidelse av alle vinduer — arter med kort, skarp
 * sesong beholder et kort vindu.
 *
 * Vi lager samme vindu per breddegradsbånd (sør/sentral/nord, samme grenser
 * som scripts/phenology-core.mjs) der utvalget er stort nok. Det ERSTATTER den
 * gamle «4 dager senere per breddegrad»-formelen, som ikke hadde empirisk
 * dekning: av 38 arter med nok funn i både sør og nord starter sesongen senere
 * i nord for 12, TIDLIGERE for 4 og i samme måned for 22 — og aldri mer enn én
 * måned forskjøvet.
 *
 * Kjør:  node --env-file=.env.local scripts/generate-season-windows.mjs
 * Dette er klimatologi — kjør på nytt etter en større funnimport, ellers
 * kanskje én gang i året.
 */
import { writeFileSync } from 'node:fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Tabellen er offentlig lesbar (RLS: «Funndata er synlige for alle»), så anon
// holder. Service-nøkkelen brukes hvis den finnes, som i de andre skriptene.
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error('Mangler NEXT_PUBLIC_SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY/ANON_KEY i miljøet.');
  process.exit(1);
}

/** Andel av artens daterte funn vinduet minst må dekke. */
const COVERAGE = 0.9;
/** Under dette antallet stoler vi ikke på funnfordelingen i det hele tatt. */
const MIN_SAMPLE_ALL = 40;
/** Under dette faller båndet tilbake på hele-Norden-vinduet. */
const MIN_SAMPLE_BAND = 150;
const PAGE = 1000;

const MONTHS_NB = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
  if (!res.ok) throw new Error(`REST ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** Samme båndgrenser som scripts/phenology-core.mjs latBand(). */
function latBand(lat) {
  if (lat < 61) return 'south';
  if (lat < 64) return 'central';
  return 'north';
}

/**
 * Korteste sammenhengende (sirkulære) rekke av måneder som dekker >= cover av
 * massen. Returnerer null når det ikke finnes funn.
 */
function shortestSpan(counts, cover) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const need = total * cover;
  let best = null;
  for (let start = 0; start < 12; start++) {
    let sum = 0;
    for (let len = 1; len <= 12; len++) {
      sum += counts[(start + len - 1) % 12];
      if (sum >= need) {
        if (!best || len < best.len) best = { start, len };
        break;
      }
    }
  }
  return best;
}

function maskFromSpan(span) {
  let mask = 0;
  for (let i = 0; i < span.len; i++) mask |= 1 << ((span.start + i) % 12);
  return mask;
}

function labelFromMask(mask) {
  const months = [];
  for (let i = 0; i < 12; i++) if (mask & (1 << i)) months.push(MONTHS_NB[i]);
  return months.join(' ');
}

async function main() {
  const species = await rest('mushroom_species?select=id,norwegian_name,latin_name&order=id');
  const nameById = new Map(species.map((s) => [s.id, s]));

  const counts = new Map();
  const ensure = (id) => {
    let c = counts.get(id);
    if (!c) {
      c = { all: Array(12).fill(0), south: Array(12).fill(0), central: Array(12).fill(0), north: Array(12).fill(0) };
      counts.set(id, c);
    }
    return c;
  };

  let from = 0;
  let total = 0;
  let sentinels = 0;
  for (;;) {
    const rows = await rest(
      `species_occurrences?select=species_id,latitude,observed_at&species_id=not.is.null&observed_at=not.is.null&order=id&offset=${from}&limit=${PAGE}`
    );
    if (rows.length === 0) break;
    for (const r of rows) {
      const iso = r.observed_at;
      if (!iso || iso.length < 10) continue;
      const month = Number(iso.slice(5, 7));
      const day = Number(iso.slice(8, 10));
      if (!(month >= 1 && month <= 12)) continue;
      // GBIF-poster med bare årstall får sentinel-datoen 01-01 og lager en
      // kunstig januartopp. Verifisert i phenology-core.mjs; 0,58 % av radene.
      if (month === 1 && day === 1) {
        sentinels++;
        continue;
      }
      const c = ensure(r.species_id);
      c.all[month - 1]++;
      c[latBand(r.latitude)][month - 1]++;
      total++;
    }
    from += rows.length;
    if (rows.length < PAGE) break;
    if (from % 50000 === 0) process.stdout.write(`  …${from} rader\r`);
  }
  console.log(`Leste ${total} daterte funn over ${counts.size} arter (droppet ${sentinels} 1.-januar-sentineller).`);

  const out = {};
  const lines = [];
  let withBands = 0;
  for (const [id, c] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    const n = c.all.reduce((a, b) => a + b, 0);
    if (n < MIN_SAMPLE_ALL) continue;
    const spanAll = shortestSpan(c.all, COVERAGE);
    if (!spanAll) continue;
    const entry = { all: maskFromSpan(spanAll), n };
    const bandLabels = [];
    for (const band of ['south', 'central', 'north']) {
      const nb = c[band].reduce((a, b) => a + b, 0);
      if (nb < MIN_SAMPLE_BAND) continue;
      const span = shortestSpan(c[band], COVERAGE);
      if (!span) continue;
      entry[band] = maskFromSpan(span);
      const bandNb = { south: 'sør (<61°N)', central: 'sentralt (61–64°N)', north: 'nord (>64°N)' }[band];
      bandLabels.push(`${bandNb}: ${labelFromMask(entry[band])}`);
    }
    if (bandLabels.length > 0) withBands++;
    out[String(id)] = entry;
    const sp = nameById.get(id);
    const name = sp ? `${sp.norwegian_name} (${sp.latin_name})` : `art ${id}`;
    const fields = ['all', 'south', 'central', 'north', 'n']
      .filter((k) => entry[k] !== undefined)
      .map((k) => `${k}: ${entry[k]}`)
      .join(', ');
    lines.push(
      `  // ${name} — n=${n} — hele Norden: ${labelFromMask(entry.all)}${bandLabels.length ? ' — ' + bandLabels.join(' — ') : ''}\n` +
        `  '${id}': { ${fields} },`
    );
  }

  const header = `// AUTO-GENERERT av scripts/generate-season-windows.mjs — IKKE REDIGER FOR HÅND.
// Empiriske sesongvinduer fra ${total} daterte GBIF/Artsdatabanken-funn.
// Vinduet er den korteste sammenhengende rekken av måneder som dekker minst
// ${Math.round(COVERAGE * 100)} % av artens funn. Månedsmaske: bit 0 = januar … bit 11 = desember.
// Regenerer:  node --env-file=.env.local scripts/generate-season-windows.mjs

export interface SpeciesSeasonWindow {
  /** Månedsmaske for hele Norden. */
  all: number;
  /** Breddegradsbånd, kun når båndet har minst ${MIN_SAMPLE_BAND} daterte funn. */
  south?: number;
  central?: number;
  north?: number;
  /** Antall daterte funn bak \`all\`. */
  n: number;
}

/** Andelen av funnene vinduene dekker. Brukes i UI-teksten. */
export const SEASON_WINDOW_COVERAGE = ${COVERAGE};

export const SEASON_WINDOW_META = {
  finds: ${total},
  species: ${Object.keys(out).length},
  withBands: ${withBands},
  minSampleAll: ${MIN_SAMPLE_ALL},
  minSampleBand: ${MIN_SAMPLE_BAND}
} as const;

export const SEASON_WINDOWS: Record<string, SpeciesSeasonWindow> = {
${lines.join('\n')}
};
`;

  writeFileSync('src/lib/utils/season-window-data.ts', header);
  console.log(`Skrev src/lib/utils/season-window-data.ts — ${Object.keys(out).length} arter, ${withBands} med båndvinduer.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
