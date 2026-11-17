/**
 * Er flush-banneret den generelle «utenom sesongen»-beskjeden?
 *
 * Da skal forsidekortet IKKE tegne banneret: dagens dom rett over sier allerede
 * nøyaktig det samme (samme tittel og setning fra utenom-sesong-tekst.ts), og
 * fra desember til mai sto den derfor to ganger i samme kort. Kortet viser i
 * stedet én rad med lenker til det som faktisk er nyttig utenom sesongen.
 *
 * `reason` er det sikre signalet. Tittel-likheten er reserven for svar som ble
 * cachet før feltet fantes. «For kaldt akkurat nå» og «Fuktig, men kaldt»
 * (reason 'cold') og «Fuktig, men varmt» (reason 'warm') er egne opplysninger
 * midt i sesongen og skal fortsatt vises.
 *
 * NB: dette avgjøres i KORTET, ikke i API-et. /api/mushroom-forecast må
 * fortsette å sende banneret — PlaceForecastStrip (Mine steder) har flush som
 * sin eneste domstekst og ville blitt taus.
 */
export function erUtenomSesongFlush(
  flush: { status: string; title: string; reason?: string } | null | undefined,
  dagensTittel: string
): boolean {
  if (!flush || flush.status !== 'dormant') return false;
  if (flush.reason) return flush.reason === 'offSeason';
  return flush.title === dagensTittel;
}
