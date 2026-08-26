/**
 * GPX 1.0/1.1 INN: veipunktene i en fil brukeren har eksportert fra en annen
 * app (Svampguiden+, Garmin, Organic Maps, UT.no). Motstykket til lag-gpx.ts.
 *
 * ── HVORFOR PARSINGEN SKJER I NETTLESEREN, ALDRI PÅ SERVEREN ────────────────
 *
 * XML fra en vilkårlig fil er angrepsflate, og en XML-parser på serveren er
 * det klassiske stedet det går galt (XXE: en fil kan be parseren hente
 * ressurser fra nettet eller fra filsystemet). `DOMParser` i nettleseren
 * følger ikke eksterne entiteter, og fila når aldri infrastrukturen vår eller
 * loggene våre. Serveren tar imot ferdig validert JSON og ingenting annet.
 *
 * Bonus: en ødelagt fil feiler på brukerens egen enhet, der hen kan se hva som
 * er galt, i stedet for som en 400 fra et endepunkt.
 *
 * Taket på filstørrelse (MAKS_FILSTORRELSE_BYTES) må sjekkes av KALLSTEDET før
 * teksten sendes hit — en sporlogg på 40 MB skal ikke i det hele tatt bli en
 * streng i minnet på en gammel telefon.
 */

import {
  MAKS_VEIPUNKTER,
  renseTekst,
  gyldigKoordinat,
  gyldigTid,
  MAKS_NAVN,
  MAKS_NOTAT,
  type Veipunkt
} from '@/lib/steder/veipunkt';

export type GpxFeil =
  /** Fila lot seg ikke parse som XML i det hele tatt. */
  | 'ugyldig-xml'
  /** Gyldig XML, men rotelementet er ikke <gpx>. */
  | 'ikke-gpx'
  /** Kjøres et sted uten DOMParser. Skal ikke skje i nettleseren. */
  | 'ingen-domparser';

export interface GpxLesing {
  veipunkter: Veipunkt[];
  /** Antall <wpt> i fila, før forkasting og avkorting. */
  funnet: number;
  /** Punkter forkastet fordi koordinaten manglet eller var ugyldig. */
  ugyldige: number;
  /** Punkter kuttet av taket på MAKS_VEIPUNKTER. */
  avkortet: number;
  /**
   * Punkter i <trk>/<rte> som IKKE importeres. Tallet finnes for å kunne SI
   * det: stille avkorting av en fil brukeren tror er komplett, leses som
   * datatap.
   */
  sporpunkter: number;
  feil: GpxFeil | null;
}

function tom(feil: GpxFeil | null): GpxLesing {
  return { veipunkter: [], funnet: 0, ugyldige: 0, avkortet: 0, sporpunkter: 0, feil };
}

/**
 * Teksten i et direkte barneelement, uavhengig av namespace-prefiks.
 *
 * getElementsByTagName ville også funnet elementer lenger nede i treet — og
 * <wpt> kan inneholde <extensions> med app-spesifikke felt som selv har et
 * <name>. Da hadde stedet fått navnet til utvidelsen.
 */
function barnetekst(element: Element, navn: string): string | null {
  for (const barn of Array.from(element.children)) {
    if (barn.localName.toLowerCase() === navn) return barn.textContent;
  }
  return null;
}

export function lesGpx(xml: string): GpxLesing {
  if (typeof DOMParser === 'undefined') return tom('ingen-domparser');

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch {
    return tom('ugyldig-xml');
  }

  // Nettleserne KASTER ikke på ugyldig XML — de returnerer et dokument som
  // inneholder et <parsererror>-element. Uten denne sjekken ser en ødelagt fil
  // ut som en fil helt uten veipunkter.
  if (doc.getElementsByTagName('parsererror').length > 0) return tom('ugyldig-xml');

  const rot = doc.documentElement;
  if (!rot || rot.localName.toLowerCase() !== 'gpx') return tom('ikke-gpx');

  const sporpunkter =
    doc.getElementsByTagNameNS('*', 'trkpt').length + doc.getElementsByTagNameNS('*', 'rtept').length;

  const wpts = Array.from(doc.getElementsByTagNameNS('*', 'wpt'));
  const veipunkter: Veipunkt[] = [];
  let ugyldige = 0;

  for (const wpt of wpts) {
    const koordinat = gyldigKoordinat(wpt.getAttribute('lat'), wpt.getAttribute('lon'));
    if (!koordinat) {
      ugyldige++;
      continue;
    }
    // <cmt> som reserve: enkelte eksportører (blant annet eldre Garmin-enheter)
    // legger brukerens tekst der og lar <name> stå som «WPT001».
    const navn = renseTekst(barnetekst(wpt, 'name'), MAKS_NAVN) ?? renseTekst(barnetekst(wpt, 'cmt'), MAKS_NAVN);
    veipunkter.push({
      name: navn,
      note: renseTekst(barnetekst(wpt, 'desc'), MAKS_NOTAT),
      latitude: koordinat.latitude,
      longitude: koordinat.longitude,
      waypointTime: gyldigTid(barnetekst(wpt, 'time'))
    });
  }

  const avkortet = Math.max(0, veipunkter.length - MAKS_VEIPUNKTER);

  return {
    veipunkter: avkortet > 0 ? veipunkter.slice(0, MAKS_VEIPUNKTER) : veipunkter,
    funnet: wpts.length,
    ugyldige,
    avkortet,
    sporpunkter,
    feil: null
  };
}
