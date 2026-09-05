/**
 * Kartet husker hvor du var og hva du lette etter.
 *
 * Før: hver tur innom biblioteket eller profilen nullstilte kartet — Oslo (eller
 * GPS-posisjonen) og tomt artsfelt. Brukeren som hadde valgt Bergen og kantarell
 * måtte finne begge deler på nytt for å komme tilbake. Ekstern gjennomgang
 * 2026-09-05 satte dette øverst på lista, og koden bekreftet det: ingen tilstand
 * overlevde at MushroomMap ble avmontert.
 *
 * Hva som huskes: senter, zoom, valgt art (id + visningsnavn) og et søkt sted.
 * Ingen posisjonshistorikk — bare det siste utsnittet, i localStorage på
 * brukerens egen enhet, i ett døgn. Etter det er det mer sannsynlig at neste tur
 * går fra der du står enn fra der du sist så, så GPS-en får rå igjen.
 *
 * En dyplenke (?lat&lng, ?art) vinner alltid over det huskede. Det huskede
 * overstyrer GPS-sentreringen ved oppstart, ellers ville det blitt yankt bort
 * i det øyeblikket posisjonen løste seg — samme problem som dyplenkene hadde.
 */

export const HUSKET_UTSNITT_NOKKEL = 'mycelet:kart-utsnitt-v1';
export const HUSKET_UTSNITT_LEVETID_MS = 24 * 3600_000;

export interface HusketSted {
  name: string;
  lat: number;
  lng: number;
}

export interface HusketUtsnitt {
  lat: number;
  lng: number;
  zoom: number;
  speciesId: number | null;
  speciesName: string | null;
  place: HusketSted | null;
  lagretAt: number;
}

const erTall = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const gyldigPunkt = (lat: unknown, lng: unknown): boolean =>
  erTall(lat) &&
  erTall(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180;

/** Tolker en lagret streng. Alt som ikke er akkurat riktig, forkastes — ingen NaN til Leaflet. */
export function tolkHusketUtsnitt(
  raw: string | null | undefined,
  naa: number = Date.now(),
): HusketUtsnitt | null {
  if (!raw) return null;
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  if (!gyldigPunkt(o.lat, o.lng)) return null;
  if (!erTall(o.zoom) || o.zoom < 3 || o.zoom > 20) return null;
  if (
    !erTall(o.lagretAt) ||
    naa - o.lagretAt > HUSKET_UTSNITT_LEVETID_MS ||
    o.lagretAt > naa + 60_000
  )
    return null;
  const speciesId =
    erTall(o.speciesId) && o.speciesId > 0 && Number.isInteger(o.speciesId)
      ? o.speciesId
      : null;
  const speciesName =
    speciesId && typeof o.speciesName === 'string' && o.speciesName.trim()
      ? o.speciesName.slice(0, 60)
      : null;
  let place: HusketSted | null = null;
  const p = o.place as Record<string, unknown> | null | undefined;
  if (
    p &&
    typeof p === 'object' &&
    gyldigPunkt(p.lat, p.lng) &&
    typeof p.name === 'string'
  ) {
    place = {
      name: p.name.slice(0, 60),
      lat: p.lat as number,
      lng: p.lng as number,
    };
  }
  return {
    lat: o.lat as number,
    lng: o.lng as number,
    zoom: Math.round(o.zoom),
    speciesId,
    speciesName,
    place,
    lagretAt: o.lagretAt,
  };
}

export function lesHusketUtsnitt(): HusketUtsnitt | null {
  if (typeof window === 'undefined') return null;
  try {
    return tolkHusketUtsnitt(
      window.localStorage.getItem(HUSKET_UTSNITT_NOKKEL),
    );
  } catch {
    return null;
  }
}

export function lagreHusketUtsnitt(u: Omit<HusketUtsnitt, 'lagretAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      HUSKET_UTSNITT_NOKKEL,
      JSON.stringify({ ...u, lagretAt: Date.now() }),
    );
  } catch {
    // Privat modus / full lagring: kartet virker som før, det bare husker ikke.
  }
}
