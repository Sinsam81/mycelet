export interface PlaceResult {
  name: string;
  /** Secondary line: municipality/region + country. */
  context: string;
  lat: number;
  lng: number;
}

/**
 * Nordic place-name search for the map.
 *
 * Kartverket's Stedsnavn API only covers Norway, and — worse — its fuzzy
 * matching answers Swedish queries with wrong Norwegian places instead of
 * nothing: «Uppsala» returned «Oppsal, Hjartdal», «Sälen» returned «Selen,
 * Karmøy». For an app that sells itself on Norway AND Sweden, a silent wrong
 * answer is the worst failure mode.
 *
 * So: Photon (Komoot's OSM geocoder — free, keyless, CORS-enabled) is the
 * primary source since it covers both countries, and Kartverket stays as a
 * Norway-only fallback for the rare case Photon is unreachable. Results are
 * limited to NO/SE because that's where the app has weather and forest data.
 */

const PHOTON_URL = 'https://photon.komoot.io/api/';
const KARTVERKET_URL = 'https://ws.geonorge.no/stedsnavn/v1/navn';

const COUNTRY_LABEL: Record<string, string> = { NO: 'Norge', SE: 'Sverige' };

interface PhotonFeature {
  properties?: {
    name?: string;
    countrycode?: string;
    county?: string;
    state?: string;
    city?: string;
    district?: string;
    osm_value?: string;
  };
  geometry?: { coordinates?: [number, number] };
}

/** Prefer settlements over farm plots and lakes when both match the query. */
const PLACE_RANK: Record<string, number> = {
  city: 0,
  town: 1,
  municipality: 1,
  village: 2,
  suburb: 3,
  hamlet: 4
};

function fromPhoton(feature: PhotonFeature): PlaceResult | null {
  const p = feature.properties ?? {};
  const coords = feature.geometry?.coordinates;
  const country = (p.countrycode ?? '').toUpperCase();
  if (!p.name || !coords || !COUNTRY_LABEL[country]) return null;
  const region = p.county ?? p.state ?? p.city ?? p.district ?? '';
  return {
    name: p.name,
    context: [region, COUNTRY_LABEL[country]].filter(Boolean).join(' · '),
    lat: coords[1],
    lng: coords[0]
  };
}

async function searchPhoton(query: string, signal: AbortSignal): Promise<PlaceResult[]> {
  const params = new URLSearchParams({ q: query, limit: '12', lang: 'default' });
  const res = await fetch(`${PHOTON_URL}?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const data = (await res.json()) as { features?: PhotonFeature[] };

  const scored = (data.features ?? [])
    .map((feature) => ({ result: fromPhoton(feature), kind: feature.properties?.osm_value ?? '' }))
    .filter((entry): entry is { result: PlaceResult; kind: string } => entry.result !== null)
    .map((entry, index) => ({
      ...entry,
      // Keep Photon's own relevance order as the tie-breaker.
      rank: (PLACE_RANK[entry.kind] ?? 5) * 100 + index
    }))
    .sort((a, b) => a.rank - b.rank);

  // Drop duplicates (same name + rounded position) — OSM often has a node and
  // an area for the same town.
  const seen = new Set<string>();
  const unique: PlaceResult[] = [];
  for (const { result } of scored) {
    const key = `${result.name}@${result.lat.toFixed(2)},${result.lng.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(result);
  }
  return unique.slice(0, 6);
}

interface KartverketName {
  'skrivemåte'?: string;
  navneobjekttype?: string;
  kommuner?: { kommunenavn?: string }[];
  representasjonspunkt?: { nord?: number; 'øst'?: number };
}

/**
 * Navneobjekttyper Kartverket returnerer som er NOEN SIN BOLIG eller gård, ikke
 * et sted man drar på tur til. «Helsinki» ga «Helsing, Enebolig/mindre
 * boligbygg · Asker» — en navngitt privatadresse foreslått som kartdestinasjon.
 * De hører ikke hjemme i et søkeforslag uansett hvor godt de matcher.
 */
const PRIVATE_KARTVERKET_TYPES = new Set(['enebolig/mindre boligbygg', 'fritidsbolig', 'bruk']);

async function searchKartverket(query: string, signal: AbortSignal): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    sok: query,
    fuzzy: 'true',
    utkoordsys: '4258',
    treffPerSide: '6',
    side: '1'
  });
  const res = await fetch(`${KARTVERKET_URL}?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`kartverket ${res.status}`);
  const data = (await res.json()) as { navn?: KartverketName[] };
  return (data.navn ?? [])
    .filter((n) => !PRIVATE_KARTVERKET_TYPES.has((n.navneobjekttype ?? '').trim().toLowerCase()))
    .map((n) => ({
      name: n['skrivemåte'] ?? '',
      context: [n.navneobjekttype, n.kommuner?.[0]?.kommunenavn, 'Norge'].filter(Boolean).join(' · '),
      lat: n.representasjonspunkt?.nord as number,
      lng: n.representasjonspunkt?.['øst'] as number
    }))
    .filter((r) => r.name && typeof r.lat === 'number' && typeof r.lng === 'number');
}

/**
 * SERVER-side lookup — talks to the upstream geocoders. Called from
 * /api/places, never from the browser (the CSP blocks third-party hosts, and
 * proxying keeps user IPs away from the upstream service).
 */
export async function searchPlacesServer(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  // Each provider gets its OWN deadline. Sharing one signal meant a slow
  // Photon burned the whole budget and then handed Kartverket an
  // already-aborted signal — killing the fallback in exactly the case it
  // exists for (Photon unreachable).
  const attempt = (ms: number) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));

  // «Photon svarte, men ingen av treffene lå i NO/SE» og «Photon svarte ikke»
  // er to helt forskjellige tilstander, og bare den siste er en grunn til å
  // spørre Kartverket. Da de var slått sammen (`if (results.length > 0) return`)
  // endte hvert søk utenfor dekningsområdet i Kartverkets fuzzy-søk, som ALDRI
  // svarer tomt: «Reykjavik» ble «Regavik, Vik i sjø · Bokn», «Paris» ble
  // «Paris, Jorde · Osen», og kartet fløy dit. Et selvsikkert feil svar er
  // verre enn ingen svar — det er nettopp det filhodet over lover å unngå.
  try {
    return await searchPhoton(trimmed, attempt(4000));
  } catch {
    // fall through to Kartverket (Norway only, but better than nothing)
  }

  if (signal?.aborted) return [];

  try {
    return await searchKartverket(trimmed, attempt(4000));
  } catch {
    return [];
  }
}

/** CLIENT-side lookup — goes through our own /api/places proxy. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  try {
    const res = await fetch(`/api/places?q=${encodeURIComponent(trimmed)}`, {
      signal: signal ?? AbortSignal.timeout(6000)
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { places?: PlaceResult[] };
    return data.places ?? [];
  } catch {
    return [];
  }
}
