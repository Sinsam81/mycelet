import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sonerute042, sonerute075 } from '../sonerute';

/**
 * Sone-ruta — utregningen i migrasjon 075, og regnestykkene delingsendring.ts
 * bygger reglene sine på.
 *
 * Et sone-funn («hemmeligsted-vennlig») skal bare vise hvilken rute funnet
 * ligger i. Fram til 075 regnet triggeren lengdesteget av funnets EKSAKTE
 * breddegrad, og da kan breddegraden regnes rett ut av det kartet gir til alle.
 * Testen spiller angrepet gjennom mot begge utregningene.
 *
 * SQL kan ikke kjøres her (det finnes ingen Postgres i testmiljøet, og bare én
 * database — produksjon). Derfor to ting i stedet:
 *  1. Modellene under er utregningene skrevet av linje for linje, og testen
 *     krever at de samme linjene STÅR i migrasjonsfila. Endres SQL-en uten at
 *     modellen følger med, feiler den.
 *  2. Fila leses som tekst og holdes opp mot det som gjør den trygg å lime
 *     inn: vakten fra 042 står, triggeren kan ikke bli stående avslått, og
 *     hovedboka leter etter et spor som faktisk finnes.
 */

const FIL = '075_sonerute_uten_breddegradslekkasje.sql';
const raa = readFileSync(join(process.cwd(), 'supabase', 'migrations', FIL), 'utf8');

/** Bare det som kjøres: uten kommentarer, med ett mellomrom mellom ordene. */
const sql = raa
  .split('\n')
  .map((linje) => linje.replace(/--.*$/, ''))
  .join('\n')
  .replace(/\s+/g, ' ')
  .trim();

const rad = (grader: number) => (grader * Math.PI) / 180;
const grader = (r: number) => (r * 180) / Math.PI;

/**
 * Modellene bor i src/lib/findings/sonerute.ts, der sonevakta i POST
 * /api/findings bruker 075-utregningen. Testen under holder den opp mot SQL-en.
 */
const stempel042 = sonerute042;
const stempel075 = sonerute075;

const MODELLENS_LINJER = [
  'step_lat := GREATEST(precision_km, 1) / 111.32;',
  'zone_lat := round(lat / step_lat) * step_lat;',
  'step_lng := GREATEST(precision_km, 1) / (111.32 * GREATEST(cos(radians(zone_lat)), 0.2));',
  'zone_lng := round(lng / step_lng) * step_lng;'
];

/**
 * Det en fremmed kan gjøre med én rad fra public_findings: display_lat,
 * display_lng og zone_precision_km. Finn heltallet k, og løs for breddegraden.
 */
function gjettBreddegrad(vist: { lat: number; lng: number }, km: number): number {
  const k = Math.round((vist.lng * 111.32 * Math.cos(rad(vist.lat))) / km);
  return grader(Math.acos(Math.min(1, (k * km) / (111.32 * vist.lng))));
}

/** Fast frø: testen skal gi samme tall hver gang, på hver maskin. */
function tilfeldig(fro: number): () => number {
  let tilstand = fro >>> 0;
  return () => {
    tilstand = (Math.imul(tilstand, 1664525) + 1013904223) >>> 0;
    return tilstand / 2 ** 32;
  };
}

/** Et punkt i Norge eller Sverige, og en størrelse fra glidebryteren (1–15 km). */
function nordiskPunkt(neste: () => number) {
  return { lat: 55 + neste() * 16.2, lng: 4.5 + neste() * 26.5, km: 1 + Math.floor(neste() * 15) };
}

const ANTALL = 20_000;
const METER_PER_GRAD = 111_320;

describe('sone-ruta før migrasjon 075 — én rad røpet breddegraden', () => {
  it('gir den eksakte breddegraden tilbake for hvert eneste punkt', () => {
    const neste = tilfeldig(12345);
    let verste = 0;
    for (let i = 0; i < ANTALL; i += 1) {
      const { lat, lng, km } = nordiskPunkt(neste);
      const feilMeter = Math.abs(gjettBreddegrad(stempel042(lat, lng, km), km) - lat) * METER_PER_GRAD;
      verste = Math.max(verste, feilMeter);
    }
    // Under en millimeter — i praksis avrundingsstøy i flyttallene.
    expect(verste).toBeLessThan(0.001);
  });

  /** Eksempelet fra gjennomgangen som fant hullet: et funn nord i Oslo, 5 km-rute. */
  it('finner 59,98765° N av et punkt som så ut til å ligge på 60,00719° N', () => {
    const vist = stempel042(59.98765, 10.71234, 5);
    expect(vist.lat).toBeCloseTo(60.00718649, 6);
    expect(vist.lng).toBeCloseTo(10.68591375, 6);
    expect(gjettBreddegrad(vist, 5)).toBeCloseTo(59.98765, 8);
  });
});

describe('sone-ruta i migrasjon 075', () => {
  it('står i fila slik modellen her regner den', () => {
    for (const linje of MODELLENS_LINJER) expect(sql, linje).toContain(linje);
  });

  it('regner aldri lengdesteget av den ekte breddegraden', () => {
    // Verken i hjelpefunksjonen (lat) eller rett i triggeren (NEW.latitude).
    expect(sql).not.toMatch(/radians\(\s*lat\s*\)/i);
    expect(sql).not.toMatch(/radians\(\s*NEW\.latitude\s*\)/i);
    expect(sql.match(/radians\(/g) ?? []).toHaveLength(1);
  });

  it('gir angrepet bare rutas egen breddegrad — den som alt står på kartet', () => {
    const neste = tilfeldig(987654321);
    let sumAvstand = 0;
    let lengstFraRutepunktet = 0;
    for (let i = 0; i < ANTALL; i += 1) {
      const { lat, lng, km } = nordiskPunkt(neste);
      const vist = stempel075(lat, lng, km);
      const gjett = gjettBreddegrad(vist, km);
      lengstFraRutepunktet = Math.max(lengstFraRutepunktet, Math.abs(gjett - vist.lat) * METER_PER_GRAD);
      // Avstanden fra gjetningen til det ekte stedet, målt i rutestørrelser.
      sumAvstand += (Math.abs(gjett - lat) * 111.32) / km;
    }
    // Gjetningen ER rutepunktets breddegrad, for hvert eneste punkt …
    expect(lengstFraRutepunktet).toBeLessThan(0.001);
    // … og det ekte stedet ligger jevnt fordelt rundt den: en kvart rute unna
    // i snitt. Angrepet vet ingenting ruta ikke alt sa.
    expect(sumAvstand / ANTALL).toBeGreaterThan(0.24);
    expect(sumAvstand / ANTALL).toBeLessThan(0.26);
  });

  /**
   * Selve beviset. Stempelet er en funksjon av RUTA, ikke av punktet: flytt
   * funnet hvor som helst innenfor ruta, og det som vises er likt, bit for bit.
   * Da finnes det ingenting å regne seg tilbake fra.
   */
  it('stempler alle punkter i samme rute helt likt', () => {
    const neste = tilfeldig(424242);
    let ulike = 0;
    for (let i = 0; i < ANTALL; i += 1) {
      const { lat, lng, km } = nordiskPunkt(neste);
      const vist = stempel075(lat, lng, km);
      // Et annet sted i samme rute (like innenfor kantene).
      const annetLat = vist.lat + (neste() - 0.5) * vist.stegLat * 0.98;
      const annetLng = vist.lng + (neste() - 0.5) * vist.stegLng * 0.98;
      const annet = stempel075(annetLat, annetLng, km);
      // Bit for bit — ikke «nesten likt».
      if (annet.lat !== vist.lat || annet.lng !== vist.lng) ulike += 1;
    }
    expect(ulike).toBe(0);
  });

  it('gjorde ikke det før: samme rute, annen breddegrad, annet punkt på kartet', () => {
    const neste = tilfeldig(424242);
    let ulike = 0;
    for (let i = 0; i < 2_000; i += 1) {
      const { lat, lng, km } = nordiskPunkt(neste);
      const vist = stempel042(lat, lng, km);
      const annet = stempel042(vist.lat + (neste() - 0.5) * vist.stegLat * 0.98, lng, km);
      if (annet.lat === vist.lat && annet.lng !== vist.lng) ulike += 1;
    }
    expect(ulike).toBeGreaterThan(1_900);
  });

  it('holder funnet inne i ruta, og ruta er p × p kilometer', () => {
    const neste = tilfeldig(777);
    let utenfor = 0;
    let storsteAvvikKm = 0;
    for (let i = 0; i < ANTALL; i += 1) {
      const { lat, lng, km } = nordiskPunkt(neste);
      const vist = stempel075(lat, lng, km);
      if (Math.abs(lat - vist.lat) > vist.stegLat / 2 + 1e-12) utenfor += 1;
      if (Math.abs(lng - vist.lng) > vist.stegLng / 2 + 1e-12) utenfor += 1;
      // Høyden, og bredden målt på rutas egen breddegrad.
      storsteAvvikKm = Math.max(
        storsteAvvikKm,
        Math.abs(vist.stegLat * 111.32 - km),
        Math.abs(vist.stegLng * 111.32 * Math.cos(rad(vist.lat)) - km)
      );
    }
    expect(utenfor).toBe(0);
    expect(storsteAvvikKm).toBeLessThan(1e-9);
  });

  /** Derfor kan eksisterende sone-funn stemples på nytt uten at de «flytter nord–sør». */
  it('lar display_latitude stå og flytter display_longitude høyst én rutebredde', () => {
    const neste = tilfeldig(31337);
    let flyttetNordSor = 0;
    let storsteFlytt = 0;
    for (let i = 0; i < ANTALL; i += 1) {
      const { lat, lng } = nordiskPunkt(neste);
      // Alle størrelsene ruta godtar, ikke bare glidebryterens.
      const km = 1 + Math.floor(neste() * 50);
      const gammel = stempel042(lat, lng, km);
      const ny = stempel075(lat, lng, km);
      if (ny.lat !== gammel.lat) flyttetNordSor += 1;
      storsteFlytt = Math.max(storsteFlytt, Math.abs(ny.lng - gammel.lng) / ny.stegLng);
    }
    expect(flyttetNordSor).toBe(0);
    expect(storsteFlytt).toBeLessThanOrEqual(1 + 1e-9);
  });
});

/**
 * Hvorfor rutestørrelsen ikke kan endres etter at funnet er lagret
 * (delingsendring.ts, «SONERUTA» punkt 2). Den som har sett funnet i flere
 * størrelser, vet at stedet ligger i SNITTET av rutene.
 */
describe('flere rutestørrelser for samme funn — også med 075', () => {
  function snitt(lat: number, lng: number, storrelser: number[]) {
    let nord = Infinity;
    let sor = -Infinity;
    let ost = Infinity;
    let vest = -Infinity;
    for (const km of storrelser) {
      const vist = stempel075(lat, lng, km);
      sor = Math.max(sor, vist.lat - vist.stegLat / 2);
      nord = Math.min(nord, vist.lat + vist.stegLat / 2);
      vest = Math.max(vest, vist.lng - vist.stegLng / 2);
      ost = Math.min(ost, vist.lng + vist.stegLng / 2);
    }
    return { nordSorKm: (nord - sor) * 111.32, ostVestKm: (ost - vest) * 111.32 * Math.cos(rad(lat)) };
  }

  function maal(storrelser: number[], fro: number) {
    const neste = tilfeldig(fro);
    let minsteNordSor = Infinity;
    let under500 = 0;
    let under100 = 0;
    for (let i = 0; i < ANTALL; i += 1) {
      const { lat, lng } = nordiskPunkt(neste);
      const { nordSorKm, ostVestKm } = snitt(lat, lng, storrelser);
      minsteNordSor = Math.min(minsteNordSor, nordSorKm);
      if (ostVestKm < 0.5 - 1e-9) under500 += 1;
      if (ostVestKm < 0.1) under100 += 1;
    }
    return { minsteNordSor, under500: under500 / ANTALL, under100: under100 / ANTALL };
  }

  const GLIDEBRYTEREN = Array.from({ length: 15 }, (_, i) => i + 1);

  it('én størrelse røper nøyaktig én rute', () => {
    const { minsteNordSor, under500 } = maal([1], 1);
    expect(minsteNordSor).toBeCloseTo(1, 6);
    expect(under500).toBe(0);
  });

  /** Nord–sør deler alle størrelser kanter på hele og halve kilometer. */
  it('har en bunn nord–sør: aldri under 500 meter', () => {
    expect(maal(GLIDEBRYTEREN, 2).minsteNordSor).toBeGreaterThan(0.5 - 1e-6);
  });

  /**
   * Øst–vest følger steget rutas egen breddegrad, og den er forskjellig fra
   * størrelse til størrelse. Kantene treffer ikke hverandre, og snittet har
   * ingen bunn.
   */
  it('har ingen bunn øst–vest: alt to størrelser snevrer inn til under 500 meter for noen funn', () => {
    const to = maal([5, 3], 3);
    expect(to.under500).toBeGreaterThan(0.005);
    expect(to.under500).toBeLessThan(0.03);
  });

  it('og alle femten på glidebryteren gjør det for over halvparten — under 100 meter for 2–3 %', () => {
    const alle = maal(GLIDEBRYTEREN, 4);
    expect(alle.under500).toBeGreaterThan(0.5);
    expect(alle.under100).toBeGreaterThan(0.015);
    expect(alle.under100).toBeLessThan(0.04);
  });
});

describe('migrasjon 075 — trygg å lime inn', () => {
  const funksjon = (navn: string) => {
    const m = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${navn}\\(.*?\\$\\$ LANGUAGE plpgsql[^;]*;`));
    if (!m) throw new Error(`Fant ikke funksjonen ${navn} i ${FIL}`);
    return m[0];
  };
  const trigger = funksjon('set_display_location');
  const blokk = sql.match(/DO \$\$ BEGIN (.*?) END; \$\$;/)?.[1] ?? '';

  it('beholder vakten fra 042 — et omtrentlig funn får ikke nytt punkt av en vanlig oppdatering', () => {
    for (const kolonne of ['latitude', 'longitude', 'visibility', 'is_zone_finding', 'zone_precision_km']) {
      expect(trigger).toMatch(new RegExp(`NEW\\.${kolonne} IS NOT DISTINCT FROM OLD\\.${kolonne}\\b`));
    }
    expect(trigger).toContain('NEW.display_latitude := OLD.display_latitude;');
    expect(trigger).toContain('NEW.display_longitude := OLD.display_longitude;');
    // Vakten står FØR noe stemples.
    expect(trigger.indexOf('OLD.display_latitude')).toBeLessThan(trigger.indexOf("NEW.visibility = 'private'"));
  });

  it('stempler fortsatt privat som ingenting, omtrentlig som tilfeldig og offentlig som eksakt', () => {
    expect(trigger).toMatch(/IF NEW\.visibility = 'private' THEN NEW\.display_latitude := NULL; NEW\.display_longitude := NULL;/);
    expect(trigger).toContain('FROM randomize_location(NEW.latitude, NEW.longitude);');
    expect(trigger).toContain('NEW.display_latitude := NEW.latitude;');
  });

  it('lar triggeren regne ruta med hjelpefunksjonen, og bare med den', () => {
    expect(trigger).toContain(
      'FROM public.zone_grid_location(NEW.latitude, NEW.longitude, NEW.zone_precision_km);'
    );
    expect(trigger).not.toMatch(/cos\(|radians\(/);
    // Sone-grenen kommer etter privat og før omtrentlig, som i 042.
    const sone = trigger.indexOf('IF NEW.is_zone_finding = TRUE THEN');
    expect(sone).toBeGreaterThan(trigger.indexOf("NEW.visibility = 'private'"));
    expect(sone).toBeLessThan(trigger.indexOf("NEW.visibility = 'approximate'"));
  });

  /**
   * Hovedboka (docs/migrasjoner-a-kjore.md) avgjør om 075 er kjørt ved å lete
   * etter dette sporet i funksjonen, og om 042 er kjørt ved å lete etter
   * vakten. Begge må finnes i det 075 etterlater.
   */
  it('etterlater sporene hovedboka leter etter, for både 075 og 042', () => {
    const hovedbok = readFileSync(join(process.cwd(), 'docs', 'migrasjoner-a-kjore.md'), 'utf8');
    expect(hovedbok).toContain("('075', EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regproc('public.set_display_location') AND prosrc LIKE '%zone_grid_location%')");
    expect(hovedbok).toContain("prosrc LIKE '%OLD.display_latitude%'");
    expect(trigger).toContain('zone_grid_location');
    expect(trigger).toContain('OLD.display_latitude');
  });

  /**
   * Står triggeren avslått, stemples ingenting: et funn som gjøres om fra
   * eksakt til omtrentlig, blir stående med det eksakte punktet. Derfor skjer
   * av, oppdater og på i ÉN setning, inne i én transaksjon.
   */
  it('slår triggerne av og på igjen i én og samme setning', () => {
    expect(blokk).not.toBe('');
    const rekkefolge = [
      'ALTER TABLE public.findings DISABLE TRIGGER findings_set_display_location;',
      'ALTER TABLE public.findings DISABLE TRIGGER findings_updated_at;',
      'UPDATE public.findings AS f',
      'ALTER TABLE public.findings ENABLE TRIGGER findings_updated_at;',
      'ALTER TABLE public.findings ENABLE TRIGGER findings_set_display_location;'
    ].map((bit) => blokk.indexOf(bit));
    expect(rekkefolge.every((plass) => plass >= 0)).toBe(true);
    expect([...rekkefolge].sort((a, b) => a - b)).toEqual(rekkefolge);

    // Og ingen av dem står noe annet sted i fila.
    expect(sql.match(/DISABLE TRIGGER/g) ?? []).toHaveLength(2);
    expect(sql.match(/ENABLE TRIGGER/g) ?? []).toHaveLength(2);
    expect(sql.replace(blokk, '')).not.toMatch(/(DISABLE|ENABLE) TRIGGER/);
  });

  it('kjører alt i én transaksjon', () => {
    expect(sql.startsWith('BEGIN;')).toBe(true);
    expect(sql.endsWith('COMMIT;')).toBe(true);
    expect(sql.match(/\bCOMMIT;/g) ?? []).toHaveLength(1);
  });

  it('stempler bare sone-funn som har et punkt, med samme funksjon som triggeren', () => {
    expect(blokk).toContain('FROM public.zone_grid_location(f.latitude, f.longitude, f.zone_precision_km) AS g');
    expect(blokk).toContain("WHERE f.is_zone_finding = TRUE AND f.visibility IS DISTINCT FROM 'private';");
    // Bare de to visningskolonnene skrives. updated_at røres ikke: klokka
    // delingskarantenen leser, skal ikke starte for en migrasjon.
    expect(blokk).toContain('SET (display_latitude, display_longitude) = (');
    expect(blokk).not.toMatch(/updated_at\s*=/);
    expect(sql.match(/\bUPDATE public\.findings\b/g) ?? []).toHaveLength(1);
  });

  it('er idempotent: erstatter, og oppretter eller sletter ingenting', () => {
    expect(sql).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bCREATE (TABLE|TRIGGER|INDEX)\b/i);
    expect(sql.match(/\bCREATE\b/g) ?? []).toHaveLength(2);
    expect(sql.match(/\bCREATE OR REPLACE FUNCTION\b/g) ?? []).toHaveLength(2);
  });

  /** Triggeren kjører med rettighetene til den som lagrer funnet. */
  it('lar rollene som lagrer funn, kalle hjelpefunksjonen', () => {
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.zone_grid_location(DOUBLE PRECISION, DOUBLE PRECISION, INT) TO authenticated, service_role;'
    );
  });
});
