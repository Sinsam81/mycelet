// @vitest-environment jsdom
import { act, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Leaflet from 'leaflet';
import { lagBlokkerteHusk, type BlokkerteHusk, type BlokkerteSvar } from '@/lib/map/blokkerte-brukere';
import { utenBlokkerte } from '@/lib/moderation/blokkering';
import { Funnlag, type Funnpopup, type Klyngelag } from '../funnlag';

/**
 * Funnlaget mot EKTE Leaflet og ekte klyngelag (leaflet.markercluster).
 *
 * Første del viser hvorfor klassen finnes: å tømme laget lukker popupen til en
 * markør som står åpen. Kartet tømte laget ved hver henting, og en henting
 * startes av hver flytting — også den Leaflet selv gjør for å få plass til en
 * popup. Resten låser at avstemmingen lar markøren, popupen og det brukeren
 * har skrevet i den stå.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Funn = {
  id: string;
  user_id: string | null;
  display_lat: number | null;
  display_lng: number | null;
  edibility: string | null;
  notes?: string;
};

type Klynger = Leaflet.FeatureGroup & Klyngelag;

let L: typeof Leaflet;
/** Kartene testen har laget, så de kan fjernes etterpå. */
const kart: Leaflet.Map[] = [];

beforeAll(async () => {
  // Leaflet tar vare på requestAnimationFrame når modulen lastes — se
  // leafletEtterFjerning.test.ts.
  window.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
  window.cancelAnimationFrame = (id: number) => clearTimeout(id);
  L = (await import('leaflet')).default;
  await import('leaflet.markercluster');
});

function lagKart() {
  const div = document.createElement('div');
  // jsdom har ingen layout; klyngelaget trenger en kartstørrelse for å vite hva som er i utsnittet.
  Object.defineProperty(div, 'clientWidth', { get: () => 400 });
  Object.defineProperty(div, 'clientHeight', { get: () => 600 });
  document.body.appendChild(div);
  // Samme valg som kartet: maxZoom må være satt for klyngelaget.
  const map = L.map(div, { center: [59.91, 10.75], zoom: 13, maxZoom: 20, zoomControl: false });
  const klynger = (L as unknown as { markerClusterGroup: (valg: object) => Klynger }).markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false
  });
  map.addLayer(klynger);
  kart.push(map);
  return { map, klynger };
}

const ikon = () => L.divIcon({ className: 'custom-marker', html: '<div>🍄</div>', iconSize: [32, 32], iconAnchor: [16, 32] });

/** Spredt så langt at klyngelaget viser hver for seg på zoom 13. */
const funn = (id: string, userId = 'bruker-1', lat = 59.91, lng = 10.75, ekstra: Partial<Funn> = {}): Funn => ({
  id,
  user_id: userId,
  display_lat: lat,
  display_lng: lng,
  edibility: 'edible',
  ...ekstra
});
const A = funn('a', 'bruker-1', 59.93, 10.7);
const B = funn('b', 'bruker-2', 59.9, 10.78);
const C = funn('c', 'bruker-2', 59.88, 10.72);

/** Popupinnhold med egen tilstand — som meldeskjemaet i den ekte popupen. */
function Innhold({ funn: f }: { funn: Funn }) {
  const [tekst, setTekst] = useState('');
  return (
    <div data-funn={f.id}>
      <span data-rolle="notat">{f.notes ?? ''}</span>
      <textarea aria-label={`skriv-${f.id}`} value={tekst} onChange={(e) => setTekst(e.target.value)} />
    </div>
  );
}

function popupFor(teller?: { lag: number }) {
  return (f: Funn): Funnpopup => ({
    signatur: JSON.stringify(f),
    lag: () => {
      if (teller) teller.lag += 1;
      return <Innhold funn={f} />;
    }
  });
}

const synk = async (lag: Funnlag<Funn>, liste: Funn[], popup = popupFor()) => {
  await act(async () => {
    lag.synk(liste, popup);
  });
};

const skrivI = async (felt: HTMLTextAreaElement, tekst: string) => {
  await act(async () => {
    // React lytter på «input» og leser verdien gjennom elementets egen setter.
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(felt, tekst);
    felt.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const feltI = (marker: Leaflet.Marker) =>
  (marker.getPopup()!.getContent() as HTMLElement).querySelector('textarea') as HTMLTextAreaElement;

afterEach(() => {
  // Å åpne en popup starter en animert panorering (Leaflet flytter kartet for å
  // få plass til den). remove() stopper den — ellers fyrer animasjonsrammen
  // etter at jsdom er revet ned.
  for (const map of kart.splice(0)) {
    try {
      map.remove();
    } catch {
      // Alt fjernet av testen selv.
    }
  }
  document.body.innerHTML = '';
});

describe('hvorfor: å tømme klyngelaget lukker en åpen popup', () => {
  it('slik kartet gjorde ved hver henting', () => {
    const { klynger } = lagKart();
    const marker = L.marker([59.91, 10.75], { icon: ikon() });
    marker.bindPopup(document.createElement('div'));
    klynger.addLayer(marker);
    marker.openPopup();
    expect(marker.isPopupOpen()).toBe(true);

    klynger.clearLayers();
    expect(marker.isPopupOpen()).toBe(false);
  });
});

describe('Funnlag.synk', () => {
  it('tegner funnene, og hopper over dem uten koordinater', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [A, B, funn('uten', 'bruker-3', null as unknown as number, null as unknown as number)]);
    expect(lag.antall).toBe(2);
    expect(klynger.hasLayer(lag.marker('a')!)).toBe(true);
    expect(lag.har('uten')).toBe(false);
    expect(lag.marker('a')!.getLatLng()).toMatchObject({ lat: 59.93, lng: 10.7 });
  });

  it('en ny henting med samme funn lar markøren stå — det er samme objekt, ikke en kopi', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [A, B]);
    const forste = lag.marker('a');
    await synk(lag, [{ ...A }, { ...B }]);
    expect(lag.marker('a')).toBe(forste);
  });

  it('den åpne popupen overlever at kartet henter på nytt', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [A, B]);
    const marker = lag.marker('a')!;
    marker.openPopup();
    expect(marker.isPopupOpen()).toBe(true);

    // Kartet flyttet seg: B er ute av utsnittet, C er kommet inn. A står.
    await synk(lag, [{ ...A }, C]);
    expect(marker.isPopupOpen()).toBe(true);
    expect(lag.har('b')).toBe(false);
    expect(lag.har('c')).toBe(true);
  });

  it('det brukeren har skrevet i popupen blir stående', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [A]);
    const marker = lag.marker('a')!;
    marker.openPopup();
    await skrivI(feltI(marker), 'Rødlistet art, bør ikke stå åpent');

    await synk(lag, [{ ...A }, B]);
    expect(feltI(marker).value).toBe('Rødlistet art, bør ikke stå åpent');
  });

  it('nytt innhold gjengis i samme rot — teksten oppdateres, det brukeren har skrevet står', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [A]);
    const marker = lag.marker('a')!;
    marker.openPopup();
    const felt = feltI(marker);
    await skrivI(felt, 'halvskrevet');

    await synk(lag, [{ ...A, notes: 'Ved den store grana' }]);
    const innhold = marker.getPopup()!.getContent() as HTMLElement;
    expect(innhold.querySelector('[data-rolle="notat"]')!.textContent).toBe('Ved den store grana');
    // Samme element, samme tilstand: popupen ble oppdatert, ikke bygget på nytt.
    expect(feltI(marker)).toBe(felt);
    expect(felt.value).toBe('halvskrevet');
    expect(marker.isPopupOpen()).toBe(true);
  });

  it('gjengir ikke en popup på nytt når ingenting i den er endret', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    const teller = { lag: 0 };
    await synk(lag, [A, B], popupFor(teller));
    expect(teller.lag).toBe(2);
    await synk(lag, [{ ...A }, { ...B }], popupFor(teller));
    await synk(lag, [{ ...A }, { ...B }], popupFor(teller));
    expect(teller.lag).toBe(2);
    await synk(lag, [{ ...A, notes: 'nytt' }, { ...B }], popupFor(teller));
    expect(teller.lag).toBe(3);
  });

  it('et funn som er borte tas ut, og popupen dets lukkes', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [A, B]);
    const marker = lag.marker('a')!;
    marker.openPopup();
    await synk(lag, [B]);
    expect(marker.isPopupOpen()).toBe(false);
    expect(klynger.hasLayer(marker)).toBe(false);
    expect(lag.antall).toBe(1);
  });

  it('et funn som har flyttet seg får en ny markør på det nye punktet', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [A]);
    const gammel = lag.marker('a')!;
    await synk(lag, [{ ...A, display_lat: 59.94 }]);
    const ny = lag.marker('a')!;
    expect(ny).not.toBe(gammel);
    expect(ny.getLatLng().lat).toBe(59.94);
    expect(klynger.hasLayer(gammel)).toBe(false);
    expect(klynger.hasLayer(ny)).toBe(true);
    expect(lag.antall).toBe(1);
  });

  it('popupen bindes med kryss og bredden kartet alltid har brukt', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [A]);
    expect(lag.marker('a')!.getPopup()!.options).toMatchObject({ closeButton: true, maxWidth: 320, minWidth: 240 });
  });
});

describe('Funnlag.synk — funn som ligger samlet i en klynge', () => {
  // Tre funn på samme sted vises som ÉN klynge med tallet 3, ikke som tre
  // markører. Avstemmingen må virke like fullt for dem.
  const T1 = funn('t1', 'bruker-1', 59.91, 10.75);
  const T2 = funn('t2', 'bruker-2', 59.91, 10.7501);
  const T3 = funn('t3', 'bruker-2', 59.9101, 10.75);

  it('funnene er i laget selv om de ikke står hver for seg på kartet', async () => {
    const { map, klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [T1, T2, T3]);
    expect(lag.antall).toBe(3);
    for (const id of ['t1', 't2', 't3']) {
      expect(klynger.hasLayer(lag.marker(id)!)).toBe(true);
      // Samlet i klyngen: selve markøren ligger ikke på kartet.
      expect(map.hasLayer(lag.marker(id)!)).toBe(false);
    }
  });

  it('tar ut ett funn fra klyngen og lar de andre stå', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [T1, T2, T3]);
    const t1 = lag.marker('t1')!;
    const t3 = lag.marker('t3')!;
    await synk(lag, [T1, T3]);
    expect(lag.antall).toBe(2);
    expect(lag.har('t2')).toBe(false);
    expect(lag.marker('t1')).toBe(t1);
    expect(lag.marker('t3')).toBe(t3);
    expect(klynger.hasLayer(t1)).toBe(true);
  });

  it('en blokkering tar brukerens funn ut av klyngen', async () => {
    const { map, klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [T1, T2, T3]);
    const blokkert = [lag.marker('t2')!, lag.marker('t3')!];
    await act(async () => {
      expect(lag.fjernFraBruker('bruker-2')).toBe(2);
    });
    for (const marker of blokkert) expect(klynger.hasLayer(marker)).toBe(false);
    // Den som er igjen, står nå alene og vises som seg selv.
    expect(map.hasLayer(lag.marker('t1')!)).toBe(true);
  });

  it('tømmes helt, og fylles igjen', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [T1, T2, T3]);
    await synk(lag, []);
    expect(lag.antall).toBe(0);
    await synk(lag, [T2]);
    expect(klynger.hasLayer(lag.marker('t2')!)).toBe(true);
  });
});

describe('Funnlag.fjernFraBruker — etter en blokkering', () => {
  it('tar ut alle funnene til brukeren med en gang, og lar de andre stå', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [A, B, C]);
    const andres = lag.marker('a')!;
    const blokkert = lag.marker('b')!;
    blokkert.openPopup();

    let antall = 0;
    await act(async () => {
      antall = lag.fjernFraBruker('bruker-2');
    });
    expect(antall).toBe(2);
    expect(lag.har('b')).toBe(false);
    expect(lag.har('c')).toBe(false);
    expect(klynger.hasLayer(blokkert)).toBe(false);
    expect(blokkert.isPopupOpen()).toBe(false);
    expect(lag.marker('a')).toBe(andres);
    expect(klynger.hasLayer(andres)).toBe(true);
  });

  it('en bruker uten funn i laget endrer ingenting', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [A]);
    const fjern = vi.spyOn(klynger, 'removeLayers');
    expect(lag.fjernFraBruker('ingen')).toBe(0);
    expect(fjern).not.toHaveBeenCalled();
    expect(lag.antall).toBe(1);
  });

  it('følger eieren funnet har NÅ — også for en markør som har stått gjennom flere hentinger', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [A]);
    await synk(lag, [{ ...A, user_id: 'bruker-9' }]);
    expect(lag.fjernFraBruker('bruker-1')).toBe(0);
    await act(async () => {
      expect(lag.fjernFraBruker('bruker-9')).toBe(1);
    });
  });
});

describe('Funnlag.fjern — etter en sletting', () => {
  it('tar ut det ene funnet med en gang, og lar resten stå', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [A, B]);
    const slettet = lag.marker('a')!;
    const annet = lag.marker('b')!;
    let fantes = false;
    await act(async () => {
      fantes = lag.fjern('a');
    });
    expect(fantes).toBe(true);
    expect(klynger.hasLayer(slettet)).toBe(false);
    expect(lag.marker('b')).toBe(annet);
    expect(lag.antall).toBe(1);
  });

  it('et funn som ikke er tegnet gir bare beskjed', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [A]);
    expect(lag.fjern('finnes-ikke')).toBe(false);
    expect(lag.antall).toBe(1);
  });

  it('angres slettingen, kommer funnet tilbake ved neste avstemming', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [A, B]);
    await act(async () => {
      lag.fjern('a');
    });
    await synk(lag, [A, B]);
    expect(lag.har('a')).toBe(true);
    expect(klynger.hasLayer(lag.marker('a')!)).toBe(true);
  });
});

describe('Funnlag.tom og kast', () => {
  it('tom() tømmer laget og popup-røttene — ved bytte mellom egne og fellesskapets funn', async () => {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [A, B]);
    const marker = lag.marker('a')!;
    const innhold = marker.getPopup()!.getContent() as HTMLElement;
    expect(innhold.querySelector('textarea')).not.toBeNull();

    await act(async () => {
      lag.tom();
    });
    expect(lag.antall).toBe(0);
    expect(klynger.hasLayer(marker)).toBe(false);
    expect(innhold.querySelector('textarea')).toBeNull();

    // Og laget kan fylles igjen etterpå.
    await synk(lag, [C]);
    expect(lag.antall).toBe(1);
  });

  it('kast() rydder røttene uten å røre kartlaget — kartet er alt revet ned', async () => {
    const { map, klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    await synk(lag, [A]);
    const innhold = lag.marker('a')!.getPopup()!.getContent() as HTMLElement;
    map.remove();
    const tom = vi.spyOn(klynger, 'clearLayers');
    const fjern = vi.spyOn(klynger, 'removeLayers');
    await act(async () => {
      lag.kast();
    });
    expect(tom).not.toHaveBeenCalled();
    expect(fjern).not.toHaveBeenCalled();
    expect(lag.antall).toBe(0);
    expect(innhold.querySelector('textarea')).toBeNull();
  });
});

describe('blokkeringslista lar vente på seg — laget står ikke tomt, og ryddes når den kommer', () => {
  // Funnlaget ventet uten frist på lista over blokkerte. Én forespørsel som ble
  // hengende, holdt da hele laget tomt selv om funnene var hentet. Her er det
  // kartet gjør (loadFindings og abonnementet i MushroomMap.tsx), med de samme
  // byggeklossene og et oppslag testen lar henge.
  const blokkerer = (...ider: string[]): BlokkerteSvar => ({ data: ider.map((blocked_id) => ({ blocked_id })), error: null });

  function oppsett() {
    const { klynger } = lagKart();
    const lag = new Funnlag<Funn>(L, klynger, ikon);
    const oppslag: { svar: (v: BlokkerteSvar) => void } = { svar: () => {} };
    const husk = lagBlokkerteHusk(
      () =>
        new Promise<BlokkerteSvar>((resolve) => {
          oppslag.svar = resolve;
        }),
      // Kort frist, så testen ikke trenger å flytte klokka. Selve fristen er
      // prøvd i src/lib/map/__tests__/blokkerte-brukere.test.ts.
      { fristMs: 5 }
    );
    // Kartets abonnement: kommer lista sent, tas nålene ut av det som står der.
    void husk.naarHentet().then((ider) => {
      for (const id of ider) lag.fjernFraBruker(id);
    });
    return { lag, klynger, husk, oppslag };
  }

  /** Én lasting: oppslaget starter sammen med hentingen, og laget tegnes når begge er ventet på. */
  async function last(lag: Funnlag<Funn>, husk: BlokkerteHusk, hentFunn: Promise<Funn[]>) {
    const blokkerteLofte = husk.ider();
    const funnene = await hentFunn;
    const blokkerteIder = await blokkerteLofte;
    await synk(lag, utenBlokkerte(funnene, blokkerteIder));
  }

  /** Lista kommer. Oppryddingen river popup-røtter, så den får kjøre ferdig inne i act. */
  const lever = async (oppslag: { svar: (v: BlokkerteSvar) => void }, svar: BlokkerteSvar) => {
    await act(async () => {
      oppslag.svar(svar);
      await new Promise((ferdig) => setTimeout(ferdig, 0));
    });
  };

  it('et oppslag som aldri svarer: funnene tegnes likevel, ufiltrert', async () => {
    const { lag, husk } = oppsett();
    await last(lag, husk, Promise.resolve([A, B, C]));
    expect(lag.antall).toBe(3);
  });

  it('når lista så kommer, tas den blokkertes nåler ut — og popupen på et annet funn står', async () => {
    const { lag, klynger, husk, oppslag } = oppsett();
    await last(lag, husk, Promise.resolve([A, B, C]));
    const andres = lag.marker('a')!;
    const blokkert = lag.marker('b')!;
    andres.openPopup();

    await lever(oppslag, blokkerer('bruker-2'));
    expect(lag.har('b')).toBe(false);
    expect(lag.har('c')).toBe(false);
    expect(klynger.hasLayer(blokkert)).toBe(false);
    expect(lag.marker('a')).toBe(andres);
    expect(andres.isPopupOpen()).toBe(true);

    // Neste lasting er filtrert fra start, uten å vente.
    await last(lag, husk, Promise.resolve([A, B, C]));
    expect(lag.antall).toBe(1);
  });

  it('kom lista etter fristen, men før funnene, tegnes laget filtrert med en gang', async () => {
    const { lag, husk, oppslag } = oppsett();
    const hentingen: { svar: (f: Funn[]) => void } = { svar: () => {} };
    const lasting = last(
      lag,
      husk,
      new Promise<Funn[]>((resolve) => {
        hentingen.svar = resolve;
      })
    );
    // Fristen går ut mens funnene ennå hentes; så svarer oppslaget, og til
    // slutt kommer funnene.
    await husk.ider();
    await lever(oppslag, blokkerer('bruker-2'));
    hentingen.svar([A, B, C]);
    await lasting;

    expect(lag.antall).toBe(1);
    expect(lag.har('a')).toBe(true);
  });
});
