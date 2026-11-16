/**
 * Felles for forsidekortene som henter gjennom appens QueryClient
 * (BestRegionsCard, MushroomDayCard): hva en feilet henting er, og når den er
 * verdt et forsøk til.
 */

/** Et svar som ikke var 2xx. Statusen avgjør om det er verdt å prøve igjen. */
export class Hentefeil extends Error {
  readonly status: number;
  constructor(hva: string, status: number) {
    super(`${hva} svarte ${status}`);
    this.name = 'Hentefeil';
    this.status = status;
  }
}

/**
 * Nettverksfeil og 5xx er verdt et forsøk til. Et 4xx er det ikke: det er ruta
 * som sier nei (429 fra frekvensgrensa, først og fremst, eller 400 for en
 * posisjon den ikke godtar), og å spørre en gang til med ett sekunds mellomrom
 * gjør bare køen lengre.
 *
 * @param antallFeil hvor mange ganger hentingen har feilet til nå (0 ved første feil)
 * @param maksNyeForsok hvor mange nye forsøk som tillates etter det første
 */
export function skalProveIgjen(antallFeil: number, feil: unknown, maksNyeForsok: number): boolean {
  if (feil instanceof Hentefeil && feil.status >= 400 && feil.status < 500) return false;
  return antallFeil < maksNyeForsok;
}
