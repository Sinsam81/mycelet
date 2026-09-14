import { readLocal, writeLocal } from '@/lib/utils/safe-storage';

/**
 * Forsidekortet og kalenderen husker hvor du sist var.
 *
 * Hvorfor: forsidekortet er den ene flaten som vises ved hver åpning, og det
 * startet på Oslo for alle. Det spør med vilje aldri om posisjon selv (kartet
 * gjør det), og i iOS-skallet fantes ikke engang navigator.geolocation, så
 * «Sør-Norge» sto der ved hver kaldstart — også for en bruker i Bergen som
 * ga kartet posisjonstilgang for lenge siden. Kartet får en ekte GPS-posisjon
 * hos nesten alle som bruker det; den skrives hit, og kortet bruker den som
 * utgangspunkt neste gang, uten å vente på GPS eller vise en spinner.
 *
 * Hva som lagres: ETT punkt, avrundet til to desimaler (~1 km), og når det ble
 * skrevet. Ingen historikk. Prognosen er regional, og kortet runder uansett til
 * to desimaler før posisjonen legges i en URL — et finere punkt ville bare
 * vært et bevegelsesspor uten bruk. Levetid sju dager: etter en uke er det
 * like sannsynlig at neste tur går et annet sted, og da er standardområdet et
 * ærligere utgangspunkt enn en gammel posisjon.
 */

export const HUSKET_POSISJON_NOKKEL = 'mycelet:posisjon-v1';
export const HUSKET_POSISJON_LEVETID_MS = 7 * 24 * 3600_000;

export interface HusketPosisjon {
  lat: number;
  lng: number;
  /** Når posisjonen ble skrevet (epoch ms). */
  ts: number;
}

const erTall = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const gyldigPunkt = (lat: unknown, lng: unknown): boolean =>
  erTall(lat) && erTall(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

/** ~1 km: to desimaler, samme kornethet som forsidekortets forespørsel. */
export function grovPosisjon(lat: number, lng: number): { lat: number; lng: number } {
  return { lat: Number(lat.toFixed(2)), lng: Number(lng.toFixed(2)) };
}

/** Samme ~1 km-rute → samme forespørsel → samme prognose. Da trengs ingen ny henting. */
export function sammeRute(a: { lat: number; lng: number }, b: { lat: number; lng: number }): boolean {
  const ga = grovPosisjon(a.lat, a.lng);
  const gb = grovPosisjon(b.lat, b.lng);
  return ga.lat === gb.lat && ga.lng === gb.lng;
}

/** Det som faktisk skrives: grovkornet punkt + tidspunkt. Ren, så avrundingen kan testes. */
export function nyHusketPosisjon(lat: number, lng: number, naa: number = Date.now()): HusketPosisjon {
  return { ...grovPosisjon(lat, lng), ts: naa };
}

/** Tolker en lagret streng. Alt som ikke er akkurat riktig, forkastes — ingen NaN videre til prognosen. */
export function tolkHusketPosisjon(raw: string | null | undefined, naa: number = Date.now()): HusketPosisjon | null {
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
  if (!erTall(o.ts) || naa - o.ts > HUSKET_POSISJON_LEVETID_MS || o.ts > naa + 60_000) return null;
  return { lat: o.lat as number, lng: o.lng as number, ts: o.ts };
}

export function lesHusketPosisjon(naa: number = Date.now()): HusketPosisjon | null {
  return tolkHusketPosisjon(readLocal(HUSKET_POSISJON_NOKKEL), naa);
}

/** Skrives der kartet får en ekte GPS-posisjon, og av forsidekortet selv. Stille ved blokkert lagring. */
export function lagreHusketPosisjon(lat: number, lng: number, naa: number = Date.now()): void {
  if (!gyldigPunkt(lat, lng)) return;
  writeLocal(HUSKET_POSISJON_NOKKEL, JSON.stringify(nyHusketPosisjon(lat, lng, naa)));
}
