/**
 * Artene prediksjonstallet svarer FOR.
 *
 * Rasteret lagrer én flis per art per rute, og flisbanen i /api/prediction
 * kollapser til den beste arten på hvert sted (se collapse-tiles.ts). Tallet
 * panelet viser er derfor «hvor godt ligger den beste av DISSE artene an her
 * nå» — ikke soppforhold i sin alminnelighet.
 *
 * Fallback-banen, som svarer der det ikke finnes fliser, må stille nøyaktig
 * samme spørsmål over nøyaktig samme artsliste. Ellers viser samme panel to
 * ulike størrelser på samme 0-100-flate, avhengig av hvilken kodesti som
 * svarte — og brukeren har ingen måte å vite hvilken hen ser. Derfor bor lista
 * her, ett sted, og importeres av både generatoren og fallback-banen.
 *
 * Slås opp på latinsk navn, ikke rad-id: id-ene er ikke stabile mellom miljøer.
 * Fem høstarter + to vårmorkler gir kartet en art i sesong fra vår til sen
 * høst.
 */
export const PREDICTION_SPECIES_LATIN_NAMES: string[] = [
  'Cantharellus cibarius', // kantarell
  'Boletus edulis', // steinsopp
  'Craterellus tubaeformis', // traktkantarell
  'Hydnum repandum', // piggsopp
  'Craterellus cornucopioides', // svart trompetsopp
  'Morchella esculenta', // vanlig morkel (vår)
  'Morchella elata' // spiss morkel (vår)
];
