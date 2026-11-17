import type { DelingsnivaValg } from './delingsniva';
import { delingsnivaFor, tidligstNyAapning } from './delingsendring';

/**
 * Det /mine-steder sender til nettleseren om ETT funn, og det den viser om et
 * slettet funn. Rene funksjoner: klokka sendes inn.
 *
 * Koordinatene er IKKE med. Lista under et sted trenger dem ikke, og det som
 * ikke står i sidens data, kan heller ikke lekke fra den.
 */

const DAG_MS = 24 * 60 * 60 * 1000;

/** Kolonnene siden henter for å bygge ett funn i lista. */
export interface EgetFunnRad {
  id: string;
  visibility: string;
  is_zone_finding: boolean | null;
  zone_label: string | null;
  zone_precision_km: number | null;
  notes: string | null;
  image_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface FunnIKort {
  id: string;
  /** Artsnavnet på leserens språk, ferdig slått opp på serveren. */
  artsnavn: string;
  /** Funndatoen, ferdig formatert på serveren. */
  datoTekst: string;
  deling: DelingsnivaValg;
  /** Bare satt for sone-funn. */
  soneNavn: string | null;
  soneKm: number;
  notat: string | null;
  bilde: string | null;
  /**
   * ISO-tidspunktet funnet tidligst kan deles åpnere igjen, eller null når det
   * kan skje nå. Se delingsendring.ts.
   */
  aapnesTidligst: string | null;
}

export function funnTilKort(
  rad: EgetFunnRad,
  tekst: { artsnavn: string; datoTekst: string },
  naaMs: number
): FunnIKort {
  const deling = delingsnivaFor(rad);
  const tidligst = tidligstNyAapning(rad, naaMs);
  return {
    id: rad.id,
    artsnavn: tekst.artsnavn,
    datoTekst: tekst.datoTekst,
    deling,
    // Et sonenavn som ble stående etter at sonen ble slått av, er ikke en del
    // av delingen lenger og skal ikke vises som om det var det.
    soneNavn: deling === 'zone' ? rad.zone_label : null,
    soneKm: rad.zone_precision_km ?? 5,
    notat: rad.notes,
    bilde: rad.image_url,
    aapnesTidligst: tidligst === null ? null : new Date(tidligst).toISOString()
  };
}

/**
 * Hele dager til et slettet funn ryddes for godt, rundet OPP — «1 dag» betyr
 * at det fortsatt er tid igjen i dag. 0 når fristen er ute: raden finnes da
 * bare til neste kjøring av /api/cron/purge-deleted-findings, og kan
 * gjenopprettes helt til den går.
 *
 * `fristDager` er PURGE_AFTER_DAYS fra den jobben. Tallet sendes inn i stedet
 * for å skrives her, så lista og ryddingen aldri kan si hver sin frist.
 */
export function dagerTilRydding(deletedAt: string, naaMs: number, fristDager: number): number {
  const slettet = Date.parse(deletedAt);
  if (Number.isNaN(slettet)) return 0;
  const igjenMs = slettet + fristDager * DAG_MS - naaMs;
  // Taket fanger en klokke som går litt feil: lista skal aldri love mer enn fristen.
  return Math.min(fristDager, Math.max(0, Math.ceil(igjenMs / DAG_MS)));
}
