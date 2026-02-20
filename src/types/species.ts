export type Edibility = 'edible' | 'conditionally_edible' | 'inedible' | 'toxic' | 'deadly';

export interface Species {
  id: number;
  norwegian_name: string;
  latin_name: string;
  description: string | null;
  habitat: string[] | null;
  season_start: number;
  season_end: number;
  edibility: Edibility;
}

export interface SpeciesPhoto {
  id: string;
  species_id: number;
  image_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  is_primary: boolean;
}
