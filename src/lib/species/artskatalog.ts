import type { SupabaseClient } from '@supabase/supabase-js';
import type { Species } from '@/types/species';

/**
 * Artskatalogen til biblioteket (/species) — ÉN spørring, brukt to steder:
 *
 *  · på serveren (src/app/species/page.tsx), så den første HTML-en har kortene
 *    og lenkene til de 80 artssidene — for søkemotorer, AI-svartjenester og en
 *    leser hvis JavaScript ikke har kommet ennå,
 *  · i nettleseren (useSpecies), når serveren ikke fikk lista og kroken må
 *    hente selv — samme oppførsel som før siden ble rendret på serveren.
 *
 * Felles fil og ikke en eksport fra useSpecies.ts: den er en klientmodul, og en
 * serverkomponent som importerer noe derfra får en klientreferanse, ikke
 * verdien. Klienten som sendes inn avgjør hvem som spør: serverens (med
 * informasjonskapsler) eller nettleserens.
 */

/**
 * En rad i biblioteket: det kortet viser, pluss navnene søket leser.
 *
 * UTEN beskrivelsen. Ingenting i biblioteket leser den — ikke kortet, ikke
 * søket (species-search.ts søker bevisst aldri i den), ikke filtrene eller
 * ItemList-en — men den er det klart lengste feltet. Siden serveren gir lista
 * til klientdelen, gikk beskrivelsen til alle 80 artene med i hver HTML og i
 * hver RSC-last ved navigering til /species: mest bytes for ingenting, på
 * akkurat den svake forbindelsen i skogen der et trykk på «Arter» skal svare.
 */
export interface SpeciesListItem extends Omit<Species, 'description'> {
  english_name: string | null;
  synonyms_text: string | null;
}

export const ARTSLISTE_FELTER =
  'id,norwegian_name,swedish_name,latin_name,english_name,synonyms_text,habitat,season_start,season_end,edibility,primary_image_url';

/**
 * PostgREST svarer med høyst 1000 rader uansett. Taket sto på 200, og siden
 * overskriften teller radene, ville en katalog over 200 arter oppgitt 200 som
 * sin egen størrelse.
 */
export const ARTSLISTE_TAK = 1000;

export async function hentArtskatalog(supabase: Pick<SupabaseClient, 'from'>): Promise<SpeciesListItem[]> {
  const { data, error } = await supabase
    .from('mushroom_species')
    .select(ARTSLISTE_FELTER)
    // Fast rekkefølge fra basen; visningsrekkefølgen settes i filtrerArtsliste.
    .order('id')
    .limit(ARTSLISTE_TAK);
  if (error) throw error;
  return (data ?? []) as SpeciesListItem[];
}
