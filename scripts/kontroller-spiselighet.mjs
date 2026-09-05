// Kontrollerer hele artslista for motsigelser mellom spiselighetsmerke og
// artens egen tekst — se src/lib/species/spiselighetskontroll.ts for reglene.
// Kjør:  npm run kontroller:spiselighet     (lesing bare; skriver aldri)
import { createClient } from '@supabase/supabase-js';
import { finnSpiselighetsMotsigelse } from '../src/lib/species/spiselighetskontroll.ts';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Trenger NEXT_PUBLIC_SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY (node --env-file=.env.local).');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await db
  .from('mushroom_species')
  .select('id,norwegian_name,edibility,edibility_notes,toxin_info')
  .order('id');
if (error) {
  console.error('Kunne ikke lese artslista:', error.message);
  process.exit(1);
}
const treff = data.map((r) => ({ rad: r, grunn: finnSpiselighetsMotsigelse(r) })).filter((t) => t.grunn);
console.log(`${data.length} arter kontrollert.`);
if (!treff.length) {
  console.log('Ingen motsigelser mellom merke og tekst.');
  process.exit(0);
}
for (const t of treff) console.log(`⚠️  #${t.rad.id} ${t.rad.norwegian_name} (${t.rad.edibility}): ${t.grunn}`);
process.exit(2);
