// Rekonstruerer varsel_hendelser fra region_daily_scores med samme regler som
// decision.ts/finnOmslag (økning ≥ 8 mot ukas bunn). Terskelen følger
// VARSEL_MIN_SCORE i decision.ts (81 på regionskalaen siden 2026-09-05).
//
// ⚠️ Kjørt 2026-09-05 med TERSKEL=85 (datidens terskel) for perioden fra
// 11.08 — de 26 radene matcher X-postene som faktisk gikk ut. IKKE kjør på
// nytt med 81 over samme periode: det ville lagt inn «varsler» ingen sendte.
import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await db.from('region_daily_scores').select('region,tile_date,score').order('tile_date', { ascending: true }).limit(5000);
if (error) throw error;
const T = Number(process.env.TERSKEL || 81), OK = 8, per = {};
for (const r of data) (per[r.region] ??= {})[r.tile_date] = r.score;
const rader = [];
for (const [region, d] of Object.entries(per)) {
  for (const dato of Object.keys(d).sort()) {
    const t = new Date(dato + 'T00:00:00Z');
    const ig = new Date(t); ig.setUTCDate(t.getUTCDate() - 1);
    const igaar = d[ig.toISOString().slice(0, 10)];
    if (igaar === undefined || d[dato] < T || igaar >= T) continue;
    let bunn = d[dato];
    for (let k = 0; k < 7; k++) { const x = new Date(t); x.setUTCDate(t.getUTCDate() - k); const v = d[x.toISOString().slice(0, 10)]; if (v !== undefined && v < bunn) bunn = v; }
    if (d[dato] - bunn < OK) continue;
    rader.push({ region, dato, fra_score: bunn, til_score: d[dato] });
  }
}
const { error: e2 } = await db.from('varsel_hendelser').upsert(rader, { onConflict: 'region,dato' });
if (e2) throw e2;
const { count } = await db.from('varsel_hendelser').select('*', { count: 'exact', head: true });
console.log('skrevet', rader.length, 'omslag — tabellen har nå', count, 'rader');
