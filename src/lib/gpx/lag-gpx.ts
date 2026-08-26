/**
 * GPX 1.1-eksport av brukerens EGNE funn som veipunkter.
 *
 * Fra kartbackloggen («Norwegians expect it from UT.no») og NO/SE-analysen
 * (Svampguiden+ shipper GPX for soppsteder — de mest betalingsvillige
 * brukerne forventer det). Kun veipunkter: sporlogging er et eget
 * backlogg-punkt, og import har ikke noe mål å importere TIL ennå.
 *
 * Personvernrammen: generatoren mater kun fra eierens egne rader (owner-RLS
 * på findings-tabellen), der eksakte koordinater er brukerens rett — samme
 * presedens som GDPR-eksporten i /api/me/export. Andres funn er strukturelt
 * utilgjengelige (public_findings-viewet maskerer koordinatene), og ingen
 * eksportvei skal noensinne bygges på det viewet.
 *
 * Ren strenggenerering uten bibliotek: GPX 1.1 er lite nok til at et
 * XML-bibliotek bare ville vært en ny leveransekjede å stole på.
 */

export interface GpxVeipunkt {
  latitude: number;
  longitude: number;
  /** Veipunktnavnet — artsnavn + dato, bygget av kallstedet. */
  name: string;
  /** ISO-tidspunkt (found_at). Utelates hvis ugyldig. */
  time?: string | null;
  /** Stedsnavn/notat. Utelates hvis tomt. */
  desc?: string | null;
  /**
   * Garmin-symbolnavnet. Funn er blå flagg; markerte steder (saved_places) er
   * grønne, slik at de to slagene punkter er til å skille fra hverandre i
   * Garmin, Organic Maps og UT.no — og ved en senere reimport hit.
   */
  sym?: string | null;
}

/**
 * Brukertekst kan inneholde <, & og anførselstegn — rått ville det knekt
 * XML-en. Kontrolltegn under U+0020 (unntatt tab/LF/CR) er dessuten ULOVLIGE
 * i XML 1.0 uansett skrivemåte — de kan ikke escapes, bare fjernes. Ett
 * innlimt Word-tegn (typisk U+000B) i ETT notat ville ellers gjort hele fila
 * uleselig for Garmin/Organic Maps, uten noe hint om hvilket notat.
 */
export function escapeXml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Koordinater med punktum og seks desimaler (~11 cm), uansett locale —
 * toLocaleString-komma ville gitt en GPX ingen GPS-enhet leser.
 */
function koordinat(n: number): string {
  return n.toFixed(6);
}

function gyldigTid(time: string | null | undefined): string | null {
  if (!time) return null;
  const t = Date.parse(time);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

export function lagGpx(veipunkter: GpxVeipunkt[]): string {
  const wpts = veipunkter
    .filter((v) => Number.isFinite(v.latitude) && Number.isFinite(v.longitude))
    .map((v) => {
      const tid = gyldigTid(v.time);
      const desc = v.desc?.trim();
      // Elementrekkefølgen er låst av GPX-skjemaet: time før name før desc.
      return [
        `  <wpt lat="${koordinat(v.latitude)}" lon="${koordinat(v.longitude)}">`,
        tid ? `    <time>${tid}</time>` : null,
        `    <name>${escapeXml(v.name)}</name>`,
        desc ? `    <desc>${escapeXml(desc)}</desc>` : null,
        `    <sym>${escapeXml(v.sym?.trim() || 'Flag, Blue')}</sym>`,
        `  </wpt>`
      ]
        .filter((line): line is string => line != null)
        .join('\n');
    })
    .join('\n');

  return (
    [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<gpx version="1.1" creator="Mycelet - mycelet.com" xmlns="http://www.topografix.com/GPX/1/1">`,
      ...(wpts ? [wpts] : []),
      `</gpx>`
    ].join('\n') + '\n'
  );
}
