import type { ErrorEvent } from '@sentry/nextjs';

/**
 * Nettleseroversettelse (Chrome/Google Translate, Edge/Bing) bytter ut
 * tekstnodene i DOM-en bak ryggen på React. Neste gang React skal flytte eller
 * sette inn noe, finner den ikke naboen igjen og kaster
 *
 *   NotFoundError: Failed to execute 'insertBefore' on 'Node': The node before
 *   which the new node is to be inserted is not a child of this node.
 *
 * Sentry MYCELET-4: 8 hendelser på en måned, 0 identifiserte brukere, alltid
 * /auth/login og /auth/register (skjemasider som re-rendres ved tasting),
 * siste to fra én besøkende med nettleserspråk «ru» i Stockholm. Feilen er
 * «handled» — React tegner på nytt, og brukeren merker det som regel ikke.
 * Ikke vår kode, ingenting å rette; men den skal ikke ligge som «regresjon»
 * i hver utrulling. Vi merker derfor alle hendelser fra oversatte sider, og
 * dropper akkurat denne DOM-feilen når siden er oversatt. Andre feil på
 * oversatte sider sendes som før, med merket, så ekte feil ikke forsvinner.
 */

export type Oversetter = 'chrome' | 'edge' | 'annen';

/** Språkene siden serveres på; alt annet i <html lang> er satt av en oversetter. */
const EGNE_SPRAK = new Set(['nb', 'sv']);

type DokumentUtsnitt = {
  documentElement: { classList: { contains(navn: string): boolean }; lang?: string };
  querySelector(selector: string): unknown;
};

/** Hvilken oversetter som har rørt siden, eller null når den er urørt. */
export function erOversattAvNettleser(doc: DokumentUtsnitt | null | undefined): Oversetter | null {
  if (!doc) return null;
  const html = doc.documentElement;
  // Chrome/Google Translate setter denne klassen på <html> mens siden er oversatt.
  if (html.classList.contains('translated-ltr') || html.classList.contains('translated-rtl')) return 'chrome';
  // Edge/Bing Translator merker hver oversatte node med _msttexthash / _msthash.
  if (doc.querySelector('[_msttexthash], [_msthash]')) return 'edge';
  // Andre oversettere bytter som regel <html lang> til målspråket.
  const lang = (html.lang ?? '').toLowerCase().split('-')[0];
  if (lang && !EGNE_SPRAK.has(lang)) return 'annen';
  return null;
}

const DOM_STOY = /insertBefore|removeChild|not a child of this node|The object can not be found here/i;

/** Nettopp den DOM-feilen oversettelse gir — ingenting annet. */
export function erDomFeilFraOversettelse(event: ErrorEvent): boolean {
  for (const v of event.exception?.values ?? []) {
    const type = v.type ?? '';
    if (!/^(NotFoundError|HierarchyRequestError|DOMException)$/.test(type)) continue;
    if (DOM_STOY.test(v.value ?? '')) return true;
  }
  return false;
}
