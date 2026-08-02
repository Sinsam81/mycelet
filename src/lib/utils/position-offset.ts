/**
 * «Juster posisjon (meter)» i registreringsskjemaet: flytt punktet litt før det
 * lagres, så det ekte stedet aldri forlater telefonen.
 *
 * KURSEN MÅ VÆRE TILFELDIG. Her sto `const angle = (45 * Math.PI) / 180;` — en
 * fast nordøstvektor. Forskyvningen var da ikke støy, men en konstant: ser noen
 * flere av samme brukers justerte funn, ligger alle skjøvet samme vei, og
 * vektoren kan trekkes fra for å nærme seg de sanne punktene. Databasens egen
 * `randomize_location` (001_initial_schema.sql:167) trekker `random() * 2 * pi()`
 * — samme form brukes her.
 *
 * Merk at avstanden bevisst holdes lik den brukeren valgte: det er tallet han
 * ser i skjemaet, og en tilfeldig avstand ville gjort løftet uklart. Det er
 * retningen som må være ukjent.
 */
export function applyPositionOffset(
  lat: number,
  lng: number,
  meters: number,
  /** Injiserbar for testene. Standard er Math.random. */
  random: () => number = Math.random
): { lat: number; lng: number } {
  if (!(meters > 0)) return { lat, lng };
  const angle = random() * 2 * Math.PI;
  const deltaLat = (meters / 111320) * Math.cos(angle);
  const deltaLng = (meters / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
  return { lat: lat + deltaLat, lng: lng + deltaLng };
}
