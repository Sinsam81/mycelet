import type { Metadata, ResolvingMetadata } from 'next';

/**
 * Egne fanetitler for sidene som før bare viste rot-layoutens
 * «Mycelet — soppkart, soppvarsel og AI-soppidentifikasjon».
 *
 * Femten sider — forumet, priser, innlogging, profilen, kartet, admin — så
 * like ut i fanen, i nettleserhistorikken og i et delt lenkekort. To mønstre
 * dekker dem, i tillegg til sideMetadata() for offentlige sider:
 *
 *  · privatSide(): sider bak innlogging eller med personlig innhold. Egen
 *    tittel, og `noindex` — robots.txt ber allerede roboter holde seg unna,
 *    men en side noen lenker til kan likevel havne i et søkeresultat uten
 *    at roboten har lest den. `noindex` er beskjeden som faktisk fjerner den.
 *  · medMal(): en layout som ligger rundt flere ruter (/forum, /identify).
 *    Tittelen MÅ gis som { default, template } — en ren streng ville
 *    nullstilt rot-layoutens «%s — Mycelet» for alt under. Se
 *    src/app/species/layout.tsx for samme felle.
 *
 * Titlene skrives UTEN merkenavn — rot-layoutens mal legger på «— Mycelet».
 */

/** Ikke i søkeresultater, og lenkene herfra er ikke noe å følge. */
export const IKKE_INDEKSER = { index: false, follow: false } as const;

export function privatSide(tittel: string): Metadata {
  return { title: tittel, robots: IKKE_INDEKSER };
}

/**
 * Gir en layouts metadata tittelen som { default, template }, med malen fra
 * foreldrene, slik at sidene under fortsatt får «— Mycelet» bak sin egen
 * tittel. Uten mal hos foreldrene (i en test, eller om rot-layouten endres)
 * står tittelen som den er.
 */
export async function medMal(side: Metadata, tittel: string, parent: ResolvingMetadata): Promise<Metadata> {
  const mal = (await parent).title?.template;
  return mal ? { ...side, title: { default: tittel, template: mal } } : side;
}

/**
 * Et kort utdrag av fritekst til en metabeskrivelse: mellomrom slått sammen,
 * kuttet ved en ordgrense med «…» når teksten er lengre enn `maks`.
 * Tom tekst gir null, så kallstedet kan falle tilbake på noe annet.
 */
export function utdrag(tekst: string | null | undefined, maks = 155): string | null {
  const ren = (tekst ?? '').replace(/\s+/g, ' ').trim();
  if (!ren) return null;
  if (ren.length <= maks) return ren;
  const kutt = ren.slice(0, maks - 1);
  const ordgrense = kutt.lastIndexOf(' ');
  const hel = ordgrense > maks / 2 ? kutt.slice(0, ordgrense) : kutt;
  return `${hel.replace(/[\s,.;:–—-]+$/, '')}…`;
}
