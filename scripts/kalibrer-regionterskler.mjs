// Måler fordelingen av regionenes dagstall og foreslår dommestigen.
//
// Bakgrunn: REGION_CONDITION_THRESHOLDS i src/lib/prediction/region-score.ts
// er satt fra en måling over ET SMALT VINDU — 22 regioner × 17 dager i slutten
// av august 2026. Fordelingen flytter seg gjennom sesongen, og en stige som
// låses til august vil fyre topp-dommen for ofte i oktober, eller for sjelden.
// Kjør denne på nytt når sesongen er over og flytt tallene hvis de har flyttet
// seg.
//
// Feilen den vokter mot er ekte og allerede gjort én gang: regionsendepunktet
// arvet rutenes stige (CONDITION_THRESHOLDS, målt på ENKELTRUTER) selv om
// regionstallet er 90-persentilen OVER ruter. Kommentaren lovet «topp 10 %»,
// virkeligheten var 22,5 %.
//
// Kjør: node --env-file=.env.local scripts/kalibrer-regionterskler.mjs
// Skriver ingenting. Rapporten er beslutningsgrunnlaget; endringen gjør du selv.
//
// Flagg:
//   --fra YYYY-MM-DD   bare dager fra og med denne (f.eks. hele høysesongen)
//   --til YYYY-MM-DD   bare dager til og med denne

import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const flagg = (navn) => {
  const i = args.indexOf(navn);
  return i === -1 ? null : args[i + 1] ?? null;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    'MANGLER MILJØVARIABLER: NEXT_PUBLIC_SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Kjør med:  node --env-file=.env.local scripts/kalibrer-regionterskler.mjs'
  );
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

/** Nærmeste-rang-persentil over en STIGENDE sortert liste. */
function persentil(sortert, andel) {
  if (sortert.length === 0) return null;
  return sortert[Math.min(sortert.length - 1, Math.floor(sortert.length * andel))];
}

// Tersklene som står i koden nå — så rapporten viser før/etter, ikke bare etter.
const NAAVAERENDE = { excellent: 81, good: 70, moderate: 61 };

async function main() {
  let q = admin.from('region_daily_scores').select('region,tile_date,score');
  const fra = flagg('--fra');
  const til = flagg('--til');
  if (fra) q = q.gte('tile_date', fra);
  if (til) q = q.lte('tile_date', til);

  const { data, error } = await q;
  if (error) {
    console.error('Databasefeil:', error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) {
    console.error('Ingen rader i region_daily_scores for det valgte vinduet.');
    process.exit(1);
  }

  const datoer = [...new Set(data.map((r) => r.tile_date))].sort();
  const scorer = data.map((r) => r.score).sort((a, b) => a - b);
  const regioner = new Set(data.map((r) => r.region)).size;

  console.log(
    `Grunnlag: ${scorer.length} regiondøgn — ${regioner} regioner × ${datoer.length} dager ` +
      `(${datoer[0]} → ${datoer[datoer.length - 1]})`
  );

  // ⚠️ Et smalt vindu gir en stige som bare gjelder det vinduet. Si det høyt.
  if (datoer.length < 60) {
    console.log(
      `\n⚠️  Bare ${datoer.length} dager. Fordelingen flytter seg gjennom sesongen, så\n` +
        '   tersklene under gjelder strengt tatt bare denne perioden. Kjør på nytt\n' +
        '   med et bredere vindu før du låser dem for et helt år.'
    );
  }

  console.log('\nFORDELING');
  for (const [navn, andel] of [
    ['min', 0], ['p05', 0.05], ['p10', 0.1], ['p25', 0.25],
    ['median', 0.5], ['p75', 0.75], ['p90', 0.9], ['p95', 0.95]
  ]) {
    console.log(`  ${navn.padEnd(7)} ${persentil(scorer, andel)}`);
  }
  console.log(`  maks    ${scorer[scorer.length - 1]}`);

  const foreslatt = {
    excellent: persentil(scorer, 0.9),
    good: persentil(scorer, 0.75),
    moderate: persentil(scorer, 0.5)
  };

  console.log('\nREGION_CONDITION_THRESHOLDS');
  console.log(`  ${'trinn'.padEnd(12)} ${'betyr'.padEnd(12)} ${'i koden'.padEnd(9)} foreslått`);
  for (const [trinn, betyr] of [['excellent', 'topp 10 %'], ['good', 'topp 25 %'], ['moderate', 'medianen']]) {
    const naa = NAAVAERENDE[trinn];
    const ny = foreslatt[trinn];
    const merke = naa === ny ? '' : `   ← flytt ${naa} → ${ny}`;
    console.log(`  ${trinn.padEnd(12)} ${betyr.padEnd(12)} ${String(naa).padEnd(9)} ${String(ny)}${merke}`);
  }

  console.log('\nHVA TERSKLENE FAKTISK TREFFER I DETTE VINDUET');
  for (const [trinn, verdi] of Object.entries(NAAVAERENDE)) {
    const n = scorer.filter((s) => s >= verdi).length;
    console.log(`  ≥${String(verdi).padStart(3)} (${trinn.padEnd(9)}) ${String(n).padStart(5)} av ${scorer.length} = ${((100 * n) / scorer.length).toFixed(1)} %`);
  }
  // Varselet leser samme tall og må forbli sjeldnere enn topp-dommen.
  const varsel = scorer.filter((s) => s >= 85).length;
  console.log(
    `  ≥ 85 (varsel   ) ${String(varsel).padStart(5)} av ${scorer.length} = ${((100 * varsel) / scorer.length).toFixed(1)} %` +
      (85 > NAAVAERENDE.excellent ? '   ✅ strengere enn topp-dommen' : '   ⚠️  IKKE strengere enn topp-dommen')
  );
}

main().catch((err) => {
  console.error('\nAvbrutt:', err.message);
  process.exit(1);
});
