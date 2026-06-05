// Import real Norwegian fungi occurrence records from GBIF into
// species_occurrences, matched to our mushroom_species by Latin name.
//
// Run: node --env-file=.env.local scripts/import-gbif-occurrences.mjs
//
// Idempotent: occurrences are upserted on gbif_key, so re-running refreshes
// without duplicates. GBIF is open data (no account needed for the search API).

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log('MISSING_ENV');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

const PER_SPECIES_CAP = 4000;
const PAGE = 300;
// Countries to import. Pass as CLI args (e.g. `... import-gbif-occurrences.mjs SE`),
// or default to both Norway and Sweden.
const COUNTRIES = process.argv.slice(2).length ? process.argv.slice(2) : ['NO', 'SE'];

async function gbifMatch(latin) {
  const res = await fetch(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(latin)}`);
  const j = await res.json();
  return j && j.usageKey && j.matchType !== 'NONE' ? j.usageKey : null;
}

function parseObservedAt(r) {
  if (typeof r.eventDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r.eventDate)) return r.eventDate.slice(0, 10);
  if (typeof r.year === 'number') return `${r.year}-01-01`;
  return null;
}

async function gbifOccurrences(taxonKey, country) {
  const out = [];
  for (let offset = 0; offset < PER_SPECIES_CAP; offset += PAGE) {
    const res = await fetch(
      `https://api.gbif.org/v1/occurrence/search?taxonKey=${taxonKey}&country=${country}&hasCoordinate=true&limit=${PAGE}&offset=${offset}`
    );
    const j = await res.json();
    const results = j.results ?? [];
    for (const r of results) {
      if (typeof r.decimalLatitude === 'number' && typeof r.decimalLongitude === 'number') {
        out.push({
          gbif_key: r.key,
          latitude: r.decimalLatitude,
          longitude: r.decimalLongitude,
          observed_at: parseObservedAt(r)
        });
      }
    }
    if (j.endOfRecords || results.length === 0) break;
  }
  return out;
}

// Guard: confirm the table exists (migration applied).
const probe = await admin.from('species_occurrences').select('id').limit(1);
if (probe.error) {
  console.log('TABLE_MISSING — kjør migrasjon 013 først.', probe.error.message);
  process.exit(1);
}

const { data: species, error: spErr } = await admin
  .from('mushroom_species')
  .select('id, latin_name, norwegian_name')
  .not('latin_name', 'is', null);
if (spErr) {
  console.log('SPECIES_ERR', spErr.message);
  process.exit(1);
}
console.log('Arter å hente:', species.length);

let grandTotal = 0;
for (const sp of species) {
  try {
    const taxonKey = await gbifMatch(sp.latin_name);
    if (!taxonKey) {
      console.log(`- ${sp.latin_name}: ingen GBIF-match`);
      continue;
    }
    for (const country of COUNTRIES) {
      const occ = await gbifOccurrences(taxonKey, country);
      if (occ.length === 0) {
        console.log(`- ${sp.norwegian_name} [${country}]: 0 funn`);
        continue;
      }
      const rows = occ.map((o) => ({ ...o, species_id: sp.id, source: 'gbif' }));
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await admin
          .from('species_occurrences')
          .upsert(chunk, { onConflict: 'gbif_key', ignoreDuplicates: true });
        if (error) console.log(`  upsert-feil (${sp.latin_name} ${country}):`, error.message);
      }
      grandTotal += rows.length;
      console.log(`✓ ${sp.norwegian_name} [${country}]: ${rows.length} funn`);
    }
  } catch (e) {
    console.log(`! ${sp.latin_name}: ${e.message}`);
  }
}

const { count } = await admin.from('species_occurrences').select('id', { count: 'exact', head: true });
console.log(`\nFERDIG. Hentet ~${grandTotal} funn. Totalt i tabellen nå: ${count}`);
