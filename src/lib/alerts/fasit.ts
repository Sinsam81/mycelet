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
 * Appens egne funn har ikke etterslep og telles separat.
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
}

function isoDag(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function plussDager(iso: string, dager: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dager);
  return isoDag(d);
}

/** GBIF-telling for regionboksen i [fra, til] — kun antallet, aldri innholdet. */
async function tellGbif(
  region: (typeof PREDICTION_TILE_REGIONS)[number],
  fraIso: string,
  tilIso: string
): Promise<number | null> {
  const url =
    `https://api.gbif.org/v1/occurrence/search?taxonKey=5&limit=0` +
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

/** Egne app-funn i regionboksen — umiddelbare, uten publiseringsetterslep. */
async function tellEgneFunn(
  db: { from: (t: string) => any },
  region: (typeof PREDICTION_TILE_REGIONS)[number],
  fraIso: string,
  tilIso: string
): Promise<number> {
  const { count, error } = await db
    .from('findings')
    .select('*', { count: 'exact', head: true })
    .gte('latitude', region.minLat)
    .lte('latitude', region.maxLat)
    .gte('longitude', region.minLng)
    .lte('longitude', region.maxLng)
    .gte('found_at', `${fraIso}T00:00:00Z`)
    .lt('found_at', `${tilIso}T00:00:00Z`)
    .is('deleted_at', null);
  return error ? 0 : (count ?? 0);
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

  const etterFra = varselDato;
  const etterTil = plussDager(varselDato, FASIT_VINDU_DAGER);
  const forFra = plussDager(varselDato, -FASIT_VINDU_DAGER);

  const [gbifEtter, gbifFor, egneEtter, egneFor] = await Promise.all([
    tellGbif(region, etterFra, etterTil),
    tellGbif(region, forFra, varselDato),
    tellEgneFunn(db, region, etterFra, etterTil),
    tellEgneFunn(db, region, forFra, varselDato)
  ]);

  return {
    region: regionNavn,
    dato: varselDato,
    ukenEtter: (gbifEtter ?? 0) + egneEtter,
    ukenFor: (gbifFor ?? 0) + egneFor,
    moden: gbifEtter !== null && gbifFor !== null && erFasitModen(varselDato, naa)
  };
}
