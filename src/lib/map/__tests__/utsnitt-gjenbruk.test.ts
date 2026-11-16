import { describe, expect, it } from 'vitest';
import {
  POLSTRING,
  TRYGG_ANDEL_AV_TAK,
  dekkerUtsnitt,
  kanGjenbrukeHenting,
  ligger,
  polstreUtsnitt,
  utsnittAreal,
  velgHenteutsnitt,
  type Utsnitt
} from '../utsnitt-gjenbruk';

/** Oslo ved mobil zoom 11 — omtrent utsnittet taket på 6000 ble målt mot. */
const OSLO: Utsnitt = { south: 59.8, west: 10.5, north: 60.0, east: 11.0 };
/** Zoomet inn på Sognsvann, helt inne i Oslo-utsnittet. */
const SOGNSVANN: Utsnitt = { south: 59.96, west: 10.7, north: 59.99, east: 10.76 };
const TAK = 6000;

describe('dekkerUtsnitt', () => {
  it('et innzoomet utsnitt ligger inne i det forrige', () => {
    expect(dekkerUtsnitt(OSLO, SOGNSVANN)).toBe(true);
  });

  it('det samme utsnittet dekker seg selv', () => {
    expect(dekkerUtsnitt(OSLO, OSLO)).toBe(true);
  });

  it('utzoomet, eller panorert ut over en kant, dekkes ikke', () => {
    expect(dekkerUtsnitt(SOGNSVANN, OSLO)).toBe(false);
    expect(dekkerUtsnitt(OSLO, { ...OSLO, east: 11.001 })).toBe(false);
    expect(dekkerUtsnitt(OSLO, { ...OSLO, south: 59.799 })).toBe(false);
  });
});

describe('polstreUtsnitt', () => {
  it('legger til en andel av bredden og høyden på hver side', () => {
    const p = polstreUtsnitt(OSLO, 0.2);
    expect(p.south).toBeCloseTo(59.76, 10);
    expect(p.north).toBeCloseTo(60.04, 10);
    expect(p.west).toBeCloseTo(10.4, 10);
    expect(p.east).toBeCloseTo(11.1, 10);
  });

  it('en liten panorering lander inne i det polstrede utsnittet', () => {
    const panorert: Utsnitt = { south: 59.82, west: 10.56, north: 60.02, east: 11.06 };
    expect(dekkerUtsnitt(OSLO, panorert)).toBe(false);
    expect(dekkerUtsnitt(polstreUtsnitt(OSLO), panorert)).toBe(true);
  });

  it('går aldri utenfor kloden', () => {
    const p = polstreUtsnitt({ south: 89.5, west: 179.5, north: 90, east: 180 }, 1);
    expect(p.north).toBe(90);
    expect(p.east).toBe(180);
  });

  it('polstringen dobler omtrent flaten — derfor polstres det ikke uten videre', () => {
    expect(utsnittAreal(polstreUtsnitt(OSLO, POLSTRING)) / utsnittAreal(OSLO)).toBeCloseTo(1.96, 10);
  });
});

describe('kanGjenbrukeHenting', () => {
  const hel = { utsnitt: OSLO, antallRader: 3200, avkortet: false };

  it('zoom inn: radene er der allerede, ingen ny henting', () => {
    expect(kanGjenbrukeHenting(hel, SOGNSVANN)).toBe(true);
  });

  it('en avkuttet henting gjenbrukes ALDRI — utvalget kan mangle nettopp funnene der det zoomes inn', () => {
    expect(kanGjenbrukeHenting({ ...hel, avkortet: true }, SOGNSVANN)).toBe(false);
    // Heller ikke for nøyaktig samme utsnitt.
    expect(kanGjenbrukeHenting({ ...hel, avkortet: true }, OSLO)).toBe(false);
  });

  it('utenfor det hentede, eller uten noen forrige henting: hent', () => {
    expect(kanGjenbrukeHenting({ ...hel, utsnitt: SOGNSVANN }, OSLO)).toBe(false);
    expect(kanGjenbrukeHenting(null, OSLO)).toBe(false);
  });
});

describe('velgHenteutsnitt — polstre bare når det er god plass under taket', () => {
  it('første henting polstres ikke: vi vet ingenting om tettheten ennå', () => {
    expect(velgHenteutsnitt({ visning: OSLO, forrige: null, tak: TAK })).toEqual(OSLO);
  });

  it('glissent område: polstrer, så små panoreringer slipper ny henting', () => {
    const forrige = { utsnitt: OSLO, antallRader: 400, avkortet: false };
    expect(velgHenteutsnitt({ visning: OSLO, forrige, tak: TAK })).toEqual(polstreUtsnitt(OSLO));
  });

  it('tett område: polstrer ikke — det ville dyttet et helt utsnitt over taket', () => {
    // 3531 rader i Oslo-utsnittet (målt). Polstret ville det blitt ~6900.
    const forrige = { utsnitt: OSLO, antallRader: 3531, avkortet: false };
    expect(velgHenteutsnitt({ visning: OSLO, forrige, tak: TAK })).toEqual(OSLO);
  });

  it('grensen: overslaget må ligge under halve taket', () => {
    const paaGrensen = Math.floor((TAK * TRYGG_ANDEL_AV_TAK) / 1.96);
    expect(velgHenteutsnitt({ visning: OSLO, forrige: { utsnitt: OSLO, antallRader: paaGrensen, avkortet: false }, tak: TAK })).toEqual(
      polstreUtsnitt(OSLO)
    );
    expect(
      velgHenteutsnitt({ visning: OSLO, forrige: { utsnitt: OSLO, antallRader: paaGrensen + 2, avkortet: false }, tak: TAK })
    ).toEqual(OSLO);
  });

  it('overslaget skaleres med flaten: zoom ut fra et lite, tett utsnitt polstrer ikke', () => {
    // 300 rader i det lille utsnittet tilsvarer titusener i Oslo-utsnittet.
    const forrige = { utsnitt: SOGNSVANN, antallRader: 300, avkortet: false };
    expect(velgHenteutsnitt({ visning: OSLO, forrige, tak: TAK })).toEqual(OSLO);
  });

  it('etter en avkuttet henting polstres det ikke', () => {
    const forrige = { utsnitt: OSLO, antallRader: 6000, avkortet: true };
    expect(velgHenteutsnitt({ visning: SOGNSVANN, forrige, tak: TAK })).toEqual(SOGNSVANN);
  });

  it('et utsnitt uten flate gir ikke deling på null', () => {
    const punkt: Utsnitt = { south: 60, west: 10, north: 60, east: 10 };
    expect(velgHenteutsnitt({ visning: OSLO, forrige: { utsnitt: punkt, antallRader: 5, avkortet: false }, tak: TAK })).toEqual(OSLO);
  });
});

describe('ligger', () => {
  it('teller bare punktene som faktisk er i det som vises', () => {
    expect(ligger({ lat: 59.9, lng: 10.75 }, OSLO)).toBe(true);
    expect(ligger({ lat: 59.78, lng: 10.75 }, OSLO)).toBe(false);
    expect(ligger({ lat: 59.9, lng: 11.05 }, OSLO)).toBe(false);
  });
});
