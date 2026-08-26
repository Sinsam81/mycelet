/**
 * Grov boks rundt Norge og Sverige, brukt av GBIF-importen.
 *
 * Importen spør GBIF med country=NO/SE, men poster med feilregistrerte
 * koordinater slipper likevel gjennom: produksjonsbasen har 21 rader på
 * nøyaktig (0, 0) og én der breddegraden er kopiert inn i lengdegraden
 * (60,795/60,795 — Uralfjellene). Den gamle koordinatsjekken godtok dem fordi
 * den bare så på ±90/±180.
 *
 * Radene teller inn i prediksjonens nærhets-tetthet og i det publiserte
 * antallet dokumenterte soppfunn. Boksen er bevisst romslig — den avviser bare
 * det som umulig kan være et nordisk funn.
 *
 * Ligger i en egen fil så den kan testes: selve importskriptet kjører hele
 * jobben ved import og kan ikke lastes inn i en test.
 */
export const NORDIC_BOX = { minLat: 54, maxLat: 72, minLng: 3, maxLng: 33 };

export function insideNordicBox(latitude, longitude) {
  // (0, 0) er allerede utenfor boksen, men nevnes eksplisitt fordi det er det
  // klassiske «manglende koordinat lest som null»-tilfellet — og det er det 21
  // av de 22 søppelradene i produksjon faktisk er.
  if (latitude === 0 && longitude === 0) return false;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= NORDIC_BOX.minLat &&
    latitude <= NORDIC_BOX.maxLat &&
    longitude >= NORDIC_BOX.minLng &&
    longitude <= NORDIC_BOX.maxLng
  );
}
