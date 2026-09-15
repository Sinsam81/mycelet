import { describe, expect, it } from 'vitest';
import {
  SKOGPROVE_MS_PER_REGION,
  SKOGPROVE_SIKKERHETSMARGIN_MS,
  provSkogIRuter,
  skogavstandKm,
  skogproveFrist,
  skogprovepunkter,
  type Punkt
} from '../skogprover';
import { buildExplanation } from '@/lib/utils/prediction-explanation';

/**
 * Rasteret slo opp skog i midtpunktet alene og kastet hele ruta når det bommet.
 * På Oslo-kartet 15. sep 2026 manglet dermed skogkledde ruter på Nesoddens
 * østside (59,84/10,71 og 59,78/10,71) fordi midtpunktet lå i fjorden eller på
 * et jorde. Regelen: midtpunktet først, så de fire kvadrantsentrene.
 */
describe('skogprovepunkter', () => {
  it('gir midtpunktet først, så de fire kvadrantsentrene', () => {
    const punkter = skogprovepunkter({ lat: 59.84, lng: 10.71 }, 0.06);
    expect(punkter).toEqual([
      { lat: 59.84, lng: 10.71 },
      { lat: 59.855, lng: 10.695 },
      { lat: 59.855, lng: 10.725 },
      { lat: 59.825, lng: 10.695 },
      { lat: 59.825, lng: 10.725 }
    ]);
  });

  it('holder alle punktene inne i ruta — et treff er aldri lånt fra naboruta', () => {
    const senter = { lat: 60.38, lng: 5.33 };
    const steg = 0.07;
    for (const p of skogprovepunkter(senter, steg)) {
      expect(Math.abs(p.lat - senter.lat)).toBeLessThan(steg / 2);
      expect(Math.abs(p.lng - senter.lng)).toBeLessThan(steg / 2);
    }
  });

  it('bruker eget lengdegradssteg når ruta ikke er kvadratisk i grader', () => {
    const [, nordvest] = skogprovepunkter({ lat: 59.85, lng: 10.66 }, 0.02, 0.04);
    expect(nordvest).toEqual({ lat: 59.855, lng: 10.65 });
  });

  it('gir fem ulike punkter', () => {
    const punkter = skogprovepunkter({ lat: 59.9, lng: 10.75 }, 0.06);
    expect(new Set(punkter.map((p) => `${p.lat},${p.lng}`)).size).toBe(5);
  });
});

/** Et falskt skogkart: skog bare i de punktene som står i settet. */
function skogkart(skogpunkter: Punkt[]) {
  const nokler = new Set(skogpunkter.map((p) => `${p.lat},${p.lng}`));
  const kall: Punkt[] = [];
  const oppslag = async (p: Punkt) => {
    kall.push(p);
    return nokler.has(`${p.lat},${p.lng}`) ? { forestType: 'gran' as const, at: p } : null;
  };
  return { oppslag, kall };
}

const STEG = { lat: 0.06, lng: 0.06 };

describe('provSkogIRuter', () => {
  it('beholder midtpunktet når det er skog, og slår ikke opp flere punkter', async () => {
    const rute = { lat: 59.78, lng: 10.65 };
    const { oppslag, kall } = skogkart([rute]);
    const { prover, statistikk } = await provSkogIRuter([rute], STEG, oppslag, { samtidighet: 5 });
    expect(prover[0].kilde).toBe('senter');
    expect(prover[0].punkt).toEqual(rute);
    expect(kall).toHaveLength(1);
    expect(statistikk).toMatchObject({ senter: 1, forskjovet: 0, utenSkog: 0, ekstraOppslag: 0, avkortet: 0 });
  });

  it('redder ruta med første forskjøvne punkt som er skog, og stopper der', async () => {
    const rute = { lat: 59.84, lng: 10.71 };
    const [, nordvest, nordost] = skogprovepunkter(rute, STEG.lat);
    // Midtpunktet og nordvest er fjord; nordøst er skog (og sørvest også).
    const [, , , sorvest] = skogprovepunkter(rute, STEG.lat);
    const { oppslag, kall } = skogkart([nordost, sorvest]);
    const { prover, statistikk } = await provSkogIRuter([rute], STEG, oppslag, { samtidighet: 5 });
    expect(prover[0].kilde).toBe('forskjovet');
    expect(prover[0].punkt).toEqual(nordost);
    expect(prover[0].skog?.at).toEqual(nordost);
    expect(kall).toEqual([rute, nordvest, nordost]);
    expect(statistikk).toMatchObject({ senter: 0, forskjovet: 1, utenSkog: 0, ekstraOppslag: 2 });
  });

  it('lar ruta forbli et ærlig hull når ingen av de fem punktene er skog', async () => {
    const innsjo = { lat: 59.9, lng: 10.75 };
    const { oppslag, kall } = skogkart([]);
    const { prover, statistikk } = await provSkogIRuter([innsjo], STEG, oppslag, { samtidighet: 5 });
    expect(prover[0]).toEqual({ skog: null, kilde: null, punkt: null, avkortet: false });
    expect(kall).toHaveLength(5);
    expect(statistikk).toMatchObject({ senter: 0, forskjovet: 0, utenSkog: 1, ekstraOppslag: 4, avkortet: 0 });
  });

  it('slår opp ALLE midtpunktene før noe forskjøvet punkt', async () => {
    const ruter = [
      { lat: 59.78, lng: 10.65 },
      { lat: 59.84, lng: 10.71 },
      { lat: 59.9, lng: 10.77 }
    ];
    const { oppslag, kall } = skogkart([]);
    let senterFerdigEtter = -1;
    await provSkogIRuter(ruter, STEG, oppslag, {
      samtidighet: 1,
      vedSenterFerdig: () => {
        senterFerdigEtter = kall.length;
      }
    });
    expect(senterFerdigEtter).toBe(3);
    expect(kall.slice(0, 3)).toEqual(ruter);
  });

  it('et tak koster aldri en rute med skog i midtpunktet, og avkortede ruter telles', async () => {
    const skogRute = { lat: 59.78, lng: 10.65 };
    const bom1 = { lat: 59.84, lng: 10.71 };
    const bom2 = { lat: 59.9, lng: 10.77 };
    const { oppslag } = skogkart([skogRute]);
    let igjen = 2;
    const { prover, statistikk } = await provSkogIRuter([skogRute, bom1, bom2], STEG, oppslag, {
      samtidighet: 1,
      tillatForskyvning: () => (igjen-- > 0)
    });
    expect(prover[0].kilde).toBe('senter');
    expect(statistikk.ekstraOppslag).toBe(2);
    // bom1 brukte begge oppslagene og ble stoppet før tredje; bom2 fikk ingen.
    expect(prover[1].avkortet).toBe(true);
    expect(prover[2].avkortet).toBe(true);
    expect(statistikk).toMatchObject({ senter: 1, forskjovet: 0, utenSkog: 2, avkortet: 2 });
  });

  it('går i runder, så et tak fordeles over hele regionen i stedet for de første rutene', async () => {
    // Tre ruter bommer i midtpunktet. Den første er et ærlig hull (en innsjø),
    // de to andre har skog i FØRSTE kvadrantsenter. Med tre oppslag i taket skal
    // alle tre få sitt første forsøk — rute for rute ville innsjøen spist alle
    // tre, og begge skogrutene ville forsvunnet.
    const innsjo = { lat: 59.78, lng: 10.53 };
    const skogA = { lat: 59.84, lng: 10.71 };
    const skogB = { lat: 59.9, lng: 10.95 };
    const { oppslag } = skogkart([skogprovepunkter(skogA, STEG.lat)[1], skogprovepunkter(skogB, STEG.lat)[1]]);
    let igjen = 3;
    const { prover, statistikk } = await provSkogIRuter([innsjo, skogA, skogB], STEG, oppslag, {
      samtidighet: 2,
      tillatForskyvning: () => igjen-- > 0
    });
    expect(prover.map((p) => p.kilde)).toEqual([null, 'forskjovet', 'forskjovet']);
    expect(prover[0].avkortet).toBe(true);
    expect(statistikk).toMatchObject({ senter: 0, forskjovet: 2, utenSkog: 1, ekstraOppslag: 3, avkortet: 1 });
  });

  it('prøver punktene i fast rekkefølge for hver rute, også på tvers av runder', async () => {
    const rute = { lat: 60.41, lng: 5.26 };
    const [, nordvest, nordost, sorvest] = skogprovepunkter(rute, 0.07);
    const { oppslag, kall } = skogkart([sorvest]);
    const { prover } = await provSkogIRuter([rute], { lat: 0.07, lng: 0.07 }, oppslag, { samtidighet: 5 });
    expect(kall).toEqual([rute, nordvest, nordost, sorvest]);
    expect(prover[0].punkt).toEqual(sorvest);
  });

  it('tåler en tom liste', async () => {
    const { oppslag } = skogkart([]);
    const { prover, statistikk } = await provSkogIRuter([], STEG, oppslag, { samtidighet: 5 });
    expect(prover).toEqual([]);
    expect(statistikk).toMatchObject({ ruter: 0, senter: 0, forskjovet: 0, utenSkog: 0 });
  });
});

/**
 * De levende rutenettene satte nåla i midtpunktet, men sendte ingen avstand til
 * forklaringsteksten. Kom skogen fra et kvadrantsenter, sto det «Skog her
 * (SR16): granskog, bonitet 20» om skog målt ~3,5 km unna — mens
 * områderapporten i samme svar sa at skogdataene var målt 3,5 km unna.
 */
describe('skogavstandKm', () => {
  const rute = { lat: 59.84, lng: 10.71 };

  it('er null når skogen er målt i midtpunktet, eller ikke finnes', () => {
    expect(skogavstandKm(rute, { kilde: 'senter', punkt: rute })).toBeNull();
    expect(skogavstandKm(rute, { kilde: null, punkt: null })).toBeNull();
  });

  it('gir avstanden til kvadrantsenteret — aldri 0 — når skogen kom derfra', () => {
    const [, nordvest] = skogprovepunkter(rute, 0.06);
    const km = skogavstandKm(rute, { kilde: 'forskjovet', punkt: nordvest });
    // 0,015° nord og 0,015° vest på 59,84° N ≈ 1,9 km.
    expect(km).toBeGreaterThan(1.8);
    expect(km).toBeLessThan(2);
  });

  const GRANSKOG = {
    forestType: 'gran',
    productivity: 20,
    volumePerHa: 300,
    habitatScore: null,
    habitatReasons: [],
    source: 'sr16'
  };
  const VAER = { temperatureC: 12, humidityPct: 85, rain3dMm: 8 };

  it('sier ikke «Skog her» om skog fra et kvadrantsenter i et levende rutenett', async () => {
    // 35 km radius i 7×7 ruter på ~60° N: ~0,09° × 0,18° per rute. Midtpunktet
    // ligger i et vann; skogen står i nordvest-kvadranten, ~3,5 km fra nåla.
    const steg = { lat: 0.09, lng: 0.18 };
    const [, nordvest] = skogprovepunkter(rute, steg.lat, steg.lng);
    const { oppslag } = skogkart([nordvest]);
    const { prover } = await provSkogIRuter([rute], steg, oppslag, { samtidighet: 5 });
    expect(prover[0].kilde).toBe('forskjovet');

    const linjer = buildExplanation({
      weather: VAER,
      month: 9,
      forest: { ...GRANSKOG, distanceKm: skogavstandKm(rute, prover[0]) }
    });
    const skoglinje = linjer.find((l) => l.category === 'habitat' && l.text.includes('bonitet'));
    expect(skoglinje?.text).not.toContain('Skog her');
    expect(skoglinje?.text).toBe('Nærmeste skogdata (NIBIO, 3,5 km unna): granskog, bonitet 20');
  });

  it('beholder «Skog her» når skogen er målt under nåla', async () => {
    const { oppslag } = skogkart([rute]);
    const { prover } = await provSkogIRuter([rute], { lat: 0.09, lng: 0.18 }, oppslag, { samtidighet: 5 });
    const linjer = buildExplanation({
      weather: VAER,
      month: 9,
      forest: { ...GRANSKOG, distanceKm: skogavstandKm(rute, prover[0]) }
    });
    const skoglinje = linjer.find((l) => l.category === 'habitat' && l.text.includes('bonitet'));
    expect(skoglinje?.text).toBe('Skog her (NIBIO): granskog, bonitet 20');
  });
});

describe('skogproveFrist', () => {
  it('holder av tid til midtpunktene og skrivingen i regionene som gjenstår', () => {
    const frist = skogproveFrist({
      startetMs: 1_000_000,
      maxDurationMs: 300_000,
      gjenstaendeRuter: 200,
      msPerRute: 329,
      gjenstaendeRegioner: 5
    });
    expect(frist).toBe(1_000_000 + 300_000 - SKOGPROVE_SIKKERHETSMARGIN_MS - 200 * 329 - 6 * SKOGPROVE_MS_PER_REGION);
  });

  it('går tidligere jo tregere oppslagene er målt i kjøringen', () => {
    const felles = { startetMs: 0, maxDurationMs: 300_000, gjenstaendeRuter: 100, gjenstaendeRegioner: 3 };
    expect(skogproveFrist({ ...felles, msPerRute: 600 })).toBeLessThan(skogproveFrist({ ...felles, msPerRute: 30 }));
  });

  it('behandler en ugyldig måling som null, ikke som NaN', () => {
    const frist = skogproveFrist({
      startetMs: 0,
      maxDurationMs: 300_000,
      gjenstaendeRuter: 10,
      msPerRute: Number.NaN,
      gjenstaendeRegioner: 0
    });
    expect(Number.isFinite(frist)).toBe(true);
  });
});
