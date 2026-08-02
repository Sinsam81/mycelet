import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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

type SwEvent = {
  request: { method: string; url: string; mode?: string };
  waitUntil?: (promise: Promise<unknown>) => void;
  respondWith?: (response: Promise<Response> | Response) => void;
};

function keyOf(request: unknown): string {
  if (typeof request === 'string') return request;
  return (request as { url: string }).url;
}

class FakeCache {
  private entries = new Map<string, Response>();

  constructor(private readonly fetcher: (request: unknown) => Promise<Response>) {}

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
    return this.entries.get(keyOf(request));
  }
}

class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>();

  constructor(private readonly fetcher: (request: unknown) => Promise<Response>) {}

  async open(name: string) {
    const existing = this.caches.get(name);
    if (existing) return existing;
    const created = new FakeCache(this.fetcher);
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
  const network = {
    online: true,
    /** Svaret nettverket gir på en navigasjon, når det er dekning. */
    pageBody: (url: string) => `LIVE ${url}`
  };

  const fetchImpl = async (request: unknown) => {
    if (!network.online) throw new TypeError('Failed to fetch');
    return new Response(network.pageBody(keyOf(request)), { status: 200 });
  };

  const caches = new FakeCacheStorage(fetchImpl);
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

function dispatchFetch(worker: ReturnType<typeof loadServiceWorker>, request: SwEvent['request']) {
  let responded: Promise<Response> | Response | undefined;
  worker.listeners.get('fetch')?.({
    request,
    respondWith: (response) => {
      responded = response;
    }
  });
  return responded;
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
