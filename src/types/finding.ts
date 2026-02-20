export interface MapFinding {
  id: string;
  user_id: string;
  username: string;
  species_id: number | null;
  norwegian_name: string | null;
  latin_name: string | null;
  edibility: 'edible' | 'conditionally_edible' | 'inedible' | 'toxic' | 'deadly' | 'unknown' | null;
  display_lat: number | null;
  display_lng: number | null;
  thumbnail_url: string | null;
  verification_status: string | null;
  found_at: string;
  quantity: string | null;
  notes: string | null;
  is_zone_finding?: boolean | null;
  zone_label?: string | null;
  zone_precision_km?: number | null;
}
