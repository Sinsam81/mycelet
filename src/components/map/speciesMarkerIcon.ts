/**
 * Funn-markørene på kartet, formet etter hva soppen faktisk ser ut som.
 *
 * Alle funn ble tegnet som identiske fargede prikker. Fargen bar spiselighet,
 * som er riktig — men den sa ingenting om HVA som ble funnet, og et kart med
 * tusen like prikker inspirerer ingen til å dra ut.
 *
 * ❌ EMOJI KAN IKKE LØSE DETTE. Unicode har nøyaktig to soppemoji: 🍄 (rød
 * fluesopp) og 🍄‍🟫 (brun sopp, Unicode 15.1). Det finnes ingen kantarell,
 * ingen steinsopp, ingen trompetsopp. I tillegg tegner hver plattform sine egne
 * — samme emoji ser helt ulik ut på iOS, Android og Windows — så vi ville ikke
 * engang kontrollert hvordan vår egen app så ut.
 *
 * Silhuetter løser det: kantarellens traktform, steinsoppens tykke stilk og
 * trompetsoppens horn ER genuint forskjellige former, og de leses i 16 piksler.
 *
 * GRUPPERT PÅ SLEKT, IKKE ART. 72 arter kan ikke ha 72 gjenkjennelige former, og
 * det ville vært en presisjon formen ikke bærer. Slekten er både det som
 * bestemmer formen og det en plukker faktisk tenker i: «en kantarell», «en
 * skrubb», «en riske».
 *
 * FARGEN ER FORTSATT SPISELIGHET. Formen sier hva det er, fargen sier om det kan
 * spises. De to må ikke slås sammen — en fluesoppform i grønt ville vært en
 * livsfarlig blanding av signaler.
 */

export type MarkerShape =
  | 'kantarell'
  | 'trakt'
  | 'trompet'
  | 'rorsopp'
  | 'skrubb'
  | 'skivesopp'
  | 'fluesopp'
  | 'pigg'
  | 'generisk';

/**
 * Slekt → form. Nøklene er slektsnavnet slik det står først i `latin_name`.
 * Ukjent slekt faller til 'generisk', som er en nøytral sopp-silhuett — aldri
 * til en form som ligner en spesifikk art.
 */
const SHAPE_BY_GENUS: Readonly<Record<string, MarkerShape>> = {
  Cantharellus: 'kantarell',
  Craterellus: 'trakt', // C. cornucopioides overstyres under — den er en trompet
  Boletus: 'rorsopp',
  Suillus: 'rorsopp',
  Leccinum: 'skrubb',
  Hydnum: 'pigg',
  Amanita: 'fluesopp',
  Lactarius: 'skivesopp',
  Russula: 'skivesopp',
  Agaricus: 'skivesopp',
  Cortinarius: 'skivesopp',
  Tricholoma: 'skivesopp',
  Laccaria: 'skivesopp',
  Clitocybe: 'skivesopp',
  Macrolepiota: 'skivesopp'
};

/** Arter der slekten ikke treffer formen. */
const SHAPE_BY_LATIN: Readonly<Record<string, MarkerShape>> = {
  'Craterellus cornucopioides': 'trompet' // svart trompetsopp er et horn, ikke en trakt
};

export function markerShapeFor(latinName: string | null | undefined): MarkerShape {
  if (!latinName) return 'generisk';
  const eksakt = SHAPE_BY_LATIN[latinName.trim()];
  if (eksakt) return eksakt;
  const genus = latinName.trim().split(/\s+/)[0];
  return SHAPE_BY_GENUS[genus] ?? 'generisk';
}

/**
 * Silhuettene, tegnet i et 24×24-rutenett og skalert ned av kalleren.
 *
 * Bevisst enkle: i 16 piksler over et detaljert topokart overlever bare den
 * grove omrisset. Detaljer blir grums.
 */
const PATHS: Readonly<Record<MarkerShape, string>> = {
  // BRED, LAV TRAKT med bølget munn — kantarell. Ingen hatt-på-stilk: kroppen
  // er sammenhengende og går fra vid munn ned til en smal fot.
  kantarell:
    'M2.6 7.6c1.9-1 2.8.8 4.2.8s2.3-1.5 3.9-1.5 2.6 1.5 4 1.5 2.5-1.8 4.4-.8c-.8 1.7-2.2 2.4-3.1 4-1.2 2.2-1.6 5.5-2.1 8.3-.2 1.3-.9 2.1-2.5 2.1s-2.3-.8-2.5-2.1c-.5-2.8-.9-6.1-2.1-8.3-.9-1.6-2.3-2.3-3.1-4z',
  // SMALERE TRAKT med tydelig hull i midten og lengre, tynn stilk —
  // traktkantarell. Hullet er det som skiller den fra kantarellen.
  trakt:
    'M5.2 6.6c1.4-.8 2-.2 3-.2s1.9-1 2.9-1 1.9 1 2.9 1 1.6-.6 3-.2c-.9 1.5-2.1 1.9-2.9 3.1-.5.8-.8 1.7-1 2.6h-4c-.2-.9-.5-1.8-1-2.6-.8-1.2-2-1.6-2.9-3.1zM10.9 13.4h2.2l-.7 7.2c-.1.9-.3 1.4-1 1.4s-.9-.5-1-1.4l-.7-7.2z',
  // HØYT, SMALT HORN — svart trompetsopp. Klart smalere og høyere enn de to
  // over; proporsjonen er det eneste som overlever i 16 px.
  trompet:
    'M7.4 4.4c1-.6 1.6-.2 2.3-.2s1.4-.8 2.3-.8 1.6.8 2.3.8 1.3-.4 2.3.2c-.9 1.6-2.2 2.6-2.9 4.6-.9 2.6-1.3 7.6-1.6 11.1-.1 1.3-.4 2-1.1 2s-1-.7-1.1-2c-.3-3.5-.7-8.5-1.6-11.1-.7-2-2-3-2.9-4.6z',
  // SVÆRT TYKK, BUTTET STILK og lav, bred hatt — steinsopp og annen rørsopp.
  // Kroppen er nesten like bred som hatten; det er kjennetegnet.
  rorsopp:
    'M12 22c-2.9 0-4.3-.9-4.3-2.3 0-1.9.7-3.6.9-5.8.1-1.4.6-2.1 3.4-2.1s3.3.7 3.4 2.1c.2 2.2.9 3.9.9 5.8 0 1.4-1.4 2.3-4.3 2.3zM2.8 10.6c0-3.6 4.1-6.2 9.2-6.2s9.2 2.6 9.2 6.2c0 1.6-4.1 2.5-9.2 2.5s-9.2-.9-9.2-2.5z',
  // TYNN, HØY STILK og bred, flat hatt — skrubb. Motsatt proporsjon av rørsoppen.
  skrubb:
    'M12 22.2c-1.1 0-1.6-.5-1.6-1.4 0-3 .3-5.9.4-8.8 0-.8.3-1.2 1.2-1.2s1.2.4 1.2 1.2c.1 2.9.4 5.8.4 8.8 0 .9-.5 1.4-1.6 1.4zM3.4 9.4c0-2.9 3.8-5 8.6-5s8.6 2.1 8.6 5c0 1.2-3.8 1.9-8.6 1.9s-8.6-.7-8.6-1.9z',
  // Klassisk hatt med skiver og slank stilk — kremle, riske, sjampinjong.
  skivesopp:
    'M12 22c-1.3 0-1.9-.5-1.9-1.5 0-2.3.4-4.4.5-6.6 0-.9.4-1.3 1.4-1.3s1.4.4 1.4 1.3c.1 2.2.5 4.3.5 6.6 0 1-.6 1.5-1.9 1.5zM3.9 11.2c0-3.8 3.6-6.6 8.1-6.6s8.1 2.8 8.1 6.6c0 1.3-3.6 1.9-8.1 1.9s-8.1-.6-8.1-1.9z',
  // Hatt med RING på stilken og knoll i foten — fluesopp. Formen skal skille seg
  // ut i seg selv, ikke bare på farge.
  fluesopp:
    'M12 22.4c-2 0-3.2-.8-3.2-1.9 0-.7.4-1.2 1-1.5-.2-1.5-.3-2.9-.3-4.2h5c0 1.3-.1 2.7-.3 4.2.6.3 1 .8 1 1.5 0 1.1-1.2 1.9-3.2 1.9zM7.8 12.9h8.4v1.9H7.8zM4 10.4c0-3.6 3.6-6.3 8-6.3s8 2.7 8 6.3c0 1.3-3.6 1.9-8 1.9s-8-.6-8-1.9z',
  // Uregelmessig hatt med pigger under — piggsopp.
  pigg:
    'M12 21.6c-1.2 0-1.8-.5-1.8-1.4 0-2 .4-3.9.4-5.8 0-.8.4-1.2 1.4-1.2s1.4.4 1.4 1.2c0 1.9.4 3.8.4 5.8 0 .9-.6 1.4-1.8 1.4zM4.2 11.4c.3-3.6 3.6-6.2 7.8-6.2s7.5 2.6 7.8 6.2c-1 .5-1.6-.8-2.6-.4s-1.2 1.5-2.2 1.5-1.3-1.3-2.3-1.3-1.3 1.3-2.3 1.3-1.2-1.1-2.2-1.5-1.6.9-2.6.4z',
  // Nøytral sopp — brukes når slekten er ukjent. Skal ikke ligne noe bestemt.
  generisk:
    'M12 21.8c-1.4 0-2-.5-2-1.5 0-2.2.4-4.2.5-6.3 0-.9.4-1.3 1.5-1.3s1.5.4 1.5 1.3c.1 2.1.5 4.1.5 6.3 0 1-.6 1.5-2 1.5zM4.4 11.4c0-3.7 3.4-6.4 7.6-6.4s7.6 2.7 7.6 6.4c0 1.3-3.4 2-7.6 2s-7.6-.7-7.6-2z'
};


/**
 * Markør-HTML for ett funn.
 *
 * `color` er spiselighetsfargen og males på silhuetten. Den hvite konturen er
 * det som gjør formen lesbar over både lys og mørk bakgrunn.
 */
export function markerHtml(shape: MarkerShape, color: string, size = 16): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `style="display:block;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.45))">` +
    `<path d="${PATHS[shape]}" fill="${color}" stroke="#fff" stroke-width="1.4" ` +
    `stroke-linejoin="round" paint-order="stroke"/></svg>`
  );
}
