import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WAIT_FOR_NETWORK_MESSAGE, retryWithNetworkWait } from '../../../../public/offline/offline-map.js';

/**
 * public/sw.js kjøres her som den er, i et falskt service worker-miljø.
 *
 * Grunnen til at testen laster den ekte filen i stedet for å lete etter
 * tekststrenger i den: løftet som skal holdes er en OPPFØRSEL — «en side kan
 * åpnes uten nett» — og den oppførselen ligger i samspillet mellom install og
 * fetch. En test som bare sjekket at ordet '/offline' står i filen ville vært
 * grønn selv om fetch-handleren aldri svarte på navigasjoner.
 */
const SW_SOURCE = readFileSync(new URL('../../../../public/sw.js', import.meta.url), 'utf8');

const ORIGIN = 'https://www.mycelet.com';

type SwRequest = { method: string; url: string; mode?: string };

type SwEvent = {
  request?: SwRequest;
  /** Innholdet i en melding fra en side (message-hendelsen). */
  data?: unknown;
  waitUntil?: (promise: Promise<unknown>) => void;
  respondWith?: (response: Promise<Response> | Response) => void;
};

/** Det testene kan skru på i det falske nettet og den falske cachen. */
type FakeNetwork = {
  online: boolean;
  svarEtterMs: number;
  skallOppslagMs: number;
  pageBody: (url: string) => string;
  kall: unknown[][];
  svar: Response[];
};

/**
 * Nøkkelen en ekte Cache lagrer under er en Request med ABSOLUTT url —
 * cache.add('/offline') blir til origin + '/offline'. Fakeen gjør det samme,
 * ellers ville beskjæringens unntak for precachede ressurser (som sammenligner
 * absolutte URL-er) ikke blitt testet slik den faktisk kjører.
 */
function keyOf(request: unknown): string {
  const raw = typeof request === 'string' ? request : (request as { url: string }).url;
  return new URL(raw, ORIGIN).href;
}

class FakeCache {
  // Map bevarer innsettingsrekkefølgen — samme garanti som Cache.keys() gir.
  private entries = new Map<string, Response>();

  constructor(
    private readonly fetcher: (request: unknown) => Promise<Response>,
    private readonly network: Pick<FakeNetwork, 'skallOppslagMs'>
  ) {}

  async add(request: unknown) {
    const response = await this.fetcher(request);
    if (!response.ok) throw new Error(`cache.add failed for ${keyOf(request)}`);
    this.entries.set(keyOf(request), response);
  }

  async addAll(requests: unknown[]) {
    await Promise.all(requests.map((request) => this.add(request)));
  }

  async put(request: unknown, response: Response) {
    this.entries.set(keyOf(request), response);
  }

  async match(request: unknown) {
    if (this.network.skallOppslagMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.network.skallOppslagMs));
    }
    // En ekte Cache gir et NYTT Response-objekt for hvert oppslag. Uten clone()
    // kunne skallet bare vært lest én gang per test.
    return this.entries.get(keyOf(request))?.clone();
  }

  async keys() {
    return Array.from(this.entries.keys(), (url) => ({ url }));
  }

  async delete(request: unknown) {
    return this.entries.delete(keyOf(request));
  }
}

class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>();

  constructor(
    private readonly fetcher: (request: unknown) => Promise<Response>,
    private readonly network: Pick<FakeNetwork, 'skallOppslagMs'>
  ) {}

  async open(name: string) {
    const existing = this.caches.get(name);
    if (existing) return existing;
    const created = new FakeCache(this.fetcher, this.network);
    this.caches.set(name, created);
    return created;
  }

  async keys() {
    return Array.from(this.caches.keys());
  }

  async delete(name: string) {
    return this.caches.delete(name);
  }
}

/** Kjører public/sw.js og gir tilbake håndtakene testene trenger. */
function loadServiceWorker() {
  const listeners = new Map<string, (event: SwEvent) => void>();
  const network: FakeNetwork = {
    online: true,
    /**
     * Én strek dekning: forbindelsen er «oppe», men svaret kommer først etter
     * så mange millisekunder. Infinity = verken svar eller feil, noensinne.
     */
    svarEtterMs: 0,
    /** Så lenge bruker et oppslag i cachen. Over null bare der en test trenger kappløpet. */
    skallOppslagMs: 0,
    /** Svaret nettverket gir på en navigasjon, når det er dekning. */
    pageBody: (url: string) => `LIVE ${url}`,
    /** Argumentene til hvert fetch()-kall, slik workeren ga dem. */
    kall: [],
    /** Hvert svar nettet har gitt, i rekkefølge. */
    svar: []
  };

  const fetchImpl = async (...args: unknown[]) => {
    network.kall.push(args);
    if (!network.online) throw new TypeError('Failed to fetch');
    if (network.svarEtterMs === Infinity) return new Promise<Response>(() => {});
    if (network.svarEtterMs > 0) await new Promise((resolve) => setTimeout(resolve, network.svarEtterMs));
    const svar = new Response(network.pageBody(keyOf(args[0])), { status: 200 });
    network.svar.push(svar);
    return svar;
  };

  const caches = new FakeCacheStorage(fetchImpl, network);
  const self = {
    addEventListener: (type: string, handler: (event: SwEvent) => void) => {
      listeners.set(type, handler);
    },
    skipWaiting: () => undefined,
    clients: { claim: () => undefined },
    location: new URL(`${ORIGIN}/sw.js`)
  };

  // Kjører service worker-kilden i sitt eget scope, med globalene den venter seg.
  const run = new Function('self', 'caches', 'fetch', 'Response', 'URL', SW_SOURCE);
  run(self, caches, fetchImpl, Response, URL);

  return { listeners, caches, network };
}

async function install(worker: ReturnType<typeof loadServiceWorker>) {
  const pending: Promise<unknown>[] = [];
  worker.listeners.get('install')?.({
    request: { method: 'GET', url: `${ORIGIN}/` },
    waitUntil: (promise) => pending.push(promise)
  });
  await Promise.all(pending);
}

function dispatchFetch(worker: ReturnType<typeof loadServiceWorker>, request: SwRequest) {
  let responded: Promise<Response> | Response | undefined;
  worker.listeners.get('fetch')?.({
    request,
    respondWith: (response) => {
      responded = response;
    }
  });
  return responded;
}

/** En melding fra en side til workeren — det skallets «prøv på nytt» sender. */
function dispatchMessage(worker: ReturnType<typeof loadServiceWorker>, data: unknown) {
  worker.listeners.get('message')?.({ data });
}

/** Følger løftet uten å vente på det: hva er det løst med akkurat nå? */
function folg(responded: Promise<Response> | Response | undefined) {
  const tilstand: { svar?: Response } = {};
  void Promise.resolve(responded!).then((svar) => {
    tilstand.svar = svar;
  });
  return tilstand;
}

describe('service worker: en side som kan åpnes uten nett', () => {
  it('precacher offline-skallet ved installasjon', async () => {
    const worker = loadServiceWorker();
    await install(worker);

    const staticCache = await worker.caches.open('mycelet-static-v3');
    expect(await staticCache.match('/offline'), 'offline-skallet må ligge i precachen').toBeDefined();
    expect(await staticCache.match('/offline/offline-map.js'), 'skallets skript må ligge i precachen').toBeDefined();
  });

  it('svarer med offline-skallet når en navigasjon feiler uten dekning', async () => {
    const worker = loadServiceWorker();
    await install(worker);

    // Ut i skogen: ingen dekning, brukeren åpner appen på /map.
    worker.network.online = false;
    const responded = dispatchFetch(worker, { method: 'GET', url: `${ORIGIN}/map`, mode: 'navigate' });

    expect(responded, 'service workeren svarte ikke på navigasjonen i det hele tatt').toBeDefined();
    const body = await (await responded!).text();
    expect(body).toContain('/offline');
  });

  it('lar en påkoblet bruker få den ferske siden, aldri skallet', async () => {
    // Freskhetsregelen: en sopp-app skal ikke servere en gammel artsside fra
    // cache — sikkerhetsopplysningene om en art kan ha endret seg. Skallet er
    // kun et fallback for feilet nettverk.
    const worker = loadServiceWorker();
    await install(worker);

    const responded = dispatchFetch(worker, { method: 'GET', url: `${ORIGIN}/species/41`, mode: 'navigate' });
    // Svarer ikke service workeren, går nettleseren rett på nettet — også ferskt.
    if (!responded) return;

    expect(await (await responded).text()).toBe(`LIVE ${ORIGIN}/species/41`);
  });

  it('rører ikke omdirigeringen når middleware sender deg til innlogging', async () => {
    // /map er auth-gated. En utlogget bruker MED dekning skal få middlewares
    // omdirigering til /auth/login uendret — service workeren har ingen rolle
    // der. Bare et fetch() som kaster (ingen dekning) utløser skallet.
    const worker = loadServiceWorker();
    await install(worker);

    worker.network.pageBody = () => 'OMDIRIGERING';
    const responded = dispatchFetch(worker, { method: 'GET', url: `${ORIGIN}/map`, mode: 'navigate' });
    if (!responded) return;

    expect(await (await responded).text()).toBe('OMDIRIGERING');
  });

  it('lar ikke STATIC_CACHE vokse i det uendelige over utrullinger', async () => {
    // Filnavnene under /_next/static/ er innholdshashet: hver deploy legger inn
    // et helt nytt sett og lar det gamle ligge. Uten beskjæring deler den døde
    // vekten lagringskvote med kartflisene brukeren har betalt for.
    const worker = loadServiceWorker();
    await install(worker);

    for (let i = 0; i < 200; i++) {
      const responded = dispatchFetch(worker, {
        method: 'GET',
        url: `${ORIGIN}/_next/static/chunks/deploy-${i}.js`
      });
      await responded;
    }

    const staticCache = await worker.caches.open('mycelet-static-v3');
    const keys = await staticCache.keys();
    expect(keys.length, 'cachen vokste forbi taket').toBeLessThanOrEqual(80);
  });

  it('beskjærer aldri bort offline-skallet', async () => {
    // Skallet precaches FØRST og ligger derfor eldst i cachen. En naiv
    // «kast de eldste»-regel ville tatt nettopp det brukeren trenger i skogen.
    const worker = loadServiceWorker();
    await install(worker);

    for (let i = 0; i < 200; i++) {
      await dispatchFetch(worker, {
        method: 'GET',
        url: `${ORIGIN}/_next/static/chunks/deploy-${i}.js`
      });
    }

    const staticCache = await worker.caches.open('mycelet-static-v3');
    expect(await staticCache.match('/offline'), 'offline-skallet ble beskåret bort').toBeDefined();
    expect(
      await staticCache.match('/offline/offline-map.js'),
      'skallets skript ble beskåret bort'
    ).toBeDefined();
  });

  it('serverer lagrede kartfliser fra cachen uten dekning', async () => {
    const worker = loadServiceWorker();
    await install(worker);

    const tileUrl = 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/12/1191/2170.png';
    const tileCache = await worker.caches.open('mycelet-map-tiles-v1');
    await tileCache.put(tileUrl, new Response('LAGRET FLIS', { status: 200 }));

    worker.network.online = false;
    const responded = dispatchFetch(worker, { method: 'GET', url: tileUrl });
    const body = await (await responded!).text();

    expect(body).toBe('LAGRET FLIS');
  });
});

/**
 * v6: navigasjoner har en frist. Skallet kom før bare når fetch() KASTET
 * (flymodus). På én strek dekning verken svarer eller feiler fetch(), og
 * brukeren sto med hvit skjerm til WebViewens egen frist — rundt et minutt.
 */
describe('service worker: navigasjon som aldri får svar', () => {
  const FRIST_MS = 10_000;

  afterEach(() => vi.useRealTimers());

  it('viser offline-skallet når nettet ikke har svart innen fristen', async () => {
    const worker = loadServiceWorker();
    await install(worker);
    vi.useFakeTimers();

    worker.network.svarEtterMs = Infinity;
    const tilstand = folg(dispatchFetch(worker, { method: 'GET', url: `${ORIGIN}/map`, mode: 'navigate' }));

    await vi.advanceTimersByTimeAsync(FRIST_MS - 1);
    expect(tilstand.svar, 'skallet kom før fristen').toBeUndefined();

    await vi.advanceTimersByTimeAsync(2);
    expect(tilstand.svar, 'navigasjonen henger fortsatt etter fristen').toBeDefined();
    expect(await tilstand.svar!.text()).toContain('/offline');
  });

  it('lar et svar som kommer før fristen vinne — aldri skallet', async () => {
    const worker = loadServiceWorker();
    await install(worker);
    vi.useFakeTimers();

    worker.network.svarEtterMs = FRIST_MS - 2_000;
    const tilstand = folg(dispatchFetch(worker, { method: 'GET', url: `${ORIGIN}/species/41`, mode: 'navigate' }));

    await vi.advanceTimersByTimeAsync(FRIST_MS - 1_000);
    expect(await tilstand.svar!.text()).toBe(`LIVE ${ORIGIN}/species/41`);

    // Fristen er ryddet: ingenting henger igjen og fyrer senere.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('venter videre på nettet når skallet ikke ligger i cachen', async () => {
    // Uten install() finnes ikke skallet. Da skal fristen ikke gjøre noe som
    // helst verre enn før: det sene svaret fra nettet kommer fram.
    const worker = loadServiceWorker();
    vi.useFakeTimers();

    worker.network.svarEtterMs = FRIST_MS * 3;
    const tilstand = folg(dispatchFetch(worker, { method: 'GET', url: `${ORIGIN}/map`, mode: 'navigate' }));

    await vi.advanceTimersByTimeAsync(FRIST_MS + 1);
    expect(tilstand.svar, 'svarte uten å ha noe å svare med').toBeUndefined();

    await vi.advanceTimersByTimeAsync(FRIST_MS * 2);
    expect(await tilstand.svar!.text()).toBe(`LIVE ${ORIGIN}/map`);
  });

  it('bytter aldri ut en innloggingsretur med skallet', async () => {
    // /auth/callback?code=… fullføres på serveren uansett og bruker opp
    // engangskoden. Viste vi skallet, ville «Prøv igjen» feilet.
    const worker = loadServiceWorker();
    await install(worker);
    vi.useFakeTimers();

    worker.network.svarEtterMs = FRIST_MS * 3;
    const url = `${ORIGIN}/auth/callback?code=abc`;
    const tilstand = folg(dispatchFetch(worker, { method: 'GET', url, mode: 'navigate' }));

    await vi.advanceTimersByTimeAsync(FRIST_MS * 2);
    expect(tilstand.svar, 'innloggingsreturen ble avbrutt av fristen').toBeUndefined();

    await vi.advanceTimersByTimeAsync(FRIST_MS);
    expect(await tilstand.svar!.text()).toBe(`LIVE ${url}`);
  });

  it('svarer fortsatt med en gang når fetch kaster, uten å vente på fristen', async () => {
    const worker = loadServiceWorker();
    await install(worker);
    vi.useFakeTimers();

    worker.network.online = false;
    const tilstand = folg(dispatchFetch(worker, { method: 'GET', url: `${ORIGIN}/map`, mode: 'navigate' }));

    await vi.advanceTimersByTimeAsync(1);
    expect(await tilstand.svar!.text()).toContain('/offline');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('avviser aldri svaret — heller en nettverksfeil enn et løfte som kaster', async () => {
    // Uten skall og uten nett: Response.error(), ikke et avvist respondWith().
    const worker = loadServiceWorker();
    worker.network.online = false;
    const responded = dispatchFetch(worker, { method: 'GET', url: `${ORIGIN}/map`, mode: 'navigate' });
    const svar = await responded!;
    expect(svar.type).toBe('error');
  });
});

/**
 * v7: fristen gjelder bare første forsøk.
 *
 * Skallet precaches for ALLE, så v6 traff enhver besøkende på tregt nett: kom
 * første byte etter 14 s, ble siden byttet ut med skallet etter 10 — og «Prøv
 * å laste appen på nytt» startet en ny forespørsel som ble kuttet på samme
 * måte. Siden kunne ikke lastes i det hele tatt, der v5 leverte den etter
 * ventetiden.
 */
describe('service worker: nytt forsøk etter at fristen ga skallet', () => {
  const FRIST_MS = 10_000;
  /** Tregt, men ikke dødt: første byte kommer etter fjorten sekunder. */
  const TREGT_NETT_MS = 14_000;
  /** Så lenge husker workeren selv adressen som fikk skallet. */
  const HUSKES_MS = 30_000;
  const SIDE = `${ORIGIN}/species/41`;

  afterEach(() => vi.useRealTimers());

  async function klarWorker() {
    const worker = loadServiceWorker();
    await install(worker);
    vi.useFakeTimers();
    // Bare avstander i tid betyr noe her, men klokka skal ikke følge dagens dato.
    vi.setSystemTime(new Date('2026-09-20T08:00:00Z'));
    return worker;
  }

  function naviger(worker: ReturnType<typeof loadServiceWorker>, url: string = SIDE) {
    return folg(dispatchFetch(worker, { method: 'GET', url, mode: 'navigate' }));
  }

  /** Første forsøk: nettet svarer ikke innen fristen, og brukeren får skallet. */
  async function faaSkalletEtterFristen(worker: ReturnType<typeof loadServiceWorker>, url: string = SIDE) {
    const forste = naviger(worker, url);
    await vi.advanceTimersByTimeAsync(FRIST_MS + 1);
    expect(await forste.svar!.text(), 'første forsøk skulle endt i skallet').toContain('/offline');
  }

  it('kutter ikke forsøket en gang til — på tregt nett kommer siden fram', async () => {
    const worker = await klarWorker();
    worker.network.svarEtterMs = TREGT_NETT_MS;
    await faaSkalletEtterFristen(worker);

    // Brukeren leser skallet noen sekunder og laster på nytt.
    await vi.advanceTimersByTimeAsync(5_000);
    const andre = naviger(worker);

    await vi.advanceTimersByTimeAsync(FRIST_MS + 1);
    expect(andre.svar, 'det nye forsøket ble kuttet av fristen, akkurat som det første').toBeUndefined();

    await vi.advanceTimersByTimeAsync(TREGT_NETT_MS - FRIST_MS);
    expect(await andre.svar!.text()).toBe(`LIVE ${SIDE}`);
  });

  it('bruker opp unntaket på ett forsøk, så fristen gjelder igjen neste gang', async () => {
    // I skogen er det fristen som får det lagrede kartet fram. Den skal ikke
    // være borte for godt fordi ett forsøk fikk vente.
    const worker = await klarWorker();
    worker.network.svarEtterMs = Infinity;
    await faaSkalletEtterFristen(worker);

    const andre = naviger(worker);
    await vi.advanceTimersByTimeAsync(FRIST_MS * 3);
    expect(andre.svar, 'forsøket som skulle få vente ble kuttet').toBeUndefined();

    const tredje = naviger(worker);
    await vi.advanceTimersByTimeAsync(FRIST_MS + 1);
    expect(await tredje.svar!.text()).toContain('/offline');
  });

  it('gir ikke andre sider fri fra fristen', async () => {
    const worker = await klarWorker();
    worker.network.svarEtterMs = Infinity;
    await faaSkalletEtterFristen(worker);

    const annenSide = naviger(worker, `${ORIGIN}/map`);
    await vi.advanceTimersByTimeAsync(FRIST_MS + 1);
    expect(await annenSide.svar!.text()).toContain('/offline');
  });

  it('husker adressen i et halvt minutt, ikke lenger', async () => {
    // Kort med vilje: workeren ser ikke forskjell på en bruker som laster på
    // nytt og en WebView som gjør det selv etter en tur i kameraet. Uten
    // dekning skal den siste få skallet etter ti sekunder, ikke hvit skjerm.
    const worker = await klarWorker();
    worker.network.svarEtterMs = Infinity;
    await faaSkalletEtterFristen(worker);

    // Like før det foreldes gjelder unntaket fortsatt …
    await vi.advanceTimersByTimeAsync(HUSKES_MS - 1_000);
    const iTide = naviger(worker);
    await vi.advanceTimersByTimeAsync(FRIST_MS + 1);
    expect(iTide.svar, 'forsøket innen et halvt minutt ble kuttet').toBeUndefined();

    // … men ikke etterpå. (Forsøket over brukte opp unntaket, så skallet må
    // først vises en gang til for at adressen skal huskes på nytt.)
    await faaSkalletEtterFristen(worker);
    await vi.advanceTimersByTimeAsync(HUSKES_MS);
    const forSent = naviger(worker);
    await vi.advanceTimersByTimeAsync(FRIST_MS + 1);
    expect(await forSent.svar!.text()).toContain('/offline');
  });

  it('lar skallets knapp be om å vente, også når workeren er startet på nytt i mellomtiden', async () => {
    // En fersk worker har ikke noe minne om fristen som gikk ut: nettleseren
    // stopper en ledig worker etter kort tid. Da er det meldingen fra skallet
    // som gir forsøket fri — sendt av den ekte funksjonen i offline-map.js,
    // så de to filene ikke kan bli uenige om hva meldingen heter.
    const worker = await klarWorker();
    worker.network.svarEtterMs = TREGT_NETT_MS;

    const rekkefolge: string[] = [];
    retryWithNetworkWait(
      {
        serviceWorker: {
          controller: {
            postMessage: (melding) => {
              rekkefolge.push('melding');
              dispatchMessage(worker, melding);
            }
          }
        }
      },
      // Skallet sender hele adressen. Fragmentet skal ikke gjøre den til en annen side.
      `${SIDE}#forvekslinger`,
      () => rekkefolge.push('last på nytt')
    );
    expect(rekkefolge).toEqual(['melding', 'last på nytt']);

    const forsok = naviger(worker);
    await vi.advanceTimersByTimeAsync(FRIST_MS + 1);
    expect(forsok.svar, 'knappens forsøk ble kuttet av fristen').toBeUndefined();

    await vi.advanceTimersByTimeAsync(TREGT_NETT_MS - FRIST_MS);
    expect(await forsok.svar!.text()).toBe(`LIVE ${SIDE}`);
  });

  it('overser meldinger den ikke kjenner, og adresser som ikke er våre', async () => {
    const worker = await klarWorker();
    worker.network.svarEtterMs = Infinity;

    dispatchMessage(worker, null);
    dispatchMessage(worker, 'vent');
    dispatchMessage(worker, { type: 'noe-annet', url: SIDE });
    dispatchMessage(worker, { type: WAIT_FOR_NETWORK_MESSAGE });
    dispatchMessage(worker, { type: WAIT_FOR_NETWORK_MESSAGE, url: 'http://' });
    dispatchMessage(worker, { type: WAIT_FOR_NETWORK_MESSAGE, url: 'https://example.org/species/41' });

    const forsok = naviger(worker);
    await vi.advanceTimersByTimeAsync(FRIST_MS + 1);
    expect(await forsok.svar!.text()).toContain('/offline');
  });

  it('husker ikke adressen når nettet rakk fram mens skallet ble slått opp', async () => {
    // Fristen går ut, oppslaget i cachen tar litt tid, og imens kommer svaret.
    // Siden er levert — da skal ikke neste navigasjon dit stå uten frist.
    const worker = await klarWorker();
    worker.network.skallOppslagMs = 50;
    worker.network.svarEtterMs = FRIST_MS + 10;

    const forste = naviger(worker);
    await vi.advanceTimersByTimeAsync(FRIST_MS + 100);
    expect(await forste.svar!.text()).toBe(`LIVE ${SIDE}`);

    worker.network.skallOppslagMs = 0;
    worker.network.svarEtterMs = Infinity;
    const andre = naviger(worker);
    await vi.advanceTimersByTimeAsync(FRIST_MS + 1);
    expect(andre.svar, 'adressen ble husket selv om siden kom fram').toBeDefined();
    expect(await andre.svar!.text()).toContain('/offline');
  });

  it('avbryter nedlastingen av svaret som kom etter at skallet var vist', async () => {
    // Ingen skal ha det, og på en tynn linje ville det delt båndbredde med
    // forsøket brukeren gjør nå.
    const worker = await klarWorker();
    worker.network.svarEtterMs = TREGT_NETT_MS;
    await faaSkalletEtterFristen(worker);

    const svarFor = worker.network.svar.length;
    await vi.advanceTimersByTimeAsync(TREGT_NETT_MS - FRIST_MS);
    expect(worker.network.svar.length, 'det sene svaret kom aldri').toBe(svarFor + 1);
    expect(worker.network.svar[svarFor].bodyUsed, 'det sene svaret lastes fortsatt ned').toBe(true);

    // Skallet i cachen er urørt: neste gang fristen går ut, kan det vises igjen.
    worker.network.svarEtterMs = Infinity;
    await faaSkalletEtterFristen(worker, `${ORIGIN}/map`);
  });

  it('sender navigasjonen til nettet uten init-objekt', async () => {
    // fetch(request, { signal }) ville gjort navigasjonen om til en vanlig
    // forespørsel (mode 'same-origin', workeren som referrer). Se advarselen
    // over respondToNavigation i public/sw.js.
    const worker = await klarWorker();
    const request = { method: 'GET', url: SIDE, mode: 'navigate' };
    dispatchFetch(worker, request);

    const kall = worker.network.kall[worker.network.kall.length - 1];
    expect(kall).toHaveLength(1);
    expect(kall[0]).toBe(request);
  });
});
