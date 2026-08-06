import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';

/**
 * Felles rensing for ALLE tre Sentry-oppsettene (klient, server, edge).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVORFOR DENNE FILA FINNES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rensingen lå først som tre håndskrevne kopier — én i hver init-fil. De hadde
 * allerede glidd fra hverandre da det ble oppdaget: klienten hadde en
 * `beforeBreadcrumb`, serveren hadde INGEN. Og det var serveren som snakket med
 * Supabase (`?user_id=eq.<uuid>`) og med Geonorge (`?nord=59.91342&ost=10.74609`).
 *
 * Tre kopier av en sikkerhetsregel er ikke tre vern. Det er tre steder å glemme
 * den. Derfor står regelen ÉN gang her, og alle tre importerer den.
 *
 * ⚠️ Denne fila lastes også i EDGE-runtimen (middleware). Den må derfor være ren
 * TypeScript uten Node-API-er — ingen `fs`, `path`, `Buffer` eller `process.cwd`.
 */

/**
 * Verter som serverer kartfliser.
 *
 * Flisadresser er et særtilfelle: posisjonen ligger ikke i query-strengen, men i
 * SELVE STIEN, som `/{z}/{y}/{x}`. Å stryke query-strengen hjelper derfor ikke.
 * En flis på zoomnivå 16 peker ut brukeren innenfor noen hundre meter, og
 * offline-nedlastingen — en betalt funksjon — henter nettopp rutene rundt
 * soppstedene deres.
 *
 * Fliser forklarer heller aldri en krasj. De kastes i sin helhet.
 * Kildene er speilet fra src/lib/utils/offlineMap.ts.
 */
const TILE_HOSTS = [
  'cache.kartverket.no',
  'opencache.statkart.no',
  'tile.openstreetmap.org',
  'server.arcgisonline.com'
];

/** Fanger flisruter hos verter vi ikke har listet opp (WMTS, MapServer/tile). */
const TILE_PATH = /\/(tiles?|wmts|MapServer)\//i;

/** Adresser vi ikke vil ha i det hele tatt — posisjonen er ikke til å vaske bort. */
export function isTileUrl(url: string): boolean {
  return TILE_HOSTS.some((host) => url.includes(host)) || TILE_PATH.test(url);
}

/** Alt etter «?» kan bære posisjon, bruker-ID eller en engangs-auth-kode. */
export function stripQuery(url: string): string {
  return url.split('?')[0].split('#')[0];
}

/**
 * Feltene en brødsmule får beholde.
 *
 * Bevisst en TILLATELSESLISTE, ikke en forbudsliste. Vi fant lekkasjen fordi
 * `http.query` — et felt ingen av oss visste fantes — ble lagt til av Sentrys
 * NodeFetch-integrasjon. Med en forbudsliste hadde neste ukjente felt sluppet
 * gjennom på nøyaktig samme måte. Med denne lista må et nytt felt tas inn
 * bevisst for å bli sendt.
 */
const ALLOWED_BREADCRUMB_FIELDS = new Set([
  'url',
  'method',
  'http.method',
  'status_code',
  'http.response.status_code',
  'level',
  'type',
  'reason'
]);

/**
 * Renser én brødsmule, eller kaster den.
 *
 * Returnerer `null` for brødsmuler som ikke kan reddes — Sentry tolker det som
 * «slipp denne».
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const data = breadcrumb.data;
  if (!data) return breadcrumb;

  const rawUrl = typeof data.url === 'string' ? data.url : undefined;
  if (rawUrl && isTileUrl(rawUrl)) return null;

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!ALLOWED_BREADCRUMB_FIELDS.has(key)) continue;
    cleaned[key] = key === 'url' && typeof value === 'string' ? stripQuery(value) : value;
  }

  breadcrumb.data = cleaned;
  return breadcrumb;
}

/**
 * Renser en hendelse før den forlater prosessen.
 *
 * Dette er belte og seler oppå `dataCollection`-oppsettet, og er robust mot at
 * SDK-standardene endres i en senere versjon.
 *
 * `contexts.nextjs.request_path` er den lumske: `Sentry.captureRequestError`
 * skriver Next.js' RÅ forespørselssti dit — query-strengen inkludert — og
 * `dataCollection.urlQueryParams: false` gjelder ikke der. Den nøkkelen leses
 * kun av `event.request.query_string`. Rensingen av `event.request` under
 * berører den altså ikke.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;

  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    delete event.request.query_string;
    // /map?lat=59.9&lng=10.7 og /api/prediction?lat=…&lon=… ER presis posisjon.
    if (event.request.url) event.request.url = stripQuery(event.request.url);
  }

  const nextjs = event.contexts?.nextjs as { request_path?: unknown } | undefined;
  if (nextjs && typeof nextjs.request_path === 'string') {
    nextjs.request_path = stripQuery(nextjs.request_path);
  }

  return event;
}
