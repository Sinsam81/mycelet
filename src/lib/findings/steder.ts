import { getJoinedSpeciesName } from '@/lib/utils/species-name';
import { funnTilKort, type EgetFunnRad, type FunnIKort } from './mine-funn';

/**
 * Egne funn gruppert i STEDER — det /mine-steder viser som kort.
 *
 * Et sted er enten et navn brukeren har gitt (location_name, uten hensyn til
 * store og små bokstaver), eller en rute på omtrent én kilometer når funnet
 * ikke har noe navn. Ren funksjon: tekstene og klokka sendes inn, så den kan
 * testes uten next-intl og uten Date.
 *
 * Koordinatene til stedet (gjennomsnittet av funnene) blir med, fordi kortet
 * lenker til kartet. Funnene UNDER kortet får ingen — se mine-funn.ts.
 */

export type JoinedSpecies =
  | { norwegian_name: string | null; swedish_name: string | null }
  | { norwegian_name: string | null; swedish_name: string | null }[]
  | null;

/** Kolonnene siden henter for hvert funn. */
export interface FindingRow extends EgetFunnRad {
  location_name: string | null;
  latitude: number;
  longitude: number;
  found_at: string;
  species_name_override: string | null;
  mushroom_species: JoinedSpecies;
}

export interface Spot {
  /**
   * Stabil nøkkel for stedet: navnet eller ruta, aldri gjennomsnittsposisjonen.
   * Den flytter seg når et funn slettes, og en nøkkel som følger den ville fått
   * React til å bygge kortet på nytt — og lukke lista brukeren nettopp sto i.
   */
  key: string;
  label: string;
  unnamed: boolean;
  count: number;
  species: Map<string, number>;
  lastVisit: string;
  years: Set<number>;
  allPrivate: boolean;
  thumb: string | null;
  lat: number;
  lng: number;
  /** Funnene bak kortet, i den rekkefølgen radene kom (nyeste først fra spørringen). */
  finds: FunnIKort[];
}

export interface StedTekster {
  unknownSpecies: string;
  nearPlace: (lat: string, lng: string) => string;
  /** Funndatoen på leserens språk og i leserens tidssone. */
  foundDate: (iso: string) => string;
}

export function speciesName(
  row: { mushroom_species: JoinedSpecies; species_name_override: string | null },
  unknownLabel: string,
  locale: string
): string {
  return getJoinedSpeciesName(row.mushroom_species, locale) || row.species_name_override || unknownLabel;
}

export function groupFindings(rows: FindingRow[], labels: StedTekster, locale: string, nowMs: number): Spot[] {
  const groups = new Map<string, Spot>();
  for (const row of rows) {
    const named = !!row.location_name?.trim();
    const key = named
      ? `name:${row.location_name!.trim().toLowerCase()}`
      : `geo:${row.latitude.toFixed(2)},${row.longitude.toFixed(2)}`;
    let spot = groups.get(key);
    if (!spot) {
      spot = {
        key,
        label: named ? row.location_name!.trim() : labels.nearPlace(row.latitude.toFixed(3), row.longitude.toFixed(3)),
        unnamed: !named,
        count: 0,
        species: new Map(),
        lastVisit: row.found_at,
        years: new Set(),
        allPrivate: true,
        thumb: null,
        lat: 0,
        lng: 0,
        finds: []
      };
      groups.set(key, spot);
    }
    spot.count += 1;
    const name = speciesName(row, labels.unknownSpecies, locale);
    spot.finds.push(funnTilKort(row, { artsnavn: name, datoTekst: labels.foundDate(row.found_at) }, nowMs));
    spot.species.set(name, (spot.species.get(name) ?? 0) + 1);
    if (row.found_at > spot.lastVisit) spot.lastVisit = row.found_at;
    spot.years.add(new Date(row.found_at).getFullYear());
    if (row.visibility !== 'private') spot.allPrivate = false;
    if (!spot.thumb && row.image_url) spot.thumb = row.image_url;
    // Running average keeps the pin centred on the actual finds.
    spot.lat += (row.latitude - spot.lat) / spot.count;
    spot.lng += (row.longitude - spot.lng) / spot.count;
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || (a.lastVisit < b.lastVisit ? 1 : -1));
}
