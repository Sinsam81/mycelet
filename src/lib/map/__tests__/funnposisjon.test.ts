import { describe, expect, it } from 'vitest';
import {
  SAMME_STED_M,
  avstandMeter,
  flyttetoleranseMeter,
  formaterAvstand,
  kartErFlyttet,
  meterPerPiksel,
  senterForBoks,
  velgFunnposisjon,
  type FunnposisjonInn
} from '../funnposisjon';

/** Parkeringsplassen ved Sognsvann — der kartet ble åpnet. */
const PARKERING = { lat: 59.9706, lng: 10.7286 };
/** Lysningen førti minutter inn i marka, ~2,6 km unna. */
const LYSNING = { lat: 59.992, lng: 10.71 };
/** Hjemme i sofaen, mange kilometer fra begge. */
const HJEMME = { lat: 59.9139, lng: 10.7522 };

const gps = (punkt: { lat: number; lng: number }, accuracy = 12) => ({ ...punkt, accuracy });

function inn(delvis: Partial<FunnposisjonInn>): FunnposisjonInn {
  return { gps: null, soker: false, kartsenter: null, kartFlyttet: false, valg: null, ...delvis };
}

describe('velgFunnposisjon — de to turene som endte på feil sted', () => {
  it('parkeringsplassen: kartet står der appen la det, så den ferske målingen ved soppen brukes', () => {
    // Kartet ble sentrert på parkeringsplassen ved åpning og er ikke rørt.
    const p = velgFunnposisjon(inn({ gps: gps(LYSNING), kartsenter: PARKERING, kartFlyttet: false }));
    expect(p).toEqual({ status: 'klar', kilde: 'gps', lat: LYSNING.lat, lng: LYSNING.lng, automatisk: true });
  });

  it('sofaen: kartet er flyttet til lysningen og GPS-en står hjemme — appen velger ikke, brukeren må', () => {
    const p = velgFunnposisjon(inn({ gps: gps(HJEMME), kartsenter: LYSNING, kartFlyttet: true }));
    expect(p.status).toBe('maa_velge');
    if (p.status !== 'maa_velge') throw new Error('uventet');
    expect(p.grunn).toBe('ulike_steder');
    // Avstanden står i teksten brukeren leser, så den må være den ekte.
    expect(p.avstandM).toBeCloseTo(avstandMeter(HJEMME, LYSNING), 3);
    expect(p.avstandM).toBeGreaterThan(8000);
  });

  it('sofaen, etter trykket: «Der kartet står» lagrer lysningen — ikke hjemmet', () => {
    const p = velgFunnposisjon(inn({ gps: gps(HJEMME), kartsenter: LYSNING, kartFlyttet: true, valg: 'kart' }));
    expect(p).toEqual({ status: 'klar', kilde: 'kart', lat: LYSNING.lat, lng: LYSNING.lng, automatisk: false });
  });

  it('kartsenteret kan velges også når GPS finnes og kartet ikke er flyttet', () => {
    const p = velgFunnposisjon(inn({ gps: gps(LYSNING), kartsenter: PARKERING, kartFlyttet: false, valg: 'kart' }));
    expect(p).toMatchObject({ status: 'klar', kilde: 'kart', lat: PARKERING.lat, automatisk: false });
  });
});

describe('velgFunnposisjon — når GPS og kart er enige', () => {
  const nesten = { lat: LYSNING.lat + 0.0009, lng: LYSNING.lng }; // ~100 m nord

  it('innen 150 m brukes GPS-en av seg selv: den er den fineste av de to', () => {
    expect(avstandMeter(LYSNING, nesten)).toBeLessThan(SAMME_STED_M);
    const p = velgFunnposisjon(inn({ gps: gps(LYSNING, 8), kartsenter: nesten, kartFlyttet: true }));
    expect(p).toMatchObject({ status: 'klar', kilde: 'gps', automatisk: true });
  });

  it('en GPS på ±400 m kan ikke være «enig» med et punkt brukeren har siktet inn', () => {
    const p = velgFunnposisjon(inn({ gps: gps(LYSNING, 400), kartsenter: nesten, kartFlyttet: true }));
    expect(p).toMatchObject({ status: 'maa_velge', grunn: 'usikker_gps' });
  });

  it('grensen: akkurat 150 m nøyaktighet får avgjøre, 151 m får ikke', () => {
    const felles = { kartsenter: nesten, kartFlyttet: true };
    expect(velgFunnposisjon(inn({ ...felles, gps: gps(LYSNING, SAMME_STED_M) })).status).toBe('klar');
    expect(velgFunnposisjon(inn({ ...felles, gps: gps(LYSNING, SAMME_STED_M + 1) })).status).toBe('maa_velge');
  });

  it('en usikker GPS brukes likevel når kartet ikke sier noe (ikke flyttet) — nøyaktigheten står i etiketten', () => {
    const p = velgFunnposisjon(inn({ gps: gps(LYSNING, 900), kartsenter: PARKERING, kartFlyttet: false }));
    expect(p).toMatchObject({ status: 'klar', kilde: 'gps', automatisk: true });
  });
});

describe('velgFunnposisjon — mens målingen ennå ikke er kommet', () => {
  it('venter på den ferske målingen i stedet for å lagre noe gammelt', () => {
    expect(velgFunnposisjon(inn({ soker: true, kartsenter: PARKERING, kartFlyttet: false }))).toEqual({ status: 'venter' });
    // Også når kartet er flyttet: GPS-en kan fortsatt komme og være uenig.
    expect(velgFunnposisjon(inn({ soker: true, kartsenter: LYSNING, kartFlyttet: true }))).toEqual({ status: 'venter' });
  });

  it('den som ikke vil vente, kan velge kartsenteret med en gang', () => {
    const p = velgFunnposisjon(inn({ soker: true, kartsenter: LYSNING, kartFlyttet: true, valg: 'kart' }));
    expect(p).toMatchObject({ status: 'klar', kilde: 'kart', automatisk: false });
  });

  it('valgt GPS uten måling ennå: venter — en rask lagrer får ikke en posisjon som ikke finnes', () => {
    expect(velgFunnposisjon(inn({ soker: true, kartsenter: LYSNING, kartFlyttet: true, valg: 'gps' }))).toEqual({
      status: 'venter'
    });
  });

  it('en måling som kommer mens letingen fortsatt pågår, kan brukes med en gang', () => {
    const p = velgFunnposisjon(inn({ soker: true, gps: gps(LYSNING, 45), kartsenter: PARKERING, kartFlyttet: false }));
    expect(p).toMatchObject({ status: 'klar', kilde: 'gps' });
  });
});

describe('velgFunnposisjon — uten fersk GPS', () => {
  it('kartet er flyttet dit funnet var: kartsenteret brukes (desktop, avslått tilgang, i etterkant hjemmefra)', () => {
    const p = velgFunnposisjon(inn({ kartsenter: LYSNING, kartFlyttet: true }));
    expect(p).toEqual({ status: 'klar', kilde: 'kart', lat: LYSNING.lat, lng: LYSNING.lng, automatisk: true });
  });

  it('kartet står der appen la det: et kart ingen har flyttet er ikke et funnsted — brukeren må si at det stemmer', () => {
    // Dette er parkeringsplassen igjen, nå uten GPS under trærne. Før ble
    // funnet lagret der uten et ord.
    const p = velgFunnposisjon(inn({ kartsenter: PARKERING, kartFlyttet: false }));
    expect(p).toEqual({ status: 'maa_velge', grunn: 'kart_ikke_flyttet', avstandM: null });
    expect(velgFunnposisjon(inn({ kartsenter: PARKERING, kartFlyttet: false, valg: 'kart' }))).toMatchObject({
      status: 'klar',
      kilde: 'kart'
    });
  });

  it('valgt GPS som aldri kom: bytter ikke til kartet bak ryggen på brukeren', () => {
    const p = velgFunnposisjon(inn({ kartsenter: LYSNING, kartFlyttet: true, valg: 'gps' }));
    expect(p).toEqual({ status: 'maa_velge', grunn: 'gps_mangler', avstandM: null });
  });

  it('verken måling eller kart: ingenting å lagre på', () => {
    expect(velgFunnposisjon(inn({}))).toEqual({ status: 'ingen' });
    expect(velgFunnposisjon(inn({ valg: 'gps' }))).toEqual({ status: 'ingen' });
    expect(velgFunnposisjon(inn({ valg: 'kart' }))).toEqual({ status: 'ingen' });
  });

  it('GPS uten kart (kartet var ikke klart): GPS-en brukes', () => {
    expect(velgFunnposisjon(inn({ gps: gps(LYSNING) }))).toMatchObject({ status: 'klar', kilde: 'gps', automatisk: true });
  });
});

describe('kartErFlyttet', () => {
  it('uten et senter appen selv har valgt (dyplenke, søkt sted, husket utsnitt) er kartet lagt av noen', () => {
    expect(kartErFlyttet(LYSNING, null, 50)).toBe(true);
  });

  it('står kartet der appen la det, er det ikke flyttet — heller ikke etter pikselavrunding', () => {
    expect(kartErFlyttet(PARKERING, PARKERING, 15)).toBe(false);
    const enPikselUnna = { lat: PARKERING.lat + 0.00008, lng: PARKERING.lng }; // ~9 m
    expect(kartErFlyttet(enPikselUnna, PARKERING, flyttetoleranseMeter(PARKERING.lat, 13))).toBe(false);
  });

  it('et kart som er dratt et annet sted, er flyttet', () => {
    expect(kartErFlyttet(LYSNING, PARKERING, flyttetoleranseMeter(PARKERING.lat, 13))).toBe(true);
  });

  it('innzoomet teller også en liten, bevisst justering', () => {
    const tjueMeter = { lat: PARKERING.lat + 0.00018, lng: PARKERING.lng };
    expect(avstandMeter(tjueMeter, PARKERING)).toBeGreaterThan(15);
    expect(kartErFlyttet(tjueMeter, PARKERING, flyttetoleranseMeter(PARKERING.lat, 17))).toBe(true);
  });
});

describe('senterForBoks — der kartet havner når appen zoomer det til en boks', () => {
  const boks = (sor: number, nord: number, vest = 10.2, ost = 11.4) =>
    [
      { lat: sor, lng: vest },
      { lat: nord, lng: ost }
    ] as const;

  it('lengdegraden er midt i boksen, breddegraden ligger nord for gjennomsnittet (Web Mercator)', () => {
    const [sv, no] = boks(59.6, 60.25);
    const senter = senterForBoks(sv, no);
    expect(senter.lng).toBeCloseTo(10.8, 10);
    expect(senter.lat).toBeGreaterThan((59.6 + 60.25) / 2);
    expect(senter.lat).toBeLessThan(60.25);
  });

  it('noen meter for en boks på ti kilometer, flere hundre når søket har gått langt ut', () => {
    const fraSnittet = (sor: number, nord: number) => {
      const [sv, no] = boks(sor, nord);
      const senter = senterForBoks(sv, no);
      return avstandMeter(senter, { lat: (sor + nord) / 2, lng: senter.lng });
    };
    // 0,09° ≈ 10 km: forskjellen drukner i en piksel.
    expect(fraSnittet(59.87, 59.96)).toBeGreaterThan(1);
    expect(fraSnittet(59.87, 59.96)).toBeLessThan(10);
    // 0,9° ≈ 100 km (35 km til hver side, pluss luft rundt): mer enn GPS-en usikrer.
    expect(fraSnittet(59.46, 60.36)).toBeGreaterThan(300);
    // Lenger nord strekker kartet mer.
    expect(fraSnittet(69.2, 70.1)).toBeGreaterThan(fraSnittet(59.46, 60.36));
  });

  it('en boks uten høyde gir punktet selv', () => {
    const senter = senterForBoks(PARKERING, PARKERING);
    expect(senter.lat).toBeCloseTo(PARKERING.lat, 10);
    expect(senter.lng).toBeCloseTo(PARKERING.lng, 10);
  });
});

describe('etter «⭐ Lovende» — kartet står der appen la det', () => {
  // Brukeren står hjemme. «Lovende» fant to områder vest for ham og zoomet
  // kartet til boksen rundt dem og ham selv: senteret flyttet seg noen hundre
  // meter, uten at han rørte kartet.
  const sorvest = { lat: 59.9065, lng: 10.7302 };
  const nordost = { lat: 59.9195, lng: 10.7638 };
  const kartsenter = senterForBoks(sorvest, nordost);
  const toleranse = flyttetoleranseMeter(kartsenter.lat, 14);

  it('senteret ligger et stykke fra der han står — langt nok til at skjemaet ville spurt', () => {
    expect(avstandMeter(kartsenter, HJEMME)).toBeGreaterThan(SAMME_STED_M);
  });

  it('målt mot senteret fra FØR «Lovende» ser flyttingen ut som brukerens — det var feilen', () => {
    expect(kartErFlyttet(kartsenter, HJEMME, toleranse)).toBe(true);
    // Med fersk GPS: et valg brukeren ikke hadde gjort noe for å få.
    expect(velgFunnposisjon(inn({ gps: gps(HJEMME), kartsenter, kartFlyttet: true }))).toMatchObject({
      status: 'maa_velge',
      grunn: 'ulike_steder'
    });
    // Uten: midten av boksen lagret som funnsted, uten spørsmål.
    expect(velgFunnposisjon(inn({ kartsenter, kartFlyttet: true }))).toMatchObject({
      status: 'klar',
      kilde: 'kart',
      automatisk: true
    });
  });

  it('målt mot senteret appen selv la kartet på, er kartet ikke flyttet — heller ikke etter pikselavrunding', () => {
    expect(kartErFlyttet(kartsenter, senterForBoks(sorvest, nordost), toleranse)).toBe(false);
    const etParPikslerUnna = { lat: kartsenter.lat + 0.00009, lng: kartsenter.lng + 0.00009 }; // ~11 m
    expect(kartErFlyttet(etParPikslerUnna, senterForBoks(sorvest, nordost), toleranse)).toBe(false);
  });

  it('da brukes den ferske målingen uten spørsmål, og uten måling må brukeren si at kartsenteret stemmer', () => {
    const kartFlyttet = kartErFlyttet(kartsenter, senterForBoks(sorvest, nordost), toleranse);
    expect(velgFunnposisjon(inn({ gps: gps(HJEMME), kartsenter, kartFlyttet }))).toEqual({
      status: 'klar',
      kilde: 'gps',
      lat: HJEMME.lat,
      lng: HJEMME.lng,
      automatisk: true
    });
    expect(velgFunnposisjon(inn({ kartsenter, kartFlyttet }))).toEqual({
      status: 'maa_velge',
      grunn: 'kart_ikke_flyttet',
      avstandM: null
    });
  });

  it('flytter brukeren kartet etterpå, er det igjen et sted han har pekt ut', () => {
    expect(kartErFlyttet(LYSNING, senterForBoks(sorvest, nordost), toleranse)).toBe(true);
  });
});

describe('flyttetoleranseMeter', () => {
  it('følger zoomnivået: en piksel er mye lenger utzoomet', () => {
    // Ekvator, zoom 0: hele jorda på én 256 px-flis.
    expect(meterPerPiksel(0, 0)).toBeCloseTo(156_543.03, 1);
    // 60° nord halverer det, og hvert zoomnivå halverer igjen.
    expect(meterPerPiksel(60, 13)).toBeCloseTo(156_543.03392 / 2 / 2 ** 13, 3);
    expect(flyttetoleranseMeter(60, 11)).toBeGreaterThan(flyttetoleranseMeter(60, 13));
  });

  it('har et gulv i meter, så dyp zoom ikke gjør GPS-støy til «flyttet»', () => {
    expect(flyttetoleranseMeter(60, 19)).toBe(15);
  });
});

describe('formaterAvstand', () => {
  it('meter rundes til nærmeste ti, aldri «0 m»', () => {
    expect(formaterAvstand(348)).toBe('350 m');
    expect(formaterAvstand(3)).toBe('10 m');
  });

  it('kilometer med desimalkomma under ti, hele over', () => {
    expect(formaterAvstand(2140)).toBe('2,1 km');
    expect(formaterAvstand(12_700)).toBe('13 km');
  });

  it('skriver ikke «1000 m»', () => {
    expect(formaterAvstand(996)).toBe('1 km');
  });
});
