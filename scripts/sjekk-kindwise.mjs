// Sjekker Kindwise (mushroom.id) direkte, utenom appen. To trinn:
//   1. GET /usage_info — er nøkkelen gyldig, og hvor mange kreditter er igjen?
//      Koster ingen kreditter.
//   2. (valgfritt) POST /identification med NØYAKTIG samme kropp som
//      src/app/api/identify/route.ts sender. Avviser Kindwise den, prøves
//      varianter som skreller bort én antakelse om gangen (språk, details,
//      similar_images), slik at utskriften sier hvilken parameter som er
//      problemet. Hvert vellykket kall koster én kreditt.
//
// Kjør fra maskinen med nøkkelen (Kindwise-panelet → API keys → Detail):
//   PLANTID_API_KEY=… node scripts/sjekk-kindwise.mjs                # bare trinn 1
//   PLANTID_API_KEY=… node scripts/sjekk-kindwise.mjs kantarell.jpg  # trinn 1 + 2
//   node --env-file=.env.local scripts/sjekk-kindwise.mjs kantarell.jpg
//
// Skriver ingenting til databasen. Nøkkelen skrives aldri ut.

import { readFile } from 'node:fs/promises';

const BASE = 'https://mushroom.kindwise.com/api/v1';
const apiKey = process.env.PLANTID_API_KEY;

if (!apiKey || apiKey === 'your-api-key-here' || apiKey.length < 20) {
  console.error('PLANTID_API_KEY mangler eller er plassholderen. Sett den i miljøet eller .env.local.');
  process.exit(2);
}

const headers = { 'Api-Key': apiKey, 'Content-Type': 'application/json' };

async function kall(sti, init) {
  const res = await fetch(`${BASE}${sti}`, { ...init, headers });
  const tekst = await res.text();
  let json = null;
  try {
    json = JSON.parse(tekst);
  } catch {
    // ikke JSON — vises som tekst
  }
  return { status: res.status, ok: res.ok, json, tekst: tekst.slice(0, 800) };
}

console.log(`Nøkkel: ${apiKey.slice(0, 4)}…${apiKey.slice(-3)} (${apiKey.length} tegn)`);

// --- Trinn 1: usage_info -----------------------------------------------------
const bruk = await kall('/usage_info', { method: 'GET' });
console.log(`\n1) GET /usage_info → ${bruk.status}`);
if (!bruk.ok) {
  console.log(bruk.tekst);
  console.log('\nNøkkelen avvises allerede her. Sammenlign med nøkkelen i Kindwise-panelet (API keys → Detail)');
  console.log('og med PLANTID_API_KEY i Vercel (Settings → Environment Variables → Production).');
  process.exit(1);
}
console.log(JSON.stringify(bruk.json, null, 2));

// --- Trinn 2: identifikasjon --------------------------------------------------
const bildeSti = process.argv[2];
if (!bildeSti) {
  console.log('\nIngen bildefil oppgitt — hopper over identifikasjonskallet (trinn 2).');
  process.exit(0);
}

const base64 = (await readFile(bildeSti)).toString('base64');
console.log(`\nBilde: ${bildeSti} (${base64.length} base64-tegn)`);

// Samme kropp som ruta. Holdes i takt med src/app/api/identify/route.ts.
const rutensKropp = {
  images: [base64],
  similar_images: true,
  language: 'no',
  details: ['common_names', 'taxonomy', 'description', 'edibility']
};

const varianter = [
  ['som ruta sender', rutensKropp],
  ['uten language', { ...rutensKropp, language: undefined }],
  ['language=en', { ...rutensKropp, language: 'en' }],
  ['uten details', { ...rutensKropp, details: undefined }],
  ['bare images', { images: [base64] }]
];

for (const [navn, kropp] of varianter) {
  const res = await kall('/identification', { method: 'POST', body: JSON.stringify(kropp) });
  console.log(`\n2) POST /identification (${navn}) → ${res.status}`);
  if (res.ok) {
    const r = res.json?.result ?? {};
    const forslag = (r.classification?.suggestions ?? []).slice(0, 3);
    console.log(`   is_mushroom: ${JSON.stringify(r.is_mushroom ?? r.is_plant ?? null)}`);
    for (const s of forslag) {
      const vanlig = (s.details?.common_names ?? []).slice(0, 2).join(', ');
      console.log(`   ${Math.round((s.probability ?? 0) * 100)} %  ${s.name}  ${vanlig ? `(${vanlig})` : ''}  spiselighet=${s.details?.edibility ?? '–'}`);
    }
    if (navn !== 'som ruta sender') {
      console.log(`\n→ Ruta sin kropp avvises, men «${navn}» går gjennom. Det er parameteren som må endres i route.ts.`);
    } else {
      console.log('\n→ Kindwise svarer riktig på nøyaktig det ruta sender. Feiler appen likevel, er nøkkelen i Vercel en annen enn denne.');
    }
    process.exit(0);
  }
  console.log(`   ${res.tekst}`);
}

console.log('\n→ Alle varianter avvises. Les Kindwise sin feiltekst over — typisk nøkkel, kreditter eller bildeformat.');
process.exit(1);
