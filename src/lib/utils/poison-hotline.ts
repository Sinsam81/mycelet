/**
 * Fjerner telefonnummer til giftinformasjon som ligger bakt inn i tekst fra
 * databasen (`mushroom_species.symptoms` og `toxin_info`).
 *
 * Bakgrunn: symptomtekstene er skrevet på norsk, med «ring Giftinformasjonen
 * 22 59 13 00» inni selve setningen. På artssiden vises den teksten ØVERST i
 * den røde boksen — over den lokaliserte linja fra `Safety`-namespacet. En
 * svensk leser fikk dermed to motstridende nummer i samme boks, med det
 * norske først. 22 59 13 00 slått fra en svensk telefon når ingen, og
 * forsinkelsen er nettopp det symptomteksten er skrevet for å hindre.
 *
 * Nummeret skal komme ett sted fra: `Safety`-namespacet, som er oversatt
 * (NO: Giftinformasjonen 22 59 13 00 — SE: Giftinformationscentralen,
 * 112 ved akutt fare, ellers 010-456 67 00).
 *
 * VIKTIG bruksregel: bruk denne funksjonen KUN der den lokaliserte
 * giftinformasjonslinja vises i samme blokk. Ellers fjerner vi det eneste
 * nummeret leseren har, og et manglende nummer må aldri bli resultatet av
 * denne opprydningen.
 *
 * Merk også: funksjonen fjerner hele setningsleddet nummeret står i. Skriver
 * du ny databasetekst, hold oppfordringen om å ringe i sitt eget ledd — ikke
 * bland den med symptominformasjon som må overleve.
 */

/**
 * Kjente giftinformasjonsnummer som rene siffer. Vi sammenligner mot slutten
 * av sifferrekka, slik at både «22 59 13 00» og «+47 22 59 13 00» treffer.
 */
const HOTLINE_DIGITS = [
  '22591300', // Giftinformasjonen (NO)
  '0104566700', // Giftinformationscentralen (SE)
  '104566700' // samme, uten ledende null (+46 10 456 67 00)
];

/**
 * Kandidat til telefonnummer: sifferrekke som kan inneholde mellomrom, hardt
 * mellomrom, punktum, bindestrek og parenteser. Tankestrek (– —) og komma er
 * bevisst utelatt, slik at tallområder som «6–24 t» og «0,5–3 t» ikke leses
 * som telefonnummer.
 */
const PHONE_CANDIDATE = /\+?\d[\d\s ().-]{5,}\d/g;

/**
 * Skille mellom setningsledd: tankestrek eller bindestrek med luft rundt,
 * eller kolon/semikolon etterfulgt av mellomrom.
 */
const CLAUSE_SEPARATOR = /(\s+[—–-]\s+|\s*[:;]\s+)/;

function containsHotlineNumber(text: string): boolean {
  const candidates = text.match(PHONE_CANDIDATE);
  if (!candidates) return false;
  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, '');
    return HOTLINE_DIGITS.some((hotline) => digits.endsWith(hotline));
  });
}

/**
 * Fjerner leddet med giftinformasjonsnummeret fra én setning. Returnerer tom
 * streng hvis hele setningen bare var oppfordringen om å ringe.
 */
function stripFromSentence(sentence: string): string {
  const parts = sentence.match(/^([\s\S]*?)([.!?]*)(\s*)$/);
  if (!parts) return sentence;
  const [, body, terminator, trailingSpace] = parts;

  const segments = body.split(CLAUSE_SEPARATOR);
  let kept = '';
  for (let i = 0; i < segments.length; i += 2) {
    const clause = segments[i];
    if (!clause || !clause.trim()) continue;
    if (containsHotlineNumber(clause)) continue;
    const separator = i > 0 ? segments[i - 1] : '';
    kept = kept ? `${kept}${separator}${clause}` : clause;
  }

  if (!kept.trim()) return '';
  // Setningen kan ha mistet punktumet sitt sammen med det siste leddet.
  return `${kept.trimEnd()}${terminator || '.'}${trailingSpace}`;
}

export function stripPoisonHotline(text: string | null | undefined): string | null {
  if (!text) return null;
  if (!containsHotlineNumber(text)) return text;

  const sentences = text.match(/[^.!?\n]+[.!?]*\s*/g) ?? [text];
  const cleaned = sentences
    .map((sentence) => (containsHotlineNumber(sentence) ? stripFromSentence(sentence) : sentence))
    .join('')
    .replace(/[ \t ]{2,}/g, ' ')
    .trim();

  return cleaned || null;
}
