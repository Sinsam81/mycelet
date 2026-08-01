/**
 * Rasteret lagrer ÉN FLIS PER ART PER RUTE. Kalt uten artsfilter returnerer
 * `get_prediction_tiles_in_bounds` derfor alle artene på samme koordinat — i
 * praksis sju rader med nøyaktig samme `center_lat`/`center_lng`.
 *
 * Det ga to feil som begge slo ut for alle brukere, hver dag:
 *
 *  1. Kartet tegnet sju sirkler oppå hverandre. RPC-en sorterer `score DESC`,
 *     og Leaflet tegner i den rekkefølgen den får dem, så den LAVESTE arten ble
 *     tegnet sist og lå øverst. Peker du på et sted fikk du systematisk den
 *     dårligste arten: 1. august 2026 sto det «2/100» på Nesodden, som var
 *     vanlig morkel. Kantarell på samme rute lå på 60.
 *
 *  2. /api/prediction tok konfidensvektet snitt over alle radene i boksen —
 *     altså på tvers av arter. Kantarell 60 og morkel 2 ble til 19, «svake
 *     forhold», midt i kantarellsesongen.
 *
 * Snittet på tvers av arter er ikke en størrelse noen spør om. En sopplukker
 * spør «er det verdt å dra ut her nå?», og svaret styres av den BESTE arten som
 * går akkurat nå — ikke av gjennomsnittet av alle, der det alltid ligger arter
 * utenfor sesong og drar ned. Derfor: kollaps til beste art per rute, og si
 * hvilken art det er. Tallet er uendret — det er den samme lagrede scoren — men
 * det får endelig en etikett som sier hva det gjelder.
 *
 * Merk at dette IKKE påstår noe mer om HVOR soppen står. Den romlige delen av
 * modellen har en ærlig AUC rundt 0,52. Det som er validert er tidsdelen: NÅR
 * en art går. Å navngi arten flytter tallet fra den svake påstanden til den
 * sterke.
 */

export interface CollapsibleTile {
  center_lat: number;
  center_lng: number;
  score: number;
  species_id?: number | null;
}

/**
 * Nøkkelen må tåle at samme rute kommer tilbake med bittesmå flyttallsavvik
 * mellom kall. Rasteret ligger på hele hundredeler, så fem desimaler er rikelig
 * presist og samtidig stabilt.
 */
function cellKey(tile: CollapsibleTile): string {
  return `${tile.center_lat.toFixed(5)},${tile.center_lng.toFixed(5)}`;
}

/**
 * Én flis per geografisk rute: den med høyest score.
 *
 * Rekkefølgen inn bevares for rutene (første gang en rute dukker opp bestemmer
 * plassen dens), slik at en kaller som allerede har sortert på score får en
 * sortert liste ut.
 *
 * Uavgjort brytes på lavest `species_id`, ikke på hvem som kom først. Det er med
 * vilje: to arter kan ha samme avrundede score, og da skal kartet vise det samme
 * navnet ved hver panorering i stedet for å bytte mellom to like gode arter.
 */
export function bestTilePerCell<T extends CollapsibleTile>(tiles: readonly T[]): T[] {
  const best = new Map<string, T>();

  for (const tile of tiles) {
    const key = cellKey(tile);
    const current = best.get(key);
    if (!current) {
      best.set(key, tile);
      continue;
    }
    if (tile.score > current.score) {
      best.set(key, tile);
      continue;
    }
    if (tile.score === current.score) {
      const a = tile.species_id ?? Number.POSITIVE_INFINITY;
      const b = current.species_id ?? Number.POSITIVE_INFINITY;
      if (a < b) best.set(key, tile);
    }
  }

  return [...best.values()];
}
