import { PREDICTION_TILE_REGIONS } from '@/lib/prediction/tile-regions';

/**
 * Fasit-sløyfen: hva skjedde etter varselet?
 *
 * Prinsippet er meteorologiens verifikasjonskultur overført til sopp: hvert
 * varsel er en falsifiserbar påstand, og troverdigheten bygges av å publisere
 * fasiten — også når vi bommer. Fasiten er funn registrert i regionen uken
 * ETTER varselet, målt mot uken FØR.
 *
 * ⚠️ DATAENES NATUR: Artsobservasjoner publiserer til GBIF i bulk med ukers
 * etterslep. En fersk fasit er derfor systematisk FOR LAV, og tallene MODNES
 * — de vokser etter hvert som rapportene når GBIF. Derfor:
 *   · fasit regnes alltid LIVE, aldri lagret (se migrasjon 060)
 *   · all visning må bære modningsforbeholdet
 *   · e-postkvitteringen venter til etter-uken er minst FASIT_MODEN_DAGER
 *     gammel før den feller dom (se FASIT_MODEN_ETTER_VARSEL_DAGER)
 * Appens egne funn har ikke etterslep; de telles og vises separat (+N).
 */

export const FASIT_MODEN_DAGER = 14;

/** Fasitvinduet: uken ETTER varselet (og uken før, som referanse). */
export const FASIT_VINDU_DAGER = 7;

/**
 * Så gammelt må VARSELET være før fasiten regnes som moden — modenheten
 * teller fra vinduets SLUTT, ikke fra varseldagen.
 *
 * Første utgave målte 14 dager fra varseldagen. Da var den yngste dagen i
 * etter-uken bare sju dager gammel — mens før-uken var to uker eldre og
 * dermed langt mer komplett i GBIF. Skjevheten dro systematisk mot «bom»:
 * Trondheim 21. august sto med 68 funn før og 32 etter på dag 15, ikke fordi
 * det ble mindre sopp, men fordi etter-uken ikke var rapportert ennå. En
 * fasit som er ærlig i feil retning er fortsatt feil.
 */
export const FASIT_MODEN_ETTER_VARSEL_DAGER = FASIT_MODEN_DAGER + FASIT_VINDU_DAGER;

/** Ren modenhetsregel, testet for seg: er varselet gammelt nok til dom? */
export function erFasitModen(varselDato: string, naa: Date): boolean {
  const alderDager = (naa.getTime() - Date.parse(`${varselDato}T00:00:00Z`)) / 86_400_000;
  return alderDager >= FASIT_MODEN_ETTER_VARSEL_DAGER;
}

export interface FasitTall {
  region: string;
  dato: string;
  ukenEtter: number;
  ukenFor: number;
  /** Andel av etter-uken som er eldre enn GBIF-etterslepet — grov modenhet. */
  moden: boolean;
  /** false når GBIF ikke svarte — da er tallene bare egne funn og skal vises som «–», ikke som 0. */
  gbifOk: boolean;
  /** false når tellingen av egne funn feilet — samme regel: ingen dom på halvt grunnlag. */
  egneOk: boolean;
  /** Per kilde, så visningen kan skille GBIF (etterslep) fra egne funn (umiddelbare). */
  gbifEtter: number;
  gbifFor: number;
  egneEtter: number;
  egneFor: number;
}

/**
 * Fasitvinduene for ett varsel. Like lange, disjunkte, og varseldagen i
 * NØYAKTIG ett av dem: etter = [d, d+6] (varselet går om morgenen, så dagens
 * funn hører til «etter»), før = [d−7, d−1].
 *
 * GBIF sin `eventDate=a,b` tar med BEGGE endepunktene. Første utgave sendte
 * d..d+7 og d−7..d — åtte dager hver, med varseldagen telt i begge vinduer
 * (Trondheim 14. aug: 68/54 i stedet for 58/51). Egne funn telles halvåpent
 * [fra, til), så de trenger dagen ETTER siste dag som øvre grense.
 */
export function fasitVinduer(varselDato: string) {
  return {
    etter: {
      fra: varselDato,
      tilInkl: plussDager(varselDato, FASIT_VINDU_DAGER - 1),
      tilEksk: plussDager(varselDato, FASIT_VINDU_DAGER)
    },
    for: {
      fra: plussDager(varselDato, -FASIT_VINDU_DAGER),
      tilInkl: plussDager(varselDato, -1),
      tilEksk: varselDato
    }
  };
}

/**
 * UTC-tidspunktet for lokal midnatt i Europe/Oslo den gitte datoen. GBIF sin
 * eventDate er lokal kalenderdato; egne funn lagres som tidsstempel. Med
 * `T00:00:00Z` som grense havnet et app-funn kl. 00–02 lokal tid på dagen
 * FØR — de to kildene talte ikke samme døgn.
 */
export function osloMidnattIso(dagIso: string): string {
  const gjett = new Date(`${dagIso}T00:00:00Z`);
  const osloTime = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Oslo', hour: 'numeric', hour12: false }).format(gjett)
  );
  // Ved 00:00Z viser Oslo 01 (CET) eller 02 (CEST); lokal midnatt er så mange timer tidligere.
  return new Date(gjett.getTime() - (osloTime % 24) * 3_600_000).toISOString();
}

function isoDag(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function plussDager(iso: string, dager: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dager);
  return isoDag(d);
}

/** GBIF-telling for regionboksen i [fra, til], BEGGE inkludert — kun antallet, aldri innholdet. */
async function tellGbif(
  region: (typeof PREDICTION_TILE_REGIONS)[number],
  fraIso: string,
  tilIso: string
): Promise<number | null> {
  // Samme filtre som importskriptet (scripts/import-gbif-occurrences.mjs):
  // bare tilstedeværelse (ikke ABSENT-poster — «fant ingen» er ikke et funn)
  // og bare observasjoner/belegg (ikke eDNA-/jordprøver som har eventDate).
  const url =
    `https://api.gbif.org/v1/occurrence/search?taxonKey=5&limit=0` +
    `&occurrenceStatus=PRESENT&basisOfRecord=HUMAN_OBSERVATION&basisOfRecord=PRESERVED_SPECIMEN` +
    `&country=${region.country}` +
    `&decimalLatitude=${region.minLat},${region.maxLat}` +
    `&decimalLongitude=${region.minLng},${region.maxLng}` +
    `&eventDate=${fraIso},${tilIso}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const json = (await res.json()) as { count?: number };
    return typeof json.count === 'number' ? json.count : null;
  } catch {
    return null;
  }
}

/**
 * Egne app-funn i regionboksen — umiddelbare, uten publiseringsetterslep.
 * Negative observasjoner («fant ingen sopp», migrasjon 010) er ikke funn og
 * telles ikke — alle andre tellesteder i appen filtrerer dem, og fasiten
 * gjorde det ikke. null ved feil, som tellGbif: en stille 0 er en falsk fasit.
 */
async function tellEgneFunn(
  db: { from: (t: string) => any },
  region: (typeof PREDICTION_TILE_REGIONS)[number],
  fraIso: string,
  tilIso: string
): Promise<number | null> {
  const { count, error } = await db
    .from('findings')
    .select('*', { count: 'exact', head: true })
    .gte('latitude', region.minLat)
    .lte('latitude', region.maxLat)
    .gte('longitude', region.minLng)
    .lte('longitude', region.maxLng)
    .gte('found_at', osloMidnattIso(fraIso))
    .lt('found_at', osloMidnattIso(tilIso))
    .eq('is_negative_observation', false)
    .is('deleted_at', null);
  return error ? null : (count ?? 0);
}

/**
 * Regn fasit for ett varsel. GBIF + egne funn summeres per vindu; feiler GBIF
 * helt, telles bare egne funn (og `moden` blir false — vi feller ingen dom på
 * halvt grunnlag).
 */
export async function beregnFasit(
  db: { from: (t: string) => any },
  regionNavn: string,
  varselDato: string,
  naa: Date = new Date()
): Promise<FasitTall | null> {
  const region = PREDICTION_TILE_REGIONS.find((r) => r.name === regionNavn);
  if (!region) return null;

  const v = fasitVinduer(varselDato);

  const [gbifEtter, gbifFor, egneEtter, egneFor] = await Promise.all([
    tellGbif(region, v.etter.fra, v.etter.tilInkl),
    tellGbif(region, v.for.fra, v.for.tilInkl),
    tellEgneFunn(db, region, v.etter.fra, v.etter.tilEksk),
    tellEgneFunn(db, region, v.for.fra, v.for.tilEksk)
  ]);

  const gbifOk = gbifEtter !== null && gbifFor !== null;
  const egneOk = egneEtter !== null && egneFor !== null;
  return {
    region: regionNavn,
    dato: varselDato,
    ukenEtter: (gbifEtter ?? 0) + (egneEtter ?? 0),
    ukenFor: (gbifFor ?? 0) + (egneFor ?? 0),
    moden: gbifOk && egneOk && erFasitModen(varselDato, naa),
    gbifOk,
    egneOk,
    gbifEtter: gbifEtter ?? 0,
    gbifFor: gbifFor ?? 0,
    egneEtter: egneEtter ?? 0,
    egneFor: egneFor ?? 0
  };
}
