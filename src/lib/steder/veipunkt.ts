/**
 * Ett veipunkt på vei inn i saved_places — rensing, validering og
 * duplikatsjekk. Rene funksjoner uten DOM, fordi de kjøres BEGGE steder:
 * i nettleseren når fila leses (src/lib/gpx/les-gpx.ts) og i importruta
 * (/api/me/steder) når den samme lista kommer tilbake som JSON.
 *
 * At ruta validerer på nytt er ikke dobbeltarbeid. Klienten er ikke en del av
 * sikkerhetsmodellen: JSON-en kan sendes rett til ruta med hvilke som helst
 * verdier, uten at noen GPX-fil har vært innom.
 */

import { haversineKm } from '@/lib/utils/geo-distance';

/** Filstørrelsen sjekkes FØR parsing — se les-gpx.ts. */
export const MAKS_FILSTORRELSE_BYTES = 5 * 1024 * 1024;

/** Veipunkter per import. */
export const MAKS_VEIPUNKTER = 500;

/**
 * Steder per bruker totalt. Håndheves også av en trigger i migrasjon 055 —
 * tabellen kan nås direkte via PostgREST, så et tak i ruta alene er en
 * høflig anmodning. De to tallene MÅ være like.
 */
export const MAKS_STEDER_PER_BRUKER = 1000;

/**
 * To steder nærmere enn dette regnes som det samme stedet ved import.
 * 25 m er kortere enn GPS-unøyaktigheten under tett granskog, men langt nok
 * til at to nåler brukeren har satt bevisst ved siden av hverandre overlever.
 */
export const DUPLIKAT_METER = 25;

/** Samme tak som kolonnene i migrasjon 055. */
export const MAKS_NAVN = 120;
export const MAKS_NOTAT = 500;

export interface Veipunkt {
  /** Null når fila ikke ga stedet noe navn — kallstedet setter et på leserens språk. */
  name: string | null;
  note: string | null;
  latitude: number;
  longitude: number;
  waypointTime: string | null;
}

/** Et veipunkt som har vært gjennom validering: navnet er på plass. */
export interface ValidertVeipunkt extends Veipunkt {
  name: string;
}

/**
 * Kontrolltegn under U+0020 er ULOVLIGE i XML 1.0 uansett skrivemåte — de kan
 * ikke escapes, bare fjernes (samme grunn som i escapeXml i lag-gpx.ts). Uten
 * denne rensingen ville ett innlimt Word-tegn fra en importert fil kommet
 * tilbake i VÅR egen eksport og gjort den uleselig for Garmin.
 *
 * Kappingen teller KODEPUNKTER, ikke UTF-16-enheter: en emoji i et stedsnavn
 * er to enheter, og en naiv slice(0, 120) kan dele den midt i to. Resultatet er
 * et enslig surrogat — også det ulovlig i XML, og også det først synlig som en
 * ødelagt eksportfil lenge etterpå. char_length i Postgres teller kodepunkter,
 * så dette er dessuten samme tak som CHECK-en i migrasjon 055.
 */
export function renseTekst(verdi: unknown, maks: number): string | null {
  if (typeof verdi !== 'string') return null;
  const renset = verdi
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!renset) return null;
  const tegn = [...renset];
  return tegn.length <= maks ? renset : tegn.slice(0, maks).join('').trim();
}

/** ISO-tid, eller null. Ugyldige tidspunkter skal aldri stoppe en import. */
export function gyldigTid(verdi: unknown): string | null {
  if (typeof verdi !== 'string' || !verdi.trim()) return null;
  const t = Date.parse(verdi);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

/**
 * Tall fra en ukjent kilde, uten `Number()`-fellene.
 *
 * `Number(null)` er 0 og `Number('')` er 0. Et <wpt> som mangler lat-attributtet
 * ville derfor blitt et helt gyldig punkt på ekvator — og det er verre enn å
 * bli forkastet: brukeren ser et sted i lista, bare på feil sted i verden.
 * Fanget av testen «forkaster ugyldige koordinater og teller dem».
 */
function tall(verdi: unknown): number | null {
  if (typeof verdi === 'number') return Number.isFinite(verdi) ? verdi : null;
  if (typeof verdi !== 'string') return null;
  const tekst = verdi.trim();
  if (!tekst) return null;
  const n = Number(tekst);
  return Number.isFinite(n) ? n : null;
}

export function gyldigKoordinat(lat: unknown, lng: unknown): { latitude: number; longitude: number } | null {
  const latitude = tall(lat);
  const longitude = tall(lng);
  if (latitude === null || latitude < -90 || latitude > 90) return null;
  if (longitude === null || longitude < -180 || longitude > 180) return null;
  // 0,0 er «Null Island» — punktet en GPS uten fix skriver ut. Det er aldri et
  // sted noen har markert, og et kart som hopper til Guineabukta ser ut som en
  // feil i appen.
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

/**
 * Valider ett punkt fra en ukjent kilde. Returnerer null hvis punktet skal
 * forkastes — aldri en halvveis rad.
 *
 * `reservenavn` brukes når kilden ikke ga stedet noe navn. Navnet er NOT NULL i
 * basen, og et tomt navn i lista er ubrukelig for brukeren uansett.
 */
export function validerVeipunkt(rå: unknown, reservenavn: string): ValidertVeipunkt | null {
  if (!rå || typeof rå !== 'object') return null;
  const inn = rå as Record<string, unknown>;
  const koordinat = gyldigKoordinat(inn.latitude, inn.longitude);
  if (!koordinat) return null;
  const navn = renseTekst(inn.name, MAKS_NAVN) ?? renseTekst(reservenavn, MAKS_NAVN);
  if (!navn) return null;
  return {
    name: navn,
    note: renseTekst(inn.note, MAKS_NOTAT),
    latitude: koordinat.latitude,
    longitude: koordinat.longitude,
    waypointTime: gyldigTid(inn.waypointTime)
  };
}

export function avstandMeter(aLat: number, aLng: number, bLat: number, bLng: number): number {
  return haversineKm(aLat, aLng, bLat, bLng) * 1000;
}

/**
 * Deler kandidatene i «nye» og «duplikater» mot stedene brukeren har fra før.
 *
 * Sammenlikner også mot de allerede godkjente kandidatene, ikke bare mot
 * basen: en fil eksportert fra to apper kan inneholde det samme stedet to
 * ganger, og da skal det bli ett sted — ikke to som ligger 3 m fra hverandre.
 */
export function skillDuplikater<T extends { latitude: number; longitude: number }>(
  kandidater: T[],
  eksisterende: { latitude: number; longitude: number }[],
  meter: number = DUPLIKAT_METER
): { nye: T[]; duplikater: T[] } {
  const nye: T[] = [];
  const duplikater: T[] = [];
  const sett = [...eksisterende];
  for (const kandidat of kandidater) {
    const finnes = sett.some(
      (s) => avstandMeter(kandidat.latitude, kandidat.longitude, s.latitude, s.longitude) <= meter
    );
    if (finnes) {
      duplikater.push(kandidat);
    } else {
      nye.push(kandidat);
      sett.push(kandidat);
    }
  }
  return { nye, duplikater };
}
