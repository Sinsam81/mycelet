// Måler hvor mange ruter i rasteret som får skogdata med den gamle regelen
// (bare midtpunktet) mot den nye (midtpunktet, så de fire kvadrantsentrene) —
// med EKTE oppslag mot NIBIO SR16 / CORINE, men uten å skrive noe som helst.
// Ingen database, ingen fliser, ingen nøkler.
//
// Kjør:  npm run dekning:rutenett                 (Oslo og Bergen)
//        npm run dekning:rutenett -- Stockholm Göteborg --samtidighet=3
//
// vite-node fordi scriptet bruker de ekte modulene i src/ (med @/-aliaset),
// ikke en kopi: skogoppslaget, rutenettet og prøveregelen er de samme som
// nattjobben i src/app/api/cron/generate-tiles bruker. Samtidigheten er som
// standard 5, det samme som nattjobben — vær snill mot NIBIO.
import { PREDICTION_TILE_REGIONS, predictionTileGridCells } from '@/lib/prediction/tile-regions';
import { provSkogIRuter } from '@/lib/prediction/skogprover';
import { getForestProperties } from '@/lib/forest';

const args = process.argv.slice(2);
const samtidighetArg = args.find((a) => a.startsWith('--samtidighet='));
const samtidighet = Math.max(1, Math.min(8, Number(samtidighetArg?.split('=')[1]) || 5));
const navn = args.filter((a) => !a.startsWith('--'));
const onsket = navn.length ? navn : ['Oslo', 'Bergen'];

const regioner = onsket.map((n) => {
  const r = PREDICTION_TILE_REGIONS.find((x) => x.name.toLowerCase() === n.toLowerCase());
  if (!r) {
    console.error(`Ukjent region: ${n}. Kjente: ${PREDICTION_TILE_REGIONS.map((x) => x.name).join(', ')}`);
    process.exit(1);
  }
  return r;
});

const fmt = (p) => `${p.lat.toFixed(3)}/${p.lng.toFixed(3)}`;
const totalt = { ruter: 0, senter: 0, forskjovet: 0, utenSkog: 0, senterOppslag: 0, ekstraOppslag: 0 };

for (const region of regioner) {
  const ruter = predictionTileGridCells(region);
  const start = Date.now();
  let senterMs = 0;
  const { prover, statistikk } = await provSkogIRuter(
    ruter,
    { lat: region.step, lng: region.step },
    (p) => getForestProperties({ lat: p.lat, lon: p.lng }),
    {
      samtidighet,
      vedSenterFerdig: () => {
        senterMs = Date.now() - start;
      }
    }
  );
  const ekstraMs = Date.now() - start - senterMs;

  console.log(`\n── ${region.name} (${region.country}, steg ${region.step}°) ──`);
  console.log(`Ruter i rutenettet:            ${statistikk.ruter}`);
  console.log(`Beholdt, bare midtpunkt:       ${statistikk.senter}`);
  console.log(
    `Beholdt, med forskyvning:      ${statistikk.senter + statistikk.forskjovet}  (+${statistikk.forskjovet})`
  );
  console.log(`Fortsatt uten skog:            ${statistikk.utenSkog}`);
  console.log(
    `Oppslag: ${ruter.length} midtpunkt på ${(senterMs / 1000).toFixed(1)} s ` +
      `(${Math.round(senterMs / Math.max(1, ruter.length))} ms/rute), ` +
      `${statistikk.ekstraOppslag} forskjøvne på ${(ekstraMs / 1000).toFixed(1)} s ` +
      `(${Math.round(ekstraMs / Math.max(1, statistikk.ekstraOppslag))} ms/oppslag)`
  );

  const reddet = prover
    .map((p, i) => ({ p, rute: ruter[i] }))
    .filter(({ p }) => p.kilde === 'forskjovet');
  if (reddet.length) {
    console.log('Reddet (rutens midtpunkt → punktet skogen ble målt i):');
    for (const { p, rute } of reddet) {
      const s = p.skog;
      const detaljer = [s.forestType, s.productivity != null ? `bonitet ${s.productivity}` : null, s.volumePerHa != null ? `${s.volumePerHa} m³/ha` : null]
        .filter(Boolean)
        .join(', ');
      console.log(`  ${fmt(rute)} → ${fmt(p.punkt)}  ${detaljer}`);
    }
  }
  const hull = prover.map((p, i) => ({ p, rute: ruter[i] })).filter(({ p }) => p.skog == null);
  if (hull.length) {
    console.log(`Ærlige hull (ingen av fem punkter er skog): ${hull.map(({ rute }) => fmt(rute)).join('  ')}`);
  }

  totalt.ruter += statistikk.ruter;
  totalt.senter += statistikk.senter;
  totalt.forskjovet += statistikk.forskjovet;
  totalt.utenSkog += statistikk.utenSkog;
  totalt.senterOppslag += ruter.length;
  totalt.ekstraOppslag += statistikk.ekstraOppslag;
}

console.log('\n── Totalt ──');
console.log(JSON.stringify({ regioner: regioner.map((r) => r.name), samtidighet, ...totalt }));
