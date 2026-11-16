import { finnFrikjennendeFormuleringer } from '@/lib/species/forvekslingstekst';
import { photoCreditFromSpeciesRow } from '@/lib/utils/photo-credit';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import type { PhotoCreditInfo } from '@/types/identify';
import type { Edibility } from '@/types/species';

/**
 * «Kjenn forvekslingen» — hvilke forvekslingspar treneren øver på, og hvordan
 * en runde settes sammen. Ren logikk: radene, språket og tilfeldigheten sendes
 * inn, så ingenting her leser database, klokke eller Math.random.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVA TRENEREN ER — OG IKKE ER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Den viser to arter som forveksles, spør hvilken av dem som er giftig, og
 * viser så kjennetegnene som skiller dem. Den vurderer aldri en sopp brukeren
 * har funnet, og den sier aldri at noe er trygt å spise.
 *
 * Første forslag («hvilken av disse er den dødelige?» svart ut fra bildet, og
 * «navngi arten fra ett bilde») ble stoppet i gjennomgangen: ett Commons-foto
 * per art øver bildegjenkjenning — nettopp den falske tryggheten resten av
 * appen unngår. Derfor står artsnavnene på kortene fra første stund (spørsmålet
 * er hva du VET om de to artene, ikke hva du ser på et bilde), og derfor er det
 * kjennetegnene som fyller avsløringen.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVILKE PAR SOM ER MED (byggTrenerpar)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  1. Faregrad 'high' eller 'critical' — de samme to gradene som utløser
 *     forvekslingsadvarselen i AI-resultatet (identifications/enrich.ts).
 *     'medium' og 'low' er mildere forvekslinger og rene kvalitetsforskjeller.
 *  2. Begge artene har et bilde fra artsbiblioteket MED kreditering som kan
 *     vises. Bildene er Commons-filer under CC BY / CC BY-SA, og treneren viser
 *     aldri et bilde uten linja under. Kindwise sine similar_images er ikke en
 *     kilde her — de har ingen kreditering vi kan gi videre.
 *  3. Teksten om hvordan artene skilles finnes. Uten den har treneren ingenting
 *     å lære bort, bare et bilde å gjette på.
 *  4. Teksten frikjenner ikke. «En felttest kan dømme et funn ute, den kan
 *     aldri frikjenne det» (forvekslingstekst.ts) gjelder dobbelt i et format
 *     der brukeren nettopp har fått «riktig».
 *  5. Nøyaktig én av de to er giftig etter katalogens egne klasser ('toxic' /
 *     'deadly'), og den andre har en kjent klasse. Ellers har spørsmålet ikke
 *     ett svar: kantarell ↔ falsk kantarell står som 'high', men falsk kantarell
 *     er «ikke matsopp», ikke giftig — treneren ville kalt den «den giftige»
 *     mens merket på samme kort sa «Uspiselig».
 *
 *     Av samme grunn spør tekstene etter «giftsoppen», ikke etter hvilken som
 *     «er giftig»: den andre arten kan bære merket «Spiselig — giftig rå»
 *     (morklene, rødnende fluesopp, hulriske), og da har «hvilken er giftig?»
 *     to forsvarlige svar. Giftsoppen er den katalogen klassifiserer slik.
 *  6. A→B og B→A er samme par. look_alikes er rettet (art → forvekslingsart), og
 *     fem av de alvorlige parene er ført inn begge veier.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SVENSK
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * similarity_description og difference_description finnes bare på norsk. For
 * andre språk enn dem i PROSASPRAK sendes prosaen derfor ALDRI ut herfra — ikke
 * engang til klienten — så den kan ikke havne i en svensk flate ved et uhell.
 * Svenske lesere får navn (swedish_name), merker og lenke til artssiden der
 * teksten står. Kommer det svenske kolonner en dag, er det PROSASPRAK og
 * feltvalget i byggTrenerpar som skal endres.
 */

/** Feltene treneren trenger fra mushroom_species. */
export const TRENER_ARTSFELT =
  'id,norwegian_name,swedish_name,latin_name,edibility,primary_image_url,primary_image_photographer,primary_image_license,primary_image_source_url';

/**
 * Select-uttrykket mot look_alikes. Begge sider av paret hentes, hver gjennom
 * sin egen fremmednøkkel — tabellen har to pekere til mushroom_species, så
 * PostgREST må få vite hvilken som menes.
 */
export const TRENER_SELECT =
  'species_id,look_alike_id,danger_level,similarity_description,difference_description,' +
  `art:mushroom_species!look_alikes_species_id_fkey(${TRENER_ARTSFELT}),` +
  `forveksling:mushroom_species!look_alikes_look_alike_id_fkey(${TRENER_ARTSFELT})`;

/** Faregradene treneren henter. Brukes både i spørringen og i filteret under. */
export const TRENER_FAREGRADER = ['high', 'critical'] as const;
export type TrenerFaregrad = (typeof TRENER_FAREGRADER)[number];

/** Språkene forvekslingsprosaen faktisk finnes på. */
const PROSASPRAK: ReadonlySet<string> = new Set(['nb']);

/** Klassene som betyr «giftig» i katalogen. */
const GIFTIGE_KLASSER: ReadonlySet<string> = new Set(['toxic', 'deadly']);
/** Klassene den andre arten kan ha: kjent, og ikke klassifisert som giftig. */
const ANDRE_KLASSER: ReadonlySet<string> = new Set(['edible', 'conditionally_edible', 'inedible']);

/** En artsrad slik den kommer ut av joinet. Alt kan mangle — PostgREST lover lite. */
export interface ForvekslingsArtRad {
  id?: number | null;
  norwegian_name?: string | null;
  swedish_name?: string | null;
  latin_name?: string | null;
  edibility?: string | null;
  primary_image_url?: string | null;
  primary_image_photographer?: string | null;
  primary_image_license?: string | null;
  primary_image_source_url?: string | null;
}

/**
 * En look_alikes-rad med begge artene joinet inn. PostgREST gir en relasjon som
 * objekt eller som array med ett element, avhengig av hvordan den tolker
 * fremmednøkkelen — begge formene godtas.
 */
export interface ForvekslingsRad {
  species_id?: number | null;
  look_alike_id?: number | null;
  danger_level?: string | null;
  similarity_description?: string | null;
  difference_description?: string | null;
  art?: ForvekslingsArtRad | ForvekslingsArtRad[] | null;
  forveksling?: ForvekslingsArtRad | ForvekslingsArtRad[] | null;
}

/** En art slik treneren viser den. Alt som står her, kan rendres som det er. */
export interface TrenerArt {
  id: number;
  /** Navnet på leserens språk (getSpeciesDisplayName). */
  navn: string;
  latinskNavn: string;
  spiselighet: Edibility;
  /** mushroom_species.primary_image_url — aldri et AI-bilde. */
  bildeUrl: string;
  /** Krediteringen for bildeUrl. Aldri null: par uten kreditering er ikke med. */
  bildeKreditering: PhotoCreditInfo;
}

export interface TrenerPar {
  /** «lavesteId-høyesteId» — lik uansett hvilken vei raden er ført inn. */
  nokkel: string;
  faregrad: TrenerFaregrad;
  /** Arten som er klassifisert 'toxic' eller 'deadly'. */
  giftig: TrenerArt;
  /** Arten den forveksles med. Treneren kaller den aldri trygg — den viser bare merket. */
  annen: TrenerArt;
  /** Artssiden der forvekslingsteksten for paret står (radens species_id). */
  tekstside: { id: number; navn: string };
  /** «Hvorfor de forveksles». null når teksten mangler, eller språket ikke har prosa. */
  hvorforForveksles: string | null;
  /** «Slik skiller du dem». null BARE når språket ikke har prosa — se PROSASPRAK. */
  slikSkillerDu: string | null;
}

/** Har forvekslingstekstene en utgave på dette språket? */
export function harForvekslingsprosa(locale: string): boolean {
  return PROSASPRAK.has(locale);
}

function en<T>(relasjon: T | T[] | null | undefined): T | null {
  if (Array.isArray(relasjon)) return relasjon[0] ?? null;
  return relasjon ?? null;
}

function tekst(verdi: string | null | undefined): string {
  return typeof verdi === 'string' ? verdi.trim() : '';
}

function tilTrenerArt(rad: ForvekslingsArtRad | null, locale: string): TrenerArt | null {
  if (!rad) return null;
  const id = rad.id;
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return null;

  const navn = getSpeciesDisplayName(rad, locale);
  if (!navn) return null;

  const spiselighet = tekst(rad.edibility);
  if (!GIFTIGE_KLASSER.has(spiselighet) && !ANDRE_KLASSER.has(spiselighet)) return null;

  const bildeUrl = tekst(rad.primary_image_url);
  if (!/^https?:\/\//i.test(bildeUrl)) return null;

  // Samme regel som <PhotoCredit>: plassholdere («Wikimedia Commons» som
  // lisens) er ikke en kreditering. Returnerer den null her, ville bildet
  // blitt vist uten linje under — da er arten ikke med.
  const bildeKreditering = photoCreditFromSpeciesRow(rad);
  if (!bildeKreditering) return null;

  return {
    id,
    navn,
    latinskNavn: tekst(rad.latin_name),
    spiselighet: spiselighet as Edibility,
    bildeUrl,
    bildeKreditering
  };
}

const FAREGRADSRANG: Record<TrenerFaregrad, number> = { critical: 0, high: 1 };

function erTrenerFaregrad(verdi: unknown): verdi is TrenerFaregrad {
  return (TRENER_FAREGRADER as readonly unknown[]).includes(verdi);
}

interface Kandidat {
  par: TrenerPar;
  /**
   * Raden går fra den andre arten TIL den giftige. Det er retningen teksten er
   * skrevet for: «du tror du har matsoppen — slik ser du at det er den giftige».
   */
  kanonisk: boolean;
}

/**
 * Gjør look_alikes-rader om til parene treneren kan vise. Rekkefølgen er
 * bestemt av dataene alene (kritiske først, deretter etter id), så samme rader
 * gir samme liste uansett hvilken rekkefølge databasen leverte dem i.
 */
export function byggTrenerpar(
  rader: readonly ForvekslingsRad[] | null | undefined,
  locale: string
): TrenerPar[] {
  const medProsa = harForvekslingsprosa(locale);
  const beste = new Map<string, Kandidat>();

  for (const rad of rader ?? []) {
    if (!rad || !erTrenerFaregrad(rad.danger_level)) continue;

    const art = tilTrenerArt(en(rad.art), locale);
    const forveksling = tilTrenerArt(en(rad.forveksling), locale);
    if (!art || !forveksling || art.id === forveksling.id) continue;

    const skille = tekst(rad.difference_description);
    if (!skille) continue;
    const likhet = tekst(rad.similarity_description);
    if (
      finnFrikjennendeFormuleringer(skille).length > 0 ||
      finnFrikjennendeFormuleringer(likhet).length > 0
    ) {
      continue;
    }

    const artGiftig = GIFTIGE_KLASSER.has(art.spiselighet);
    const forvekslingGiftig = GIFTIGE_KLASSER.has(forveksling.spiselighet);
    if (artGiftig === forvekslingGiftig) continue;
    const giftig = artGiftig ? art : forveksling;
    const annen = artGiftig ? forveksling : art;

    const nokkel = `${Math.min(art.id, forveksling.id)}-${Math.max(art.id, forveksling.id)}`;
    const kandidat: Kandidat = {
      par: {
        nokkel,
        faregrad: rad.danger_level,
        giftig,
        annen,
        tekstside: { id: art.id, navn: art.navn },
        hvorforForveksles: medProsa && likhet ? likhet : null,
        slikSkillerDu: medProsa ? skille : null
      },
      kanonisk: forvekslingGiftig
    };

    const forrige = beste.get(nokkel);
    if (!forrige) {
      beste.set(nokkel, kandidat);
      continue;
    }
    // Samme par ført inn begge veier (basen har UNIQUE(species_id,
    // look_alike_id), så de to radene går hver sin vei): behold teksten som er
    // skrevet fra matsoppens side, men den strengeste faregraden av de to.
    const vinner = kandidat.kanonisk && !forrige.kanonisk ? kandidat : forrige;
    const taper = vinner === kandidat ? forrige : kandidat;
    if (FAREGRADSRANG[taper.par.faregrad] < FAREGRADSRANG[vinner.par.faregrad]) {
      vinner.par.faregrad = taper.par.faregrad;
    }
    beste.set(nokkel, vinner);
  }

  return [...beste.values()]
    .map((kandidat) => kandidat.par)
    .sort(
      (a, b) =>
        FAREGRADSRANG[a.faregrad] - FAREGRADSRANG[b.faregrad] ||
        a.giftig.id - b.giftig.id ||
        a.annen.id - b.annen.id
    );
}

/* ───────────────────────────── Runden ───────────────────────────── */

/** Tilfeldighetskilde: et tall i [0, 1). Sendes inn, så testene kan styre den. */
export type Tilfeldig = () => number;

export type Side = 'venstre' | 'hoyre';

export interface TrenerOppgave {
  par: TrenerPar;
  venstre: TrenerArt;
  hoyre: TrenerArt;
  /** Siden den giftige arten står på. Trukket, så plasseringen aldri røper svaret. */
  giftigSide: Side;
}

/** Par i én runde. Kort nok til å gjøres ferdig i én økt på mobilen. */
export const RUNDE_STORRELSE = 6;

function trekkIndeks(antall: number, tilfeldig: Tilfeldig): number {
  const r = tilfeldig();
  if (!Number.isFinite(r) || r <= 0) return 0;
  return Math.min(antall - 1, Math.floor(r * antall));
}

/** Fisher–Yates på en kopi. */
function stokk<T>(liste: readonly T[], tilfeldig: Tilfeldig): T[] {
  const ut = [...liste];
  for (let i = ut.length - 1; i > 0; i--) {
    const j = trekkIndeks(i + 1, tilfeldig);
    [ut[i], ut[j]] = [ut[j], ut[i]];
  }
  return ut;
}

export interface RundeValg {
  tilfeldig: Tilfeldig;
  /** Hvor mange par runden skal ha. Færre hvis treneren ikke har så mange. */
  antall?: number;
  /** Nøklene til parene brukeren allerede har klart — de kommer sist. */
  klarte?: Iterable<string>;
}

/**
 * Setter sammen én runde: par brukeren ikke har klart ennå kommer først (i
 * tilfeldig rekkefølge), så fylles det på med repetisjon. Hvilken side den
 * giftige står på, trekkes for hvert par.
 */
export function byggRunde(
  par: readonly TrenerPar[],
  { tilfeldig, antall = RUNDE_STORRELSE, klarte = [] }: RundeValg
): TrenerOppgave[] {
  const tak = Number.isFinite(antall) ? Math.max(0, Math.floor(antall)) : RUNDE_STORRELSE;
  const klart = new Set(klarte);
  const nye = stokk(
    par.filter((p) => !klart.has(p.nokkel)),
    tilfeldig
  );
  const repetisjon = stokk(
    par.filter((p) => klart.has(p.nokkel)),
    tilfeldig
  );

  return [...nye, ...repetisjon].slice(0, tak).map((p) => {
    const giftigSide: Side = tilfeldig() < 0.5 ? 'venstre' : 'hoyre';
    return giftigSide === 'venstre'
      ? { par: p, venstre: p.giftig, hoyre: p.annen, giftigSide }
      : { par: p, venstre: p.annen, hoyre: p.giftig, giftigSide };
  });
}

/* ─────────────────────────── Fremdriften ─────────────────────────── */

/**
 * Fremdriften ligger KUN i nettleserens lokale lagring på brukerens egen
 * enhet: ingen konto, ingen bruksdag, ingenting sendes til oss. Nøkkelen er
 * nevnt i personvernerklæringen (§8, Personvern.cookiesLocalStorage).
 */
export const FORVEKSLINGSTRENER_NOKKEL = 'mycelet:forvekslingstrener-v1';

export interface Trenerfremdrift {
  /** Nøklene til parene der den giftige ble pekt ut riktig sist paret ble vist. */
  klarte: string[];
}

const NOKKELFORM = /^\d{1,9}-\d{1,9}$/;
/** Tak på lista, så en ødelagt eller manipulert verdi ikke kan vokse fritt. */
const MAKS_LAGREDE_PAR = 500;

/** Tolker den lagrede strengen. Alt som ikke er akkurat riktig, gir tom fremdrift. */
export function tolkTrenerfremdrift(raa: string | null | undefined): Trenerfremdrift {
  if (!raa) return { klarte: [] };
  let verdi: unknown;
  try {
    verdi = JSON.parse(raa);
  } catch {
    return { klarte: [] };
  }
  if (!verdi || typeof verdi !== 'object') return { klarte: [] };
  const liste = (verdi as { klarte?: unknown }).klarte;
  if (!Array.isArray(liste)) return { klarte: [] };
  const gyldige = liste.filter(
    (nokkel): nokkel is string => typeof nokkel === 'string' && NOKKELFORM.test(nokkel)
  );
  return { klarte: [...new Set(gyldige)].slice(0, MAKS_LAGREDE_PAR) };
}

export function serialiserTrenerfremdrift(fremdrift: Trenerfremdrift): string {
  return JSON.stringify({ klarte: fremdrift.klarte });
}

/**
 * Riktig svar fører paret inn i lista; feil svar tar det UT igjen. Et par du
 * klarte i går og bommer på i dag, er et par du skal få se igjen — ellers
 * teller fremdriften flaks.
 */
export function registrerSvar(
  fremdrift: Trenerfremdrift,
  nokkel: string,
  riktig: boolean
): Trenerfremdrift {
  const uten = fremdrift.klarte.filter((n) => n !== nokkel);
  return { klarte: riktig ? [...uten, nokkel].slice(-MAKS_LAGREDE_PAR) : uten };
}

/**
 * Hvor mange av DAGENS par som er klart. Lagrede nøkler for par som ikke
 * lenger er i treneren teller ikke — ellers kunne «klart 9 av 8» oppstå den
 * dagen et par forsvinner fra katalogen.
 */
export function antallKlarte(par: readonly TrenerPar[], fremdrift: Trenerfremdrift): number {
  const klart = new Set(fremdrift.klarte);
  return par.filter((p) => klart.has(p.nokkel)).length;
}
