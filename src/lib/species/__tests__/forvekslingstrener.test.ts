import { describe, expect, it } from 'vitest';
import {
  FORVEKSLINGSTRENER_NOKKEL,
  RUNDE_STORRELSE,
  TRENER_FAREGRADER,
  TRENER_SELECT,
  antallKlarte,
  byggRunde,
  byggTrenerpar,
  harForvekslingsprosa,
  registrerSvar,
  serialiserTrenerfremdrift,
  tolkTrenerfremdrift,
  type ForvekslingsArtRad,
  type ForvekslingsRad,
  type Tilfeldig,
  type TrenerPar
} from '../forvekslingstrener';
import { isProtectedPath } from '@/lib/supabase/middleware';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Treneren er den ene flaten i appen som deler ut «riktig» og «feil» om giftige
 * sopper. Testene under holder på det som gjør at den likevel er forsvarlig:
 *
 *  · bare par der dataene faktisk finnes (bilde MED kreditering på begge
 *    sider, og teksten om hvordan de skilles) — aldri et bilde å gjette på
 *  · «den giftige» er entydig etter katalogens egne klasser
 *  · plasseringen på skjermen røper aldri svaret
 *  · norsk prosa når aldri en svensk leser
 *
 * Artene og id-ene er de ekte fra katalogen (lest 2026-11-16), så formen på
 * dataene er den treneren møter i produksjon. Fotografnavnene er oppdiktet.
 */

function art(
  id: number,
  norsk: string,
  svensk: string,
  latin: string,
  spiselighet: string,
  overstyr: Partial<ForvekslingsArtRad> = {}
): ForvekslingsArtRad {
  return {
    id,
    norwegian_name: norsk,
    swedish_name: svensk,
    latin_name: latin,
    edibility: spiselighet,
    primary_image_url: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/a${id}/Art_${id}.jpg/330px-Art_${id}.jpg`,
    primary_image_photographer: `Testfotograf ${id}`,
    primary_image_license: 'CC BY-SA 3.0',
    primary_image_source_url: `https://commons.wikimedia.org/wiki/File:Art_${id}.jpg`,
    ...overstyr
  };
}

const sjampinjong = art(10, 'Sjampinjong', 'Ängschampinjon', 'Agaricus campestris', 'edible');
const hvitFluesopp = art(16, 'Hvit fluesopp', 'Vit flugsvamp', 'Amanita virosa', 'deadly');
const traktkantarell = art(3, 'Traktkantarell', 'Trattkantarell', 'Craterellus tubaeformis', 'edible');
const giftslorsopp = art(17, 'Spiss giftslørsopp', 'Toppig giftspindling', 'Cortinarius rubellus', 'deadly');
const granmatriske = art(32, 'Granmatriske', 'Granblodriska', 'Lactarius deterrimus', 'edible');
const pluggsopp = art(18, 'Pluggsopp', 'Pluggskivling', 'Paxillus involutus', 'toxic');
const honningsopp = art(11, 'Honningsopp', 'Honungsskivling', 'Armillaria mellea', 'inedible');
const svovelsopp = art(24, 'Svovelsopp', 'Svavelgul slöjskivling', 'Hypholoma fasciculare', 'toxic');
const kantarell = art(1, 'Kantarell', 'Kantarell', 'Cantharellus cibarius', 'edible');
const falskKantarell = art(22, 'Falsk kantarell', 'Narrkantarell', 'Hygrophoropsis aurantiaca', 'inedible');
const rodFluesopp = art(15, 'Rød fluesopp', 'Röd flugsvamp', 'Amanita muscaria', 'toxic');
const panterfluesopp = art(53, 'Panterfluesopp', 'Panterflugsvamp', 'Amanita pantherina', 'toxic');

function rad(
  fra: ForvekslingsArtRad,
  til: ForvekslingsArtRad,
  faregrad: string,
  overstyr: Partial<ForvekslingsRad> = {}
): ForvekslingsRad {
  return {
    species_id: fra.id,
    look_alike_id: til.id,
    danger_level: faregrad,
    similarity_description: `${fra.norwegian_name} og ${til.norwegian_name} står i samme skog til samme tid.`,
    difference_description: `Se på skivene og stilken: ${til.norwegian_name} skiller seg fra ${fra.norwegian_name}. Ved tvil — la den stå.`,
    art: fra,
    forveksling: til,
    ...overstyr
  };
}

/** Liten, deterministisk PRNG (mulberry32) — samme frø gir samme runde. */
function frø(seed: number): Tilfeldig {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gir verdiene i rekkefølge, og 0 når lista er brukt opp. */
function fast(...verdier: number[]): Tilfeldig {
  let i = 0;
  return () => verdier[i++] ?? 0;
}

function par(antall: number): TrenerPar[] {
  const rader = Array.from({ length: antall }, (_, i) =>
    rad(
      art(100 + i, `Matsopp ${i}`, `Matsvamp ${i}`, `Edulis ${i}`, 'edible'),
      art(200 + i, `Giftsopp ${i}`, `Giftsvamp ${i}`, `Toxicus ${i}`, 'toxic'),
      'high'
    )
  );
  return byggTrenerpar(rader, 'nb');
}

describe('byggTrenerpar — hvilke par treneren viser', () => {
  it('gjør en alvorlig forvekslingsrad om til et par med den giftige pekt ut', () => {
    const [p, ...resten] = byggTrenerpar([rad(sjampinjong, hvitFluesopp, 'critical')], 'nb');
    expect(resten).toEqual([]);
    expect(p.nokkel).toBe('10-16');
    expect(p.faregrad).toBe('critical');
    expect(p.giftig).toMatchObject({ id: 16, navn: 'Hvit fluesopp', spiselighet: 'deadly' });
    expect(p.annen).toMatchObject({ id: 10, navn: 'Sjampinjong', spiselighet: 'edible' });
    expect(p.giftig.latinskNavn).toBe('Amanita virosa');
    expect(p.slikSkillerDu).toContain('Se på skivene og stilken');
    expect(p.hvorforForveksles).toContain('samme skog');
    // Artssiden der forvekslingskortet for paret står: radens species_id.
    expect(p.tekstside).toEqual({ id: 10, navn: 'Sjampinjong' });
  });

  it('tar bare faregrad high og critical — aldri medium, low eller ukjent', () => {
    const rader = [
      rad(sjampinjong, hvitFluesopp, 'medium'),
      rad(traktkantarell, giftslorsopp, 'low'),
      rad(granmatriske, pluggsopp, 'ukjent'),
      rad(honningsopp, svovelsopp, 'high', { danger_level: null })
    ];
    expect(byggTrenerpar(rader, 'nb')).toEqual([]);
    expect([...TRENER_FAREGRADER]).toEqual(['high', 'critical']);
  });

  it('bruker aldri et par der en av artene mangler bilde', () => {
    for (const bilde of [null, undefined, '', '   ']) {
      const utenBilde = { ...hvitFluesopp, primary_image_url: bilde };
      expect(byggTrenerpar([rad(sjampinjong, utenBilde, 'critical')], 'nb'), String(bilde)).toEqual([]);
      expect(byggTrenerpar([rad(utenBilde, sjampinjong, 'critical')], 'nb'), String(bilde)).toEqual([]);
    }
  });

  it('bruker aldri et bilde som ikke er en http(s)-adresse', () => {
    for (const bilde of ['javascript:alert(1)', 'data:image/png;base64,AAAA', '/lokal/fil.jpg']) {
      const rar = { ...hvitFluesopp, primary_image_url: bilde };
      expect(byggTrenerpar([rad(sjampinjong, rar, 'critical')], 'nb'), bilde).toEqual([]);
    }
  });

  it('bruker aldri et bilde uten kreditering som kan vises', () => {
    // Seedingen skrev license = 'Wikimedia Commons' — en kilde, ikke en lisens.
    // <PhotoCredit> er taus for slike rader, så bildet ville stått uten linje.
    const utenKreditering: Array<Partial<ForvekslingsArtRad>> = [
      { primary_image_photographer: null, primary_image_license: null },
      { primary_image_photographer: null, primary_image_license: 'Wikimedia Commons' },
      { primary_image_photographer: '  ', primary_image_license: 'ukjent' }
    ];
    for (const felter of utenKreditering) {
      const giftig = { ...hvitFluesopp, ...felter };
      const matsopp = { ...sjampinjong, ...felter };
      expect(byggTrenerpar([rad(sjampinjong, giftig, 'critical')], 'nb')).toEqual([]);
      expect(byggTrenerpar([rad(matsopp, hvitFluesopp, 'critical')], 'nb')).toEqual([]);
    }
  });

  it('godtar lisens uten fotograf — Commons mangler forfatter på noen filer', () => {
    // Samme regel som resten av appen: «Foto: ukjent fotograf (CC BY-SA 3.0)»
    // med lenke til filsiden er en kreditering som kan vises.
    const utenFotograf = { ...sjampinjong, primary_image_photographer: null };
    const [p] = byggTrenerpar([rad(utenFotograf, hvitFluesopp, 'critical')], 'nb');
    expect(p.annen.bildeKreditering).toEqual({
      photographer: null,
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Art_10.jpg'
    });
  });

  it('tar med krediteringen for akkurat det bildet som vises', () => {
    const [p] = byggTrenerpar([rad(sjampinjong, hvitFluesopp, 'critical')], 'nb');
    expect(p.giftig.bildeUrl).toBe(hvitFluesopp.primary_image_url);
    expect(p.giftig.bildeKreditering).toEqual({
      photographer: 'Testfotograf 16',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Art_16.jpg'
    });
  });

  it('bruker aldri et par uten tekst om hvordan artene skilles', () => {
    for (const skille of [null, undefined, '', '  \n ']) {
      const uten = rad(sjampinjong, hvitFluesopp, 'critical', { difference_description: skille });
      expect(byggTrenerpar([uten], 'nb'), String(skille)).toEqual([]);
      // Regelen gjelder paret, ikke språket: svensk viser ikke teksten, men
      // treneren skal ikke ha par der artssiden heller ikke har noe å si.
      expect(byggTrenerpar([uten], 'sv'), String(skille)).toEqual([]);
    }
  });

  it('klarer seg uten likhetsteksten — den er et tillegg, ikke et krav', () => {
    const [p] = byggTrenerpar(
      [rad(sjampinjong, hvitFluesopp, 'critical', { similarity_description: null })],
      'nb'
    );
    expect(p.hvorforForveksles).toBeNull();
    expect(p.slikSkillerDu).toBeTruthy();
  });

  it('bruker aldri en tekst som frikjenner et funn', () => {
    // En felttest kan dømme et funn ute. Den kan aldri frikjenne det.
    const frikjennende = [
      'Er skivene rosa, er du trygg.',
      'Har den ring og rosa skiver, kan du trygt spise den.',
      'Knekker stilken som kritt, så er den trygg.'
    ];
    for (const setning of frikjennende) {
      const iSkille = rad(sjampinjong, hvitFluesopp, 'critical', { difference_description: setning });
      const iLikhet = rad(sjampinjong, hvitFluesopp, 'critical', { similarity_description: setning });
      expect(byggTrenerpar([iSkille], 'nb'), setning).toEqual([]);
      expect(byggTrenerpar([iLikhet], 'nb'), setning).toEqual([]);
    }
  });

  it('krever at nøyaktig én av de to er giftig etter katalogens klasser', () => {
    // Kantarell ↔ falsk kantarell står som 'high' i basen, men falsk kantarell
    // er «ikke matsopp», ikke giftig. Da finnes det ingen «den giftige».
    expect(byggTrenerpar([rad(kantarell, falskKantarell, 'high')], 'nb')).toEqual([]);
    // To giftige: spørsmålet har to riktige svar.
    expect(byggTrenerpar([rad(rodFluesopp, panterfluesopp, 'high')], 'nb')).toEqual([]);
    // Ukjent eller manglende klasse: vi vet ikke, og gjetter ikke.
    for (const klasse of ['unknown', null, '', 'spiselig']) {
      const ukjent = { ...sjampinjong, edibility: klasse };
      expect(byggTrenerpar([rad(ukjent, hvitFluesopp, 'critical')], 'nb'), String(klasse)).toEqual([]);
    }
  });

  it('finner den giftige etter klasse, ikke etter hvilken vei raden er ført inn', () => {
    // «Hvit fluesopp → Sjampinjong» finnes i basen: her er forvekslingsarten matsoppen.
    const [p] = byggTrenerpar([rad(hvitFluesopp, sjampinjong, 'critical')], 'nb');
    expect(p.giftig.id).toBe(16);
    expect(p.annen.id).toBe(10);
    expect(p.tekstside).toEqual({ id: 16, navn: 'Hvit fluesopp' });
  });

  it('en art som ikke er matsopp kan stå mot en giftig — men kalles aldri noe annet enn klassen sin', () => {
    const [p] = byggTrenerpar([rad(honningsopp, svovelsopp, 'high')], 'nb');
    expect(p.giftig.navn).toBe('Svovelsopp');
    expect(p.annen).toMatchObject({ navn: 'Honningsopp', spiselighet: 'inedible' });
  });

  it('slår sammen A→B og B→A til ett par', () => {
    const fram = rad(sjampinjong, hvitFluesopp, 'critical', {
      difference_description: 'Fra matsoppens side: se etter rosa skiver. Hvis skivene er hvite — ikke spis.'
    });
    const tilbake = rad(hvitFluesopp, sjampinjong, 'critical', {
      difference_description: 'Fra giftsoppens side: hvite skiver og knoll. Ved tvil — la den stå.'
    });
    for (const rader of [
      [fram, tilbake],
      [tilbake, fram]
    ]) {
      const ut = byggTrenerpar(rader, 'nb');
      expect(ut).toHaveLength(1);
      expect(ut[0].nokkel).toBe('10-16');
      // Teksten som er skrevet for den som står med matsoppen i hånda, vinner.
      expect(ut[0].slikSkillerDu).toContain('Fra matsoppens side');
      expect(ut[0].tekstside.id).toBe(10);
    }
  });

  it('beholder den strengeste faregraden når de to retningene er uenige', () => {
    const fram = rad(sjampinjong, hvitFluesopp, 'high');
    const tilbake = rad(hvitFluesopp, sjampinjong, 'critical');
    for (const rader of [
      [fram, tilbake],
      [tilbake, fram]
    ]) {
      const [p] = byggTrenerpar(rader, 'nb');
      expect(p.faregrad).toBe('critical');
      expect(p.tekstside.id).toBe(10);
    }
  });

  it('samme art kan stå i flere par', () => {
    const skogsjampinjong = art(41, 'Skogsjampinjong', 'Skogschampinjon', 'Agaricus silvaticus', 'edible');
    const ut = byggTrenerpar(
      [rad(sjampinjong, hvitFluesopp, 'critical'), rad(skogsjampinjong, hvitFluesopp, 'critical')],
      'nb'
    );
    expect(ut.map((p) => p.nokkel)).toEqual(['10-16', '16-41']);
  });

  it('gir samme liste uansett hvilken rekkefølge radene kom i — kritiske først', () => {
    const rader = [
      rad(granmatriske, pluggsopp, 'high'),
      rad(traktkantarell, giftslorsopp, 'critical'),
      rad(honningsopp, svovelsopp, 'high'),
      rad(sjampinjong, hvitFluesopp, 'critical')
    ];
    const forventet = ['10-16', '3-17', '18-32', '11-24'];
    expect(byggTrenerpar(rader, 'nb').map((p) => p.nokkel)).toEqual(forventet);
    expect(byggTrenerpar([...rader].reverse(), 'nb').map((p) => p.nokkel)).toEqual(forventet);
  });

  it('godtar at PostgREST leverer relasjonen som array', () => {
    const somArray: ForvekslingsRad = {
      ...rad(sjampinjong, hvitFluesopp, 'critical'),
      art: [sjampinjong],
      forveksling: [hvitFluesopp]
    };
    expect(byggTrenerpar([somArray], 'nb')).toHaveLength(1);
  });

  it('hopper over rader med manglende eller ødelagt join', () => {
    const rader: ForvekslingsRad[] = [
      { ...rad(sjampinjong, hvitFluesopp, 'critical'), forveksling: null },
      { ...rad(sjampinjong, hvitFluesopp, 'critical'), art: [] },
      { ...rad(sjampinjong, hvitFluesopp, 'critical'), art: { ...sjampinjong, id: null } },
      { ...rad(sjampinjong, hvitFluesopp, 'critical'), art: { ...sjampinjong, norwegian_name: '', swedish_name: '' } },
      // En art kan ikke forveksles med seg selv (basen har en CHECK, men vi stoler ikke på den her).
      rad(hvitFluesopp, hvitFluesopp, 'critical')
    ];
    expect(byggTrenerpar(rader, 'nb')).toEqual([]);
  });

  it('tom inndata gir tom liste — ikke en feil', () => {
    expect(byggTrenerpar([], 'nb')).toEqual([]);
    expect(byggTrenerpar(null, 'nb')).toEqual([]);
    expect(byggTrenerpar(undefined, 'sv')).toEqual([]);
  });
});

describe('byggTrenerpar — svensk', () => {
  const rader = [rad(sjampinjong, hvitFluesopp, 'critical'), rad(granmatriske, pluggsopp, 'high')];

  it('viser svenske artsnavn fra swedish_name', () => {
    const ut = byggTrenerpar(rader, 'sv');
    expect(ut[0].giftig.navn).toBe('Vit flugsvamp');
    expect(ut[0].annen.navn).toBe('Ängschampinjon');
    expect(ut[0].tekstside).toEqual({ id: 10, navn: 'Ängschampinjon' });
    expect(ut[1].giftig.navn).toBe('Pluggskivling');
  });

  it('sender ALDRI den norske prosaen ut til en svensk leser', () => {
    const ut = byggTrenerpar(rader, 'sv');
    expect(ut).toHaveLength(2);
    for (const p of ut) {
      expect(p.slikSkillerDu).toBeNull();
      expect(p.hvorforForveksles).toBeNull();
    }
    // Ingenting av den norske teksten finnes i det som sendes til klienten.
    const serialisert = JSON.stringify(ut);
    expect(serialisert).not.toContain('Se på skivene');
    expect(serialisert).not.toContain('samme skog');
    expect(serialisert).not.toContain('la den stå');
  });

  it('har de samme parene på svensk som på norsk', () => {
    expect(byggTrenerpar(rader, 'sv').map((p) => p.nokkel)).toEqual(
      byggTrenerpar(rader, 'nb').map((p) => p.nokkel)
    );
  });

  it('prosaen finnes bare på norsk — et ukjent språk får den heller ikke', () => {
    expect(harForvekslingsprosa('nb')).toBe(true);
    expect(harForvekslingsprosa('sv')).toBe(false);
    expect(harForvekslingsprosa('en')).toBe(false);
    expect(byggTrenerpar(rader, 'en')[0].slikSkillerDu).toBeNull();
  });

  it('faller tilbake på det norske navnet når swedish_name mangler', () => {
    const utenSvensk = { ...hvitFluesopp, swedish_name: null };
    const [p] = byggTrenerpar([rad(sjampinjong, utenSvensk, 'critical')], 'sv');
    expect(p.giftig.navn).toBe('Hvit fluesopp');
  });
});

describe('spørringen', () => {
  it('henter begge artene, hver gjennom sin egen fremmednøkkel', () => {
    expect(TRENER_SELECT).toContain('art:mushroom_species!look_alikes_species_id_fkey(');
    expect(TRENER_SELECT).toContain('forveksling:mushroom_species!look_alikes_look_alike_id_fkey(');
  });

  it('ber om krediteringen sammen med bildet, og om det svenske navnet', () => {
    for (const felt of [
      'swedish_name',
      'primary_image_url',
      'primary_image_photographer',
      'primary_image_license',
      'primary_image_source_url'
    ]) {
      // To ganger: én gang per side av paret.
      expect(TRENER_SELECT.split(felt).length - 1, felt).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('byggRunde', () => {
  it('tom liste gir tom runde', () => {
    expect(byggRunde([], { tilfeldig: frø(1) })).toEqual([]);
  });

  it('trekker hvilken side den giftige står på', () => {
    const [ett] = par(1);
    const venstre = byggRunde([ett], { tilfeldig: fast(0.1) })[0];
    expect(venstre.giftigSide).toBe('venstre');
    expect(venstre.venstre).toBe(ett.giftig);
    expect(venstre.hoyre).toBe(ett.annen);

    const hoyre = byggRunde([ett], { tilfeldig: fast(0.9) })[0];
    expect(hoyre.giftigSide).toBe('hoyre');
    expect(hoyre.venstre).toBe(ett.annen);
    expect(hoyre.hoyre).toBe(ett.giftig);
  });

  it('den giftige havner på begge sider over mange runder — plasseringen røper ingenting', () => {
    const alle = par(6);
    const sider = { venstre: 0, hoyre: 0 };
    for (let seed = 1; seed <= 200; seed++) {
      for (const oppgave of byggRunde(alle, { tilfeldig: frø(seed) })) sider[oppgave.giftigSide]++;
    }
    const totalt = sider.venstre + sider.hoyre;
    expect(totalt).toBe(1200);
    expect(sider.venstre / totalt).toBeGreaterThan(0.4);
    expect(sider.venstre / totalt).toBeLessThan(0.6);
  });

  it('hver oppgave viser nøyaktig de to artene i paret, og siden stemmer med den giftige', () => {
    for (const oppgave of byggRunde(par(6), { tilfeldig: frø(7) })) {
      const ider = [oppgave.venstre.id, oppgave.hoyre.id].sort();
      expect(ider).toEqual([oppgave.par.giftig.id, oppgave.par.annen.id].sort());
      expect(oppgave[oppgave.giftigSide]).toBe(oppgave.par.giftig);
    }
  });

  it('har aldri flere par enn rundestørrelsen, og aldri samme par to ganger', () => {
    const runde = byggRunde(par(20), { tilfeldig: frø(3) });
    expect(runde).toHaveLength(RUNDE_STORRELSE);
    expect(new Set(runde.map((o) => o.par.nokkel)).size).toBe(RUNDE_STORRELSE);

    expect(byggRunde(par(20), { tilfeldig: frø(3), antall: 4 })).toHaveLength(4);
    expect(byggRunde(par(20), { tilfeldig: frø(3), antall: 0 })).toEqual([]);
    expect(byggRunde(par(20), { tilfeldig: frø(3), antall: -2 })).toEqual([]);
    expect(byggRunde(par(20), { tilfeldig: frø(3), antall: Number.NaN })).toHaveLength(RUNDE_STORRELSE);
  });

  it('bruker alle parene når treneren har færre enn en full runde', () => {
    const tre = par(3);
    const runde = byggRunde(tre, { tilfeldig: frø(5) });
    expect(runde.map((o) => o.par.nokkel).sort()).toEqual(tre.map((p) => p.nokkel).sort());
  });

  it('samme frø gir samme runde, ulike frø stokker ulikt', () => {
    const alle = par(12);
    const nokler = (seed: number) =>
      byggRunde(alle, { tilfeldig: frø(seed) }).map((o) => `${o.par.nokkel}:${o.giftigSide}`);
    expect(nokler(42)).toEqual(nokler(42));
    const ulike = new Set(Array.from({ length: 20 }, (_, i) => nokler(i + 1).join('|')));
    expect(ulike.size).toBeGreaterThan(15);
  });

  it('viser par brukeren ikke har klart ennå før repetisjonen', () => {
    const alle = par(10);
    const klarte = alle.slice(0, 7).map((p) => p.nokkel);
    const uklarte = new Set(alle.slice(7).map((p) => p.nokkel));
    for (let seed = 1; seed <= 25; seed++) {
      const runde = byggRunde(alle, { tilfeldig: frø(seed), klarte });
      expect(runde).toHaveLength(RUNDE_STORRELSE);
      // De tre uklarte kommer først, så fylles det på med repetisjon.
      expect(new Set(runde.slice(0, 3).map((o) => o.par.nokkel))).toEqual(uklarte);
      for (const oppgave of runde.slice(3)) expect(klarte).toContain(oppgave.par.nokkel);
    }
  });

  it('er alt klart, blir runden ren repetisjon — ikke tom', () => {
    const alle = par(8);
    const runde = byggRunde(alle, { tilfeldig: frø(9), klarte: alle.map((p) => p.nokkel) });
    expect(runde).toHaveLength(RUNDE_STORRELSE);
  });

  it('endrer ikke lista den får inn', () => {
    const alle = par(8);
    const før = alle.map((p) => p.nokkel);
    byggRunde(alle, { tilfeldig: frø(11) });
    expect(alle.map((p) => p.nokkel)).toEqual(før);
  });

  it('tåler en tilfeldighetskilde som oppfører seg dårlig', () => {
    const alle = par(6);
    for (const dårlig of [() => 1, () => 5, () => -1, () => Number.NaN, () => Number.POSITIVE_INFINITY]) {
      const runde = byggRunde(alle, { tilfeldig: dårlig });
      expect(runde).toHaveLength(6);
      expect(new Set(runde.map((o) => o.par.nokkel)).size).toBe(6);
      for (const oppgave of runde) expect(oppgave.venstre && oppgave.hoyre).toBeTruthy();
    }
  });
});

describe('fremdriften', () => {
  it('tolker det den selv skrev', () => {
    const fremdrift = { klarte: ['10-16', '3-17'] };
    expect(tolkTrenerfremdrift(serialiserTrenerfremdrift(fremdrift))).toEqual(fremdrift);
  });

  it('gir tom fremdrift for alt som ikke er akkurat riktig', () => {
    for (const raa of [null, undefined, '', 'ikke json', '42', 'null', '[]', '{}', '{"klarte":"10-16"}', '{"klarte":{}}']) {
      expect(tolkTrenerfremdrift(raa), String(raa)).toEqual({ klarte: [] });
    }
  });

  it('kaster nøkler som ikke har riktig form, og dubletter', () => {
    const raa = JSON.stringify({
      klarte: ['10-16', '10-16', 16, null, 'a-b', '10', '10-16-3', '<script>', ' 3-17', '3-17']
    });
    expect(tolkTrenerfremdrift(raa)).toEqual({ klarte: ['10-16', '3-17'] });
  });

  it('lar ikke en ødelagt verdi vokse fritt', () => {
    const mange = Array.from({ length: 5000 }, (_, i) => `${i}-${i + 1}`);
    expect(tolkTrenerfremdrift(JSON.stringify({ klarte: mange })).klarte.length).toBeLessThanOrEqual(500);
  });

  it('riktig svar fører paret inn, uten dubletter', () => {
    const etter = registrerSvar({ klarte: ['10-16'] }, '3-17', true);
    expect(etter.klarte).toEqual(['10-16', '3-17']);
    expect(registrerSvar(etter, '3-17', true).klarte).toEqual(['10-16', '3-17']);
  });

  it('feil svar tar paret ut igjen — fremdriften skal ikke telle flaks', () => {
    expect(registrerSvar({ klarte: ['10-16', '3-17'] }, '10-16', false).klarte).toEqual(['3-17']);
    expect(registrerSvar({ klarte: [] }, '10-16', false).klarte).toEqual([]);
  });

  it('endrer ikke fremdriften den får inn', () => {
    const før = { klarte: ['10-16'] };
    registrerSvar(før, '3-17', true);
    registrerSvar(før, '10-16', false);
    expect(før).toEqual({ klarte: ['10-16'] });
  });

  it('teller bare par som fortsatt er i treneren', () => {
    const alle = byggTrenerpar(
      [rad(sjampinjong, hvitFluesopp, 'critical'), rad(granmatriske, pluggsopp, 'high')],
      'nb'
    );
    expect(antallKlarte(alle, { klarte: ['10-16', '999-1000', '18-32'] })).toBe(2);
    expect(antallKlarte(alle, { klarte: ['999-1000'] })).toBe(0);
    expect(antallKlarte([], { klarte: ['10-16'] })).toBe(0);
  });
});

describe('treneren utenfor denne fila', () => {
  it('ligger på en rute som er åpen uten innlogging', () => {
    expect(isProtectedPath('/species/forvekslinger')).toBe(false);
  });

  it('fremdriften i lokal lagring er nevnt i personvernerklæringen på begge språk', () => {
    // §8 skal si hva som lagres på enheten. Nøkkelen under er den eneste
    // treneren skriver — endres den, eller fjernes omtalen, skal dette feile.
    expect(FORVEKSLINGSTRENER_NOKKEL).toBe('mycelet:forvekslingstrener-v1');
    expect(nb.Personvern.cookiesLocalStorage).toMatch(/forvekslingstreneren/);
    expect(sv.Personvern.cookiesLocalStorage).toMatch(/förväxlingsövningen/);
  });
});
