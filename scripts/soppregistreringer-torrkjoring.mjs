// Tørrkjøring av soppregistreringer-cronen: regner hele utgaven mot EKTE GBIF,
// skriver en tabell, og skriver INGENTING til databasen. Ingen nøkler trengs.
//
// Kjør:  npm run torrkjor:soppregistreringer
//        npm run torrkjor:soppregistreringer -- --til=2026-09-07
//        npm run torrkjor:soppregistreringer -- --til=2026-09-07 --utgave=2026-09-12
//
// --til     overstyrer sluttdagen på sesongvinduet (standard: utgaven − 7 dager)
// --utgave  overstyrer utgavedatoen grensene regnes fra (standard: datasettets pubDate)
// --json    skriver de 64 radene (slik cronen ville lagret dem) til en fil
//
// vite-node fordi scriptet bruker de ekte modulene i src/ (med @/-aliaset):
// kallene, grensene og snittene er nøyaktig de cronen bruker. Tar 2–4 minutter
// med 2 s mellom kallene — GBIF svarer 429 hvis det går fortere.
import { lagGbifKlient, lesUtgave, sjekkIndeksering, tellSoppregistreringer } from '@/lib/rapport/soppregistreringer-henting';
import { OMRADER, prosentTekst } from '@/lib/rapport/soppregistreringer';
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? 'true'];
    })
);

const klient = lagGbifKlient();
const registeret = await lesUtgave(klient);
const utgave = args.utgave ?? registeret.dato;
console.log(`Utgave i GBIF (pubDate): ${registeret.dato}${args.utgave ? ` — overstyrt til ${utgave}` : ''} · registeret endret ${registeret.endret ?? '—'}`);
// Cronen stopper her hvis søkeindeksen ikke har utgaven; tørrkjøringen sier bare fra.
const indeksering = await sjekkIndeksering(klient, registeret);
console.log(`Søkeindeksen har utgaven: ${indeksering.ferdig ? 'ja' : 'NEI — tallene kan blande to utgaver'} (${indeksering.grunn})`);

const res = await tellSoppregistreringer(klient, utgave, {
  sesongTil: args.til,
  logg: (h, d) => console.log(`  ${h} ${JSON.stringify(d)}`)
});

const aar = Object.keys(res.rader[0].perAar);
console.log(`\nGrenser (høyeste funn-id endret på samme dato):`);
for (const [a, g] of Object.entries(res.rader[0].grenser)) console.log(`  ${a}: ${g.id} (${g.dato})`);

for (const vindu of ['sesong', 'uke']) {
  const v = res.vinduer[vindu];
  for (const gruppe of ['alle', 'storsopp']) {
    console.log(`\n${vindu === 'sesong' ? 'Sesongen hittil' : 'Siste hele uke'} ${v.fra}–${v.til} · ${gruppe}`);
    const kol = ['Område'.padEnd(16), utgave.slice(0, 4).padStart(7), ...aar.map((a) => a.padStart(7)), 'normal'.padStart(9), '%'.padStart(7)];
    console.log(`  ${kol.join(' ')}`);
    for (const omrade of OMRADER) {
      const r = res.rader.find((x) => x.vindu === vindu && x.gruppe === gruppe && x.omrade === omrade);
      const rad = [
        omrade.padEnd(16),
        String(r.antall).padStart(7),
        ...aar.map((a) => String(r.perAar[a]).padStart(7)),
        String(r.normal ?? '—').padStart(9),
        prosentTekst(r).padStart(7)
      ];
      console.log(`  ${rad.join(' ')}`);
    }
  }
}

if (args.json) writeFileSync(args.json, JSON.stringify(res.rader, null, 2));
console.log(`\nGBIF-kall: ${res.kall} · tid: ${(res.bruktMs / 1000).toFixed(1)} s · ingenting skrevet til databasen`);
