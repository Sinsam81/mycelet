/**
 * Presisjonen et koordinat sendes med til en ekstern stedstjeneste.
 *
 * Bakgrunn: når en bruker lagret et funn, sendte /api/findings det URØRTE
 * punktet videre til MET Frost, NIBIO SR16, Kartverket og CORINE — uten å se
 * på `visibility`. Ingen andre brukere så det, og appen viste det ikke, men
 * produktløftet er at hemmelige soppsteder ikke forlater appen, og her la det
 * nøyaktige punktet seg i tilgangsloggene til fire eksterne institusjoner. Den
 * samme runden gjelder /api/spot-feedback.
 *
 * Motsatt av `coarsenLocation` (0,1°-ruter, brukt mot Kindwise) skal denne
 * IKKE ødelegge oppslaget: vær og skog er egenskaper ved området, ikke ved
 * punktet. Tre desimaler er ~111 m i nord–sør og ~50-60 m i øst–vest i
 * Norden — mindre enn boksen NIBIO uansett spør med (SR16 bruker ±0,001°,
 * altså ~220 x 110 m), og langt under avstanden til nærmeste værstasjon. Svaret
 * blir derfor det samme, mens punktet som forlater oss ikke lenger peker på ett
 * voksested.
 *
 * Tre desimaler er ikke anonymisering — det er å slutte å sende mer enn
 * nødvendig. Skal et punkt skjules for en tredjepart, bruk coarsenLocation.
 */
export const PROVIDER_DECIMALS = 3;

export interface ProviderPoint {
  lat: number;
  lon: number;
}

/** Runder et punkt til presisjonen eksterne stedsoppslag faktisk trenger. */
export function roundForProviderLookup(lat: number, lon: number): ProviderPoint {
  return {
    lat: Number(lat.toFixed(PROVIDER_DECIMALS)),
    lon: Number(lon.toFixed(PROVIDER_DECIMALS))
  };
}
