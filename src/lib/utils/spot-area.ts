/**
 * Hvor stort søkeområdet på kartet skal være.
 *
 * ═══ TRE FORSØK, OG HVORFOR DET TREDJE ER RIKTIG ═══
 *
 * 1. NUMMERERT NÅL. Sa «gå nøyaktig hit, og dette er det beste stedet». Ingen av
 *    de to påstandene bæres av dataene. Sindre gikk til punktene i felten og
 *    fant ingenting.
 *
 * 2. HELE SAMPLINGSCELLEN (1,4–10 km bred). Ment som ærlighet om oppløsningen.
 *    Ga det motsatte av informasjon: på Nesodden dekket områdene hele halvøya,
 *    og et kart som markerer alt markerer ingenting.
 *
 *    Det var heller ikke riktigere. Å fylle hele cellen påstår at ruta er
 *    ENSARTET — at alle 3,6 km er like gode. Det har vi ikke grunnlag for.
 *    Cellen er bare der rutenettet tilfeldigvis samplet.
 *
 * 3. ÉN KVADRATKILOMETER. Selve MÅLINGEN er lokal — NIBIO-oppslaget skjer i
 *    punktet, på et 16 m raster. Det som er stort er USIKKERHETEN, og den hører
 *    hjemme i teksten («soppen står flekkvis inne i det»), ikke i en flate som
 *    dekker landskapet.
 *
 *    En kvadratkilometer er omtrent så langt en sopplukker rekker å lete
 *    grundig på en formiddag. Det gjør sirkelen til en oppgave i stedet for en
 *    påstand.
 */

/** Radius som gir ~1 km²: π · 564² ≈ 1 000 000 m². */
export const SEARCH_AREA_RADIUS_M = 564;

/** Arealet sirkelen dekker, i km². Brukes av testen som holder tallet fast. */
export function searchAreaKm2(radiusM: number = SEARCH_AREA_RADIUS_M): number {
  return (Math.PI * radiusM * radiusM) / 1_000_000;
}
