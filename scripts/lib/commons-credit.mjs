/**
 * Wikimedia Commons-kreditering: utled filnavn fra en bilde-URL, og les
 * fotograf + lisens ut av `extmetadata`.
 *
 * Bakgrunn: artsbildene ble seedet med `license = 'Wikimedia Commons'` — som
 * er en KILDE, ikke en lisens — og uten fotograf. CC BY og CC BY-SA krever
 * navngiving av fotograf og lisens per bilde. Denne modulen er de rene
 * funksjonene backfill-skriptet trenger, lagt for seg selv slik at de kan
 * testes uten å snakke med hverken Supabase eller Commons.
 */

/**
 * Utleder Commons-filnavnet fra en upload.wikimedia.org-URL.
 *
 * To former i basen vår:
 *   .../wikipedia/commons/thumb/a/ab/Navn.jpg/640px-Navn.jpg   (thumb)
 *   .../wikipedia/commons/a/ab/Navn.jpg                        (original)
 *
 * Thumb-formen er den vanskelige: filnavnet er segmentet ETTER hash-mappene
 * og FØR skalerings-segmentet. Å ta siste segment (som er den nærliggende
 * feilen) gir «640px-Navn.jpg», som ikke finnes som fil på Commons — og for
 * SVG/PDF gir siste segment til og med feil filending («Navn.svg.png»).
 *
 * Returnerer navnet UTEN «File:»-prefiks, med mellomrom i stedet for
 * understrek (Commons behandler de to likt), eller null om URL-en ikke er en
 * Commons-fil vi kan slå opp.
 */
export function commonsFileNameFromUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') return null;

  let pathname;
  try {
    const parsed = new URL(url);
    // Bare upload.wikimedia.org. Kindwise-bildene og våre egne Supabase-
    // Storage-bilder skal ikke slås opp på Commons.
    if (parsed.hostname !== 'upload.wikimedia.org') return null;
    pathname = parsed.pathname;
  } catch {
    return null;
  }

  // Prosjektet må være `commons`. Lokale wiki-opplastinger (/wikipedia/en/…)
  // ligger IKKE på Commons, og et oppslag der ville gitt «missing» — verdt å
  // rapportere som uløst i stedet for å se ut som et tomt svar.
  const thumb = pathname.match(/^\/wikipedia\/commons\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)\/[^/]+$/);
  if (thumb) return decodeFileName(thumb[1]);

  const original = pathname.match(/^\/wikipedia\/commons\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)$/);
  if (original) return decodeFileName(original[1]);

  return null;
}

function decodeFileName(segment) {
  let name = segment;
  try {
    name = decodeURIComponent(segment);
  } catch {
    // Ugyldig prosentkoding — bruk segmentet rått heller enn å kaste.
  }
  name = name.replace(/_/g, ' ').trim();
  return name === '' ? null : name;
}

/** Commons-tittelen (med «File:»-prefiks) for et filnavn. */
export function commonsTitle(fileName) {
  return `File:${fileName}`;
}

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…'
};

/**
 * `extmetadata`-verdiene er HTML-fragmenter, ikke ren tekst: fotografen
 * kommer typisk som `<a href="//commons.wikimedia.org/wiki/User:X">X</a>`,
 * noen ganger pakket i `<span class="fn value">` eller en hel Creator-tabell.
 * Rendret rått ville brukeren sett taggene.
 */
export function stripHtml(value) {
  if (typeof value !== 'string') return '';
  return (
    value
      // Innholdet i style/script er ikke tekst — fjern det med tagene.
      .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      // Blokk-elementer skal bli mellomrom, ikke ordsammenskriving:
      // «<p>Foto</p><p>Kari</p>» må ikke bli «FotoKari». Inline-tagger
      // (<a>, <span>, <b>) fjernes derimot uten mellomrom — de står ofte
      // MIDT i et navn, og et mellomrom der ville delt navnet i to.
      .replace(
        /<\/?(?:br|hr|p|div|tr|li|td|th|h[1-6]|table|tbody|thead|tfoot|ul|ol|dl|dt|dd|blockquote|section|figure|figcaption)\b[^>]*>/gi,
        ' '
      )
      .replace(/<[^>]*>/g, '')
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
      .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function safeCodePoint(code) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/** Leser ut `.value` fra et extmetadata-felt, uansett om feltet mangler. */
function metaValue(extmetadata, key) {
  const raw = extmetadata?.[key]?.value;
  return typeof raw === 'string' ? raw : '';
}

/**
 * Rydder Commons' standardmaler ut av `Artist` og gjør den om til et navn.
 *
 * Feltet er ikke et navnefelt — det er fritekst-HTML, og en tredjedel av
 * artsbildene våre bruker en mal som pakker navnet inn i en setning. Rendret
 * rått blir krediteringslinja på artssiden til «Foto: This image was created
 * by user Ron Pastorino (Ronpast) at Mushroom Observer, a source for
 * mycological images. You can contact this user here. (CC BY-SA 3.0)».
 *
 * Malene, alle observert i vårt eget bildesett:
 *   · «No machine-readable author provided. X assumed (based on copyright claims).»
 *   · «The original uploader was X at English Wikipedia.»
 *   · «This image was created by user X at Mushroom Observer, …»
 *   · «original.jpg: X derivative work: Y»  (bearbeidet fil)
 *   · «User:X»
 *
 * Navnet beholdes ellers ordrett. Særlig: avsluttende punktum fjernes IKKE
 * generelt — «Pavel N.» er et ekte navn i settet vårt, og «Pavel N» ville
 * vært feil kreditering.
 */
/**
 * Verdier som står i `Artist`-feltet uten å være et navn.
 *
 * «voir ci-dessous / see below» peker på filsiden i stedet for å navngi noen
 * — den står på østerssoppbildet vårt, og skrevet inn ville krediteringslinja
 * lydt «Foto: voir ci-dessous / see below (CC BY 3.0)». Riktig svar er null:
 * da havner bildet i rapporten over det som må krediteres for hånd, i stedet
 * for å se kreditert ut.
 */
const POINTER_PHRASES = /\b(?:see below|voir ci-dessous|siehe unten|see file page|see source)\b/i;
const NOT_A_NAME = new Set(['unknown', 'unknown author', 'anonymous', 'anonyme', 'not specified', 'n/a', '-', '?']);

export function normalizePhotographer(value) {
  let name = stripHtml(value);
  if (name === '') return null;
  if (POINTER_PHRASES.test(name) || NOT_A_NAME.has(name.toLowerCase())) return null;

  // Bearbeidede filer starter med originalfilnavnet: «original.jpg: Foto
  // Fotograf derivative work: Bearbeider». Prefikset er en filreferanse, ikke
  // en del av navnet — men BEGGE personene skal fortsatt stå.
  name = name.replace(/^[^:]*\.(?:jpe?g|png|gif|tiff?|svg|webp):\s*/i, '');

  const noMachineAuthor = name.match(
    /^No machine-readable author provided\.\s*(.+?)\s+assumed\s*\(based on copyright claims\)\.?$/i
  );
  if (noMachineAuthor) name = noMachineAuthor[1];

  // «The original uploader was X at English Wikipedia.» — hvilken wiki bildet
  // kom fra er en del av krediteringen, så den beholdes i parentes.
  const originalUploader = name.match(/^The original uploader was\s+(.+?)\s+at\s+(.+?)\.?$/i);
  if (originalUploader) name = `${originalUploader[1]} (${originalUploader[2]})`;

  const mushroomObserver = name.match(/^This image was created by user\s+(.+?)\s+at\s+Mushroom Observer\b/i);
  if (mushroomObserver) name = mushroomObserver[1];

  // «User:X», og interwiki-formen «en:User:X» / «ja:User:X» som oppstår når
  // bildet er overført fra en språkwiki.
  name = name.replace(/^(?:[a-z][a-z0-9-]{0,11}:)?User:\s*/i, '').replace(/\s+/g, ' ').trim();
  return name === '' ? null : name;
}

/**
 * Fotograf + lisens fra `extmetadata`.
 *
 * Fotograf: kun `Artist`. `Credit` («source») ser ut som en reserve, men er
 * det ikke — verdiene der er «Own work», «Self-photographed», «Transferred
 * from en.wikipedia…» og filnavn. Ingen av dem er en person, og skrevet inn
 * som fotograf ville de vært en falsk kreditering. Mangler `Artist`, er
 * riktig svar null, og kalleren rapporterer bildet til manuell kreditering.
 *
 * Lisens: `LicenseShortName` er den menneskelesbare kortformen («CC BY-SA
 * 4.0», «Public domain»). `UsageTerms` og `License` er reserver; `License` er
 * maskinformen («cc-by-sa-4.0») og brukes bare når ingenting annet finnes.
 *
 * Tomme strenger normaliseres til null — en tom streng i basen ville rendret
 * som «Foto:  ()».
 */
export function creditFromExtMetadata(extmetadata) {
  const photographer = normalizePhotographer(metaValue(extmetadata, 'Artist'));
  const license =
    stripHtml(metaValue(extmetadata, 'LicenseShortName')) ||
    stripHtml(metaValue(extmetadata, 'UsageTerms')) ||
    stripHtml(metaValue(extmetadata, 'License'));

  return {
    photographer,
    license: license === '' ? null : license,
    // Commons sier selv om lisensen KREVER navngiving. Er den true og
    // fotografen mangler, er bildet i bruk uten å oppfylle vilkårene — det
    // skal rapporteres, ikke skjules.
    attributionRequired: metaValue(extmetadata, 'AttributionRequired').toLowerCase() === 'true'
  };
}

/**
 * Verdier som ser ut som en kreditering, men ikke er det. Seedingen skrev
 * `license = 'Wikimedia Commons'` (en kilde) og `photographer = 'Wikimedia
 * Commons'` (ikke en person) — begge skal regnes som «mangler» slik at
 * backfillen overskriver dem.
 */
const PLACEHOLDERS = new Set([
  'wikimedia commons',
  'wikimedia',
  'commons',
  'cc by-sa / public domain',
  'ukjent',
  'unknown'
]);

export function isPlaceholderCredit(value) {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (trimmed === '') return true;
  return PLACEHOLDERS.has(trimmed.toLowerCase());
}

/**
 * Skal en eksisterende verdi vike for en ny fra Commons?
 *
 * Regelen som gjør backfillen trygg å kjøre om igjen: en ekte, manuelt satt
 * kreditering røres ikke. Bare plassholderne fra seedingen (og tomme felt)
 * overskrives — med mindre `force` er satt.
 */
export function shouldWrite(existing, incoming, force = false) {
  if (existing === incoming) return false;
  if (incoming == null) {
    // Commons ga ingen verdi. En ekte kreditering slettes ALDRI av det — men
    // en plassholder skal bort: `photographer = 'Wikimedia Commons'` er en
    // påstand om en person som ikke finnes, og å la den stå igjen bare fordi
    // Commons manglet forfatter ville bevart nøyaktig den feilen backfillen
    // er til for å rette.
    return existing != null && isPlaceholderCredit(existing);
  }
  return force || isPlaceholderCredit(existing);
}

/**
 * Feltene som faktisk skal endres på én rad, eller null om ingenting endres.
 *
 * `columns` mapper de tre logiske feltene til kolonnenavn, siden de to
 * tabellene kaller dem forskjellige ting: species_photos har
 * photographer/license/source_url, mushroom_species har den denormaliserte
 * primary_image_*-tvillingen.
 */
export function buildPatch(row, credit, columns, force = false) {
  const patch = {};
  for (const [column, value] of [
    [columns.photographer, credit.photographer],
    [columns.license, credit.license],
    [columns.sourceUrl, credit.sourceUrl]
  ]) {
    if (shouldWrite(row[column], value, force)) patch[column] = value;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
