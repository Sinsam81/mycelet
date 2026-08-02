import { MapFinding } from '@/types/finding';

/**
 * En rad fra `findings`-tabellen slik kartet henter den for EIERENS egne funn.
 *
 * Resten av kartet leser `public_findings` via `get_findings_in_bounds`. Det
 * viewet har `WHERE visibility IN ('public','approximate')` (migrasjon 029), så
 * private funn finnes ikke i det datasettet i det hele tatt — å filtrere det på
 * user_id ga «Kun mine funn» uten nettopp de funnene brukeren har skjermet.
 *
 * findings-tabellen har eier-RLS (migrasjon 015), så eieren får alle tre
 * synlighetene og de EKSAKTE koordinatene til sine egne funn. Det er samme
 * kilde /mine-steder allerede bruker, så de to sidene teller likt.
 */
export interface OwnFindingRow {
  id: string;
  user_id: string;
  species_id: number | null;
  latitude: number;
  longitude: number;
  found_at: string;
  quantity: string | null;
  notes: string | null;
  thumbnail_url: string | null;
  verification_status: string | null;
  is_zone_finding: boolean | null;
  zone_label: string | null;
  zone_precision_km: number | null;
  /** PostgREST gir den innebygde relasjonen som objekt (eller null). */
  mushroom_species: {
    norwegian_name: string | null;
    latin_name: string | null;
    edibility: MapFinding['edibility'];
  } | null;
}

/**
 * Rad → kartets funn-form. Koordinatene er de ekte: eieren skal se sine egne
 * private og omtrentlige funn der de faktisk ligger, ikke på et forskjøvet
 * display-punkt beregnet for andre brukere.
 */
export function ownFindingToMapFinding(row: OwnFindingRow, username: string): MapFinding {
  return {
    id: row.id,
    user_id: row.user_id,
    username,
    species_id: row.species_id,
    norwegian_name: row.mushroom_species?.norwegian_name ?? null,
    latin_name: row.mushroom_species?.latin_name ?? null,
    edibility: row.mushroom_species?.edibility ?? null,
    display_lat: row.latitude,
    display_lng: row.longitude,
    thumbnail_url: row.thumbnail_url,
    verification_status: row.verification_status,
    found_at: row.found_at,
    quantity: row.quantity,
    notes: row.notes,
    is_zone_finding: row.is_zone_finding,
    zone_label: row.zone_label,
    zone_precision_km: row.zone_precision_km
  };
}
