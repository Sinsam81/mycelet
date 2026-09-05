/**
 * Bruksdager — det ene sporet vi har etter at en innlogget bruker faktisk så
 * soppforholdene (migrasjon 064).
 *
 * Hvorfor så lite: appens App Privacy-etikett og personvernerklæringen sier
 * hva vi samler. Én rad per bruker, dag og flate er nok til å svare på det
 * planen spør om — «kom de tilbake?» og «brukte de prognosen i to ulike
 * uker?» — uten posisjon, tidspunkt eller innhold.
 *
 * Dagen er Oslo-dato for både Norge og Sverige (samme sone). En bruker som
 * ser kartet 23:50 og 00:10 har brukt det to dager; det er greit, dagen er
 * ikke et presisjonsmål.
 */

export const FLATER = ['hjem', 'kart', 'omrade'] as const;
export type Flate = (typeof FLATER)[number];

export function erFlate(v: unknown): v is Flate {
  return typeof v === 'string' && (FLATER as readonly string[]).includes(v);
}

const OSLO = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Oslo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/** «2026-09-06» i Oslo-tid for et tidspunkt. sv-SE gir ISO-rekkefølge rett fra formatteren. */
export function osloDag(naar: Date): string {
  return OSLO.format(naar);
}

/**
 * ISO-uke for en dato på formen YYYY-MM-DD, som «2026-W36». Ren UTC-regning på
 * datoen selv (ingen tidssone), så «to ulike uker» betyr det samme i test og
 * produksjon.
 */
export function isoUke(dagIso: string): string {
  const d = new Date(`${dagIso}T00:00:00Z`);
  const dagNr = d.getUTCDay() || 7; // man=1 … søn=7
  d.setUTCDate(d.getUTCDate() + 4 - dagNr); // torsdagen i samme uke avgjør året
  const aar = d.getUTCFullYear();
  const forsteJan = Date.UTC(aar, 0, 1);
  const uke = Math.ceil(((d.getTime() - forsteJan) / 86_400_000 + 1) / 7);
  return `${aar}-W${String(uke).padStart(2, '0')}`;
}

/** Nøkkel for «har vi alt meldt denne i dag?» i sessionStorage — sparer ett kall per sidevisning. */
export function bruksdagNokkel(flate: Flate, omrade: string, dag: string): string {
  return `mycelet:bruksdag:${flate}:${omrade}:${dag}`;
}
