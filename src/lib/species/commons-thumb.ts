/**
 * Bredden på artsbildene fra Wikimedia Commons.
 *
 * Alle artsbildene er Commons-filer, lagret i basen som miniatyr-URL-er med
 * fast bredde: halvparten `…/330px-Navn.jpg`, halvparten `…/500px-Navn.jpg`.
 * Hovedbildet på artssiden fyller en kvadratisk rute på rundt 600 CSS-piksler
 * på en skjerm og 360 på en telefon med tre piksler per punkt — altså over
 * 1000 fysiske piksler. En kilde på 330 ble strukket to–tre ganger, og bildet
 * man sammenligner soppen sin med var synlig uskarpt.
 *
 * Bredden står i selve URL-en, så en skarpere utgave av SAMME fil er bare et
 * annet tall i siste ledd — samme vert (upload.wikimedia.org, som CSP-en
 * allerede slipper gjennom), samme fil, samme fotograf og lisens.
 *
 * TO TING SOM ER MÅLT MOT COMMONS (16. november 2026), IKKE ANTATT:
 *
 * 1. Bare faste trinn virker. `…/700px-…` svarer 400; `330`, `500`, `960` og
 *    `1280` svarer 200. Derfor klemmes alle bredder til COMMONS_TRINN.
 * 2. Et trinn BREDERE enn originalen gir ikke feil — Commons skalerer opp.
 *    `Birkenpilz01.jpg` er 400 piksler bred; `…/1280px-Birkenpilz01.jpg` svarer
 *    200 med et bilde på 1280 × 1898 og 393 kB, mot 71 kB for 330-utgaven.
 *    Fem ganger så mange byte, ingen nye detaljer. Derfor tar `commonsSrcSet`
 *    originalens bredde som tak når den er kjent (se artsbilde.ts).
 *
 * Ren: ingen nettverkskall, ingen tabell. Alt som ikke er en Commons-miniatyr
 * (Supabase Storage, Kindwise, null) går uendret gjennom.
 */

const COMMONS_VERT = 'upload.wikimedia.org';

/** Breddene Commons lager miniatyrer i. Alt annet svarer 400. */
export const COMMONS_TRINN = [330, 500, 960, 1280] as const;

/** Breddene hovedbildet kan be om, i tillegg til den som er lagret. */
const SRCSET_TRINN = [500, 960, 1280] as const;

interface CommonsMiniatyr {
  /** Alt foran siste ledd, med avsluttende skråstrek. */
  mappe: string;
  /** Det som står foran bredden i siste ledd («», «lossy-page1-»). */
  prefiks: string;
  bredde: number;
  /** Resten av siste ledd etter «NNNpx-», pluss eventuell spørring. */
  rest: string;
  /** Filnavnet på Commons, dekodet og med mellomrom («Boletus edulis IT.jpg»). */
  filnavn: string;
}

/**
 * Plukker fra hverandre en miniatyr-URL uten å røre kodingen i den: delene
 * settes sammen igjen tegn for tegn, så «Fr%C3%BChjahrslorchel.JPG» forblir
 * akkurat det.
 */
function tolk(url: unknown): CommonsMiniatyr | null {
  if (typeof url !== 'string') return null;
  let sti: string;
  try {
    const tolket = new URL(url);
    if (tolket.protocol !== 'https:' || tolket.hostname !== COMMONS_VERT) return null;
    sti = tolket.pathname;
  } catch {
    return null;
  }
  if (!sti.includes('/thumb/')) return null;

  // Spørring og fragment (miniatyrene har ingen, men en URL kan ha det) holdes
  // utenfor, så «siste ledd» er siste ledd i STIEN.
  const haleStart = url.search(/[?#]/);
  const utenHale = haleStart === -1 ? url : url.slice(0, haleStart);
  const hale = haleStart === -1 ? '' : url.slice(haleStart);

  // Siste ledd: «330px-Navn.jpg», eller med et ledd foran for flersidige og
  // omkodede filer («lossy-page1-500px-Navn.tif.jpg»). Prefikset er lat og
  // valgfritt i den rekkefølgen: «330px-Navn-12px-utsnitt.jpg» er 330 bred.
  const treff = /^(.*\/)((?:[^/]*?-)??)(\d+)px-([^/]+)$/.exec(utenHale);
  if (!treff) return null;
  const [, mappe, prefiks, bredde] = treff;
  const rest = `${treff[4]}${hale}`;

  // Filnavnet er leddet FØR det siste.
  const filledd = mappe.slice(0, -1).split('/').pop() ?? '';
  let filnavn = filledd;
  try {
    filnavn = decodeURIComponent(filledd);
  } catch {
    // Ugyldig prosentkoding: bruk leddet rått heller enn å kaste.
  }
  filnavn = filnavn.replace(/_/g, ' ').trim();
  if (!filnavn) return null;

  return { mappe, prefiks, bredde: Number(bredde), rest, filnavn };
}

function medBredde(miniatyr: CommonsMiniatyr, bredde: number): string {
  return `${miniatyr.mappe}${miniatyr.prefiks}${bredde}px-${miniatyr.rest}`;
}

/** Det minste faste trinnet som er minst så bredt som ønsket; aldri over det største. */
function trinnFor(bredde: number): number {
  return COMMONS_TRINN.find((trinn) => trinn >= bredde) ?? COMMONS_TRINN[COMMONS_TRINN.length - 1];
}

/**
 * Filnavnet på Commons for en miniatyr-URL — samme form som
 * `commonsFileNameFromUrl` i scripts/lib/commons-credit.mjs (dekodet,
 * mellomrom i stedet for understrek). `null` for alt som ikke er en
 * Commons-miniatyr.
 */
export function commonsFilnavn(url: unknown): string | null {
  return tolk(url)?.filnavn ?? null;
}

/** Bredden miniatyren er lagret i (tallet foran «px-»), eller `null`. */
export function commonsBredde(url: unknown): number | null {
  return tolk(url)?.bredde ?? null;
}

/**
 * Samme bilde i en annen bredde. Ønsket bredde klemmes til nærmeste faste
 * trinn oppover. Alt som ikke er en Commons-miniatyr returneres uendret.
 */
export function commonsThumb<T extends string | null | undefined>(url: T, onsketBredde: number): T | string {
  const miniatyr = tolk(url);
  if (!miniatyr || !Number.isFinite(onsketBredde) || onsketBredde <= 0) return url;
  const bredde = trinnFor(onsketBredde);
  return bredde === miniatyr.bredde ? url : medBredde(miniatyr, bredde);
}

/** Én utgave av et bilde: bredden i piksler og adressen til den. */
export interface CommonsUtgave {
  bredde: number;
  url: string;
}

/**
 * Utgavene det er verdt å tilby av et bilde, smalest først: den lagrede, pluss
 * de faste trinnene over den.
 *
 * `originalBredde` er taket: et trinn bredere enn originalen har ingen flere
 * detaljer, bare flere byte (punkt 2 øverst). Ukjent bredde (`null`) gir
 * ingen tak — nye bilder er som regel store, og komponenten som viser bildet
 * faller tilbake på den lagrede utgaven hvis et trinn ikke lar seg laste.
 *
 * Tom liste for alt som ikke er en Commons-miniatyr.
 */
export function commonsUtgaver(url: string | null | undefined, originalBredde?: number | null): CommonsUtgave[] {
  const miniatyr = tolk(url);
  if (!miniatyr || !url) return [];
  const tak =
    typeof originalBredde === 'number' && Number.isFinite(originalBredde) && originalBredde > 0
      ? originalBredde
      : Number.POSITIVE_INFINITY;

  const utgaver: CommonsUtgave[] = [{ bredde: miniatyr.bredde, url }];
  for (const trinn of SRCSET_TRINN) {
    if (trinn > miniatyr.bredde && trinn <= tak) utgaver.push({ bredde: trinn, url: medBredde(miniatyr, trinn) });
  }
  return utgaver;
}

/**
 * `srcset` for hovedbildet, så nettleseren velger utgave etter skjermen.
 *
 * `undefined` når det ikke finnes noe å velge mellom, eller URL-en ikke er en
 * Commons-miniatyr. Da brukes `src` alene, som før.
 */
export function commonsSrcSet(url: string | null | undefined, originalBredde?: number | null): string | undefined {
  const utgaver = commonsUtgaver(url, originalBredde);
  if (utgaver.length < 2) return undefined;
  return utgaver.map((utgave) => `${utgave.url} ${utgave.bredde}w`).join(', ');
}
