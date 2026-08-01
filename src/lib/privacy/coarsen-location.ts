/**
 * Grovkorning av posisjon før den forlater oss.
 *
 * Bakgrunn: /api/identify sendte brukerens eksakte latitude/longitude videre
 * til Kindwise. Det var opplyst i personvernerklæringen, men det var likevel
 * for mye. Hele produktløftet i Mycelet er at hemmelige soppsteder er trygge —
 * og et eksakt punkt ER stedet. En serie identifikasjoner med eksakt posisjon
 * tegner dessuten opp bevegelsesmønsteret til brukeren hos en tredjepart.
 *
 * Hva leverandøren faktisk trenger posisjonen til, er å vekte artsforslag mot
 * hvilke arter som finnes i regionen. Det er en regional opplysning, ikke en
 * stedsopplysning. Én rute på ~11 km i nord–sør og 4–6 km i øst–vest svarer på
 * «hvilken del av Norden er dette» uten å svare på «hvor står soppen».
 *
 * Vi snapper til midten av en fast rute, ikke til nærmeste lavere hjørne.
 * Trunkering ville lekket hvilken vei brukeren ligger inne i ruta hvis man
 * sammenligner mange kall; midtpunktet er identisk for alle i samme rute.
 */

/**
 * Rutestørrelse i grader. 0,1° breddegrad er ~11,1 km overalt. 0,1° lengdegrad
 * krymper mot polene: ~5,9 km ved Göteborg (58°N), ~5,6 km ved Oslo (60°N),
 * ~5,0 km ved Trondheim (63°N), ~3,9 km ved Tromsø (70°N).
 *
 * Selv den smaleste ruta er altså nesten fire kilometer bred. Den inneholder en
 * hel bygd — aldri ett voksested. Merk at brukerrettet tekst må oppgi spennet,
 * ikke ett tall: «11 x 6 km» ville vært en overdrivelse for nordnorske brukere,
 * og et personvernløfte skal ikke love mer beskyttelse enn det gir.
 */
export const COARSE_GRID_DEGREES = 0.1;

export interface CoarseLocation {
  latitude: number;
  longitude: number;
}

/** Snapper én akse til midten av sin rute. */
function snapToCellCentre(value: number, step: number): number {
  const centre = Math.floor(value / step) * step + step / 2;
  // Flyttallsaritmetikk gir 59.150000000000006; fire desimaler er ~11 m og
  // langt under rutestørrelsen, så det påvirker ikke personvernet.
  return Number(centre.toFixed(4));
}

/**
 * Gjør et eksakt punkt om til midten av ruta det ligger i.
 *
 * Returnerer null hvis inputen ikke er et brukbart koordinat — da skal det
 * ikke sendes noe posisjon i det hele tatt.
 */
export function coarsenLocation(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): CoarseLocation | null {
  if (latitude == null || longitude == null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;

  return {
    latitude: snapToCellCentre(latitude, COARSE_GRID_DEGREES),
    longitude: snapToCellCentre(longitude, COARSE_GRID_DEGREES)
  };
}
