/**
 * Henter soppregistreringene fra GBIF — kallene, avstanden og tidsbudsjettet.
 * Regnestykket står i soppregistreringer.ts; her er bare nettverket.
 *
 * ── HVORFOR SÅ FÅ KALL ─────────────────────────────────────────────────────
 *
 * GBIF svarer 429 når det kommer mer enn omtrent ett kall hvert andre
 * sekund, og en Vercel-funksjon lever i 300 s. Rett fram — ett kall per
 * vindu × gruppe × fylke × år — blir ~200 kall, altså ~400 s. For mye.
 *
 * To grep får selve tellingen ned til 61:
 *
 * 1. I ÅR trengs ingen grense, så en gadmLevel1Gid-facett gir alle fylkene
 *    i ett kall: 2 vinduer × 2 grupper = 4 kall.
 * 2. For TIDLIGERE år må id-ene telles, men hver funn-id er ett funn, så
 *    snitt av id-sett erstatter kall. Per år: grensen (1), Norge sesong alle,
 *    Norge sesong storsopp, Norge uke alle (3) og hvert fylke sesong alle
 *    (15). Fylke × storsopp = fylkets id-er ∩ Norges storsopp-id-er; fylke ×
 *    uke = fylkets id-er ∩ Norges uke-id-er (uka ligger inne i sesongen).
 *    Det er 19 kall per år, 57 for tre år.
 *
 * Pluss ett kall for utgavedatoen og ett for om GBIF er ferdig med å
 * indeksere den: 2 + 4 + 57 = 63. Med 2 s pause etter hvert svar og
 * svartider målt til 0,1–1,2 s er det ~130–200 s (tørrkjøringene 17. sep
 * 2026: 130 og 145 s).
 *
 * ── UTGAVEDATOEN KOMMER FØR TALLENE ────────────────────────────────────────
 *
 * pubDate i registeret oppdateres når GBIF henter arkivet (12. sep-utgaven:
 * datasettet endret 14. sep 11:35, hentingen startet 11:36), men
 * indekseringen av 38 millioner poster (september 2026) tar tid etter det. En telling midt
 * i den ville blandet to utgaver — og ble lagret for hele uka. Derfor
 * venter cronen til siste prosess står som FINISHED.
 *
 * ── NÅR DET LIKEVEL IKKE RAKK ──────────────────────────────────────────────
 *
 * Fristen (FRIST_MS) sjekkes før hvert kall. Går den ut, kastes FristUteFeil
 * og INGENTING skrives — halve tall i tabellen er verre enn ingen. Cronen går
 * hver natt, utgaven byttes omtrent ukentlig, og en utgave uten rader regnes
 * på nytt fra start neste natt. Å dele jobben over flere netter med lagret
 * mellomtilstand er ikke gjort: budsjettet rekker med god margin, og en
 * uke har seks netter til å prøve igjen.
 */

import {
  ARTSOBS_DATASET,
  FYLKER,
  GRUPPER,
  NORGE,
  NORMAL_AAR,
  SOPP_TAXON_KEY,
  STORSOPP_ORDENER,
  VINDUER,
  byggRader,
  grenseFraFacet,
  lesIdFacet,
  normalAarFor,
  plussDager,
  sammeDatoIAar,
  summerPerFylke,
  tellTilOgMed,
  vinduIAar,
  vinduerFor,
  type Datovindu,
  type FacetTelling,
  type Gruppe,
  type IdTelling,
  type SoppregistreringRad,
  type Telleresultat,
  type Vindu
} from './soppregistreringer';

export const GBIF_API = 'https://api.gbif.org/v1';

/** Minste pause fra ett GBIF-svar til neste kall. Raskere gir 429. */
export const GBIF_AVSTAND_MS = 2_000;
/** Ventetid før det ene nye forsøket etter 429/5xx/nettverksfeil. */
export const GBIF_NYTT_FORSOK_MS = 5_000;
/** Ett kall som bruker lenger enn dette, avbrytes (og prøves én gang til). */
export const GBIF_TIMEOUT_MS = 20_000;
/** Ingen nye kall etter dette — 30 s margin til Vercels maxDuration på 300 s. */
export const FRIST_MS = 270_000;
/** facetLimit på id-facettene. Et fullt svar betyr at noe ble kuttet. */
export const ID_FACET_GRENSE = 100_000;
/** Hvor mange dager bakover grensen kan lete når ingen poster ble endret på selve dagen. */
export const GRENSE_MAKS_DAGER_BAKOVER = 3;
/** Minst så stor andel av postene må ha en gyldig funn-id, ellers stoler vi ikke på tellingen. */
export const MIN_ID_ANDEL = 0.99;

/** Kall i en vanlig kjøring, utgave- og indekseringskallet medregnet. Testen binder dette til budsjettet. */
export function planlagteKall(antallAar = NORMAL_AAR): number {
  const iAar = VINDUER.length * GRUPPER.length;
  const perTidligereAar = 1 + 3 + FYLKER.length;
  return 2 + iAar + antallAar * perTidligereAar;
}

export class FristUteFeil extends Error {
  constructor(public readonly kall: number) {
    super(`Fristen på ${FRIST_MS / 1000} s gikk ut etter ${kall} GBIF-kall`);
    this.name = 'FristUteFeil';
  }
}

export class GbifFeil extends Error {
  constructor(melding: string) {
    super(melding);
    this.name = 'GbifFeil';
  }
}

export interface KlientOppsett {
  fetch?: typeof fetch;
  vent?: (ms: number) => Promise<void>;
  klokke?: () => number;
  avstandMs?: number;
  nyttForsokMs?: number;
  timeoutMs?: number;
  fristMs?: number;
}

export interface GbifKlient {
  hent(sti: string, params?: URLSearchParams): Promise<Record<string, unknown>>;
  /** Kall faktisk sendt, nye forsøk medregnet. */
  kall(): number;
  /** Millisekunder siden klienten ble laget. */
  brukt(): number;
}

export function lagGbifKlient(o: KlientOppsett = {}): GbifKlient {
  const hentFn = o.fetch ?? fetch;
  const vent = o.vent ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const klokke = o.klokke ?? Date.now;
  const avstand = o.avstandMs ?? GBIF_AVSTAND_MS;
  const nyttForsok = o.nyttForsokMs ?? GBIF_NYTT_FORSOK_MS;
  const timeout = o.timeoutMs ?? GBIF_TIMEOUT_MS;
  const frist = o.fristMs ?? FRIST_MS;
  const start = klokke();
  let sisteSlutt: number | null = null;
  let antall = 0;

  async function ettKall(url: string): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; grunn: string; provIgjen: boolean }> {
    if (sisteSlutt !== null) {
      const igjen = sisteSlutt + avstand - klokke();
      if (igjen > 0) await vent(igjen);
    }
    if (klokke() - start >= frist) throw new FristUteFeil(antall);
    antall += 1;
    try {
      const res = await hentFn(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeout) });
      if (!res.ok) return { ok: false, grunn: `HTTP ${res.status}`, provIgjen: res.status === 429 || res.status >= 500 };
      return { ok: true, json: (await res.json()) as Record<string, unknown> };
    } catch (e) {
      return { ok: false, grunn: e instanceof Error ? e.message : String(e), provIgjen: true };
    } finally {
      sisteSlutt = klokke();
    }
  }

  return {
    async hent(sti, params) {
      const url = `${GBIF_API}${sti}${params ? `?${params.toString()}` : ''}`;
      const forste = await ettKall(url);
      if (forste.ok) return forste.json;
      if (!forste.provIgjen) throw new GbifFeil(`${forste.grunn} for ${sti}`);
      // Hele pausen før det nye forsøket; avstandsregelen i ettKall er da alt oppfylt.
      await vent(nyttForsok);
      const andre = await ettKall(url);
      if (andre.ok) return andre.json;
      throw new GbifFeil(`${andre.grunn} for ${sti} (etter nytt forsøk)`);
    },
    kall: () => antall,
    brukt: () => klokke() - start
  };
}

/** Datoen på Artsobservasjoners nyeste utgave i GBIF (pubDate), som YYYY-MM-DD. */
export async function lesUtgavedato(klient: GbifKlient): Promise<string> {
  const d = await klient.hent(`/dataset/${ARTSOBS_DATASET}`);
  const pub = typeof d.pubDate === 'string' ? d.pubDate.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pub)) throw new GbifFeil('Datasettet mangler pubDate');
  return pub;
}

/**
 * Er GBIF ferdig med å indeksere siste henting av datasettet? Ser på den
 * nyeste prosessen i /dataset/{key}/process. Bare et uttrykkelig annet
 * svar enn FINISHED stopper: mangler feltet (API-et endret), telles det
 * heller enn at målingen stopper stille for alltid.
 */
export async function indekseringFerdig(klient: GbifKlient): Promise<boolean> {
  const d = await klient.hent(`/dataset/${ARTSOBS_DATASET}/process`, new URLSearchParams({ limit: '1' }));
  const siste = Array.isArray(d.results) ? (d.results[0] as Record<string, unknown> | undefined) : undefined;
  const tilstand = siste?.processStateOccurrence;
  return typeof tilstand !== 'string' || tilstand === 'FINISHED';
}

// ── Spørringene ─────────────────────────────────────────────────────────────

interface Sporring {
  vindu: Datovindu;
  gruppe: Gruppe;
  gadm?: readonly string[];
  facet: 'catalogNumber' | 'gadmLevel1Gid';
}

export function sokeParametre(s: Sporring): URLSearchParams {
  const p = new URLSearchParams();
  p.set('limit', '0');
  p.set('datasetKey', ARTSOBS_DATASET);
  p.set('taxonKey', String(SOPP_TAXON_KEY));
  p.set('occurrenceStatus', 'PRESENT');
  p.set('basisOfRecord', 'HUMAN_OBSERVATION');
  p.set('country', 'NO');
  p.set('eventDate', `${s.vindu.fra},${s.vindu.til}`);
  if (s.gruppe === 'storsopp') for (const k of Object.values(STORSOPP_ORDENER)) p.append('orderKey', String(k));
  for (const g of s.gadm ?? []) p.append('gadmGid', g);
  p.set('facet', s.facet);
  p.set('facetLimit', s.facet === 'catalogNumber' ? String(ID_FACET_GRENSE) : '100');
  return p;
}

function facetAv(svar: Record<string, unknown>): FacetTelling[] {
  const facets = Array.isArray(svar.facets) ? (svar.facets as Array<{ counts?: unknown }>) : [];
  const counts = facets[0]?.counts;
  if (!Array.isArray(counts)) return [];
  return counts
    .filter((c): c is FacetTelling => typeof c?.name === 'string' && typeof c?.count === 'number')
    .map((c) => ({ name: c.name, count: c.count }));
}

function antallAv(svar: Record<string, unknown>): number {
  if (typeof svar.count !== 'number' || !Number.isFinite(svar.count)) throw new GbifFeil('Svaret mangler count');
  return svar.count;
}

async function hentIder(klient: GbifKlient, s: Omit<Sporring, 'facet'>): Promise<IdTelling> {
  const svar = await klient.hent('/occurrence/search', sokeParametre({ ...s, facet: 'catalogNumber' }));
  const counts = facetAv(svar);
  const totalt = antallAv(svar);
  if (counts.length >= ID_FACET_GRENSE) throw new GbifFeil(`Id-facetten ble kuttet ved ${ID_FACET_GRENSE}`);
  const { ider, sum } = lesIdFacet(counts);
  if (totalt > 0 && sum < totalt * MIN_ID_ANDEL) {
    throw new GbifFeil(`Bare ${sum} av ${totalt} poster har en gyldig funn-id`);
  }
  return ider;
}

/** T_Y for én dato, med tilbakefall til dagene før når ingen poster ble endret den dagen. */
export async function hentGrense(klient: GbifKlient, dato: string): Promise<{ dato: string; id: number }> {
  for (let tilbake = 0; tilbake <= GRENSE_MAKS_DAGER_BAKOVER; tilbake += 1) {
    const d = plussDager(dato, -tilbake);
    const p = new URLSearchParams();
    p.set('limit', '0');
    p.set('datasetKey', ARTSOBS_DATASET);
    p.set('modified', `${d},${d}`);
    p.set('facet', 'catalogNumber');
    p.set('facetLimit', String(ID_FACET_GRENSE));
    const svar = await klient.hent('/occurrence/search', p);
    const id = grenseFraFacet(facetAv(svar));
    if (id !== null) return { dato: d, id };
  }
  throw new GbifFeil(`Ingen grense funnet for ${dato} eller de ${GRENSE_MAKS_DAGER_BAKOVER} dagene før`);
}

type Tall = Record<Vindu, Record<Gruppe, Map<string, number>>>;

function tomtTall(): Tall {
  return {
    sesong: { alle: new Map(), storsopp: new Map() },
    uke: { alle: new Map(), storsopp: new Map() }
  };
}

export interface Soppregistreringer {
  snapshot: string;
  vinduer: { sesong: Datovindu; uke: Datovindu };
  rader: SoppregistreringRad[];
  kall: number;
  bruktMs: number;
}

/**
 * Hele tellingen for én utgave. Kaster FristUteFeil eller GbifFeil — da
 * skal ingenting skrives. `sesongTil` overstyrer vinduets slutt (tørrkjøring).
 */
export async function tellSoppregistreringer(
  klient: GbifKlient,
  snapshot: string,
  valg: { sesongTil?: string; logg?: (hendelse: string, data: Record<string, unknown>) => void } = {}
): Promise<Soppregistreringer> {
  const vinduer = vinduerFor(snapshot, valg.sesongTil);
  if (!vinduer) throw new GbifFeil(`Utgaven ${snapshot} ligger utenfor sesongen`);
  const logg = valg.logg ?? (() => {});
  const iAarNr = Number(snapshot.slice(0, 4));

  // ── I år: alt som står i utgaven, fylkene fra én gadm-facett per kall ────
  const iAar = tomtTall();
  for (const vindu of VINDUER) {
    for (const gruppe of GRUPPER) {
      const svar = await klient.hent('/occurrence/search', sokeParametre({ vindu: vinduer[vindu], gruppe, facet: 'gadmLevel1Gid' }));
      const perFylke = summerPerFylke(facetAv(svar));
      perFylke.set(NORGE, antallAv(svar));
      iAar[vindu][gruppe] = perFylke;
    }
  }
  logg('soppregistreringer.i_aar', { aar: iAarNr, kall: klient.kall() });

  // ── Tidligere år: id-er opp til grensen på samme dato ────────────────────
  const tidligere = new Map<number, Tall>();
  const grenser: Telleresultat['grenser'] = {};
  let forrigeGrense = -Infinity;
  for (const aar of normalAarFor(snapshot)) {
    const grense = await hentGrense(klient, sammeDatoIAar(snapshot, aar));
    if (grense.id <= forrigeGrense) {
      throw new GbifFeil(`Grensen for ${aar} (${grense.id}) er ikke høyere enn året før (${forrigeGrense}) — id-rekkefølgen holder ikke`);
    }
    forrigeGrense = grense.id;
    grenser[String(aar)] = grense;

    const sesong = vinduIAar(vinduer.sesong, aar);
    const uke = vinduIAar(vinduer.uke, aar);
    const norgeSesongAlle = await hentIder(klient, { vindu: sesong, gruppe: 'alle' });
    const norgeSesongStorsopp = await hentIder(klient, { vindu: sesong, gruppe: 'storsopp' });
    const norgeUkeAlle = await hentIder(klient, { vindu: uke, gruppe: 'alle' });

    const tall = tomtTall();
    const T = grense.id;
    tall.sesong.alle.set(NORGE, tellTilOgMed(norgeSesongAlle, T));
    tall.sesong.storsopp.set(NORGE, tellTilOgMed(norgeSesongStorsopp, T));
    tall.uke.alle.set(NORGE, tellTilOgMed(norgeUkeAlle, T));
    tall.uke.storsopp.set(NORGE, tellTilOgMed(norgeUkeAlle, T, [norgeSesongStorsopp]));

    for (const fylke of FYLKER) {
      const ider = await hentIder(klient, { vindu: sesong, gruppe: 'alle', gadm: fylke.gadm });
      tall.sesong.alle.set(fylke.navn, tellTilOgMed(ider, T));
      tall.sesong.storsopp.set(fylke.navn, tellTilOgMed(ider, T, [norgeSesongStorsopp]));
      tall.uke.alle.set(fylke.navn, tellTilOgMed(ider, T, [norgeUkeAlle]));
      tall.uke.storsopp.set(fylke.navn, tellTilOgMed(ider, T, [norgeUkeAlle, norgeSesongStorsopp]));
    }
    tidligere.set(aar, tall);
    logg('soppregistreringer.aar_ferdig', { aar, grense: grense.id, grenseDato: grense.dato, kall: klient.kall(), bruktMs: klient.brukt() });
  }

  const rader = byggRader(snapshot, vinduer, { iAar, tidligere, grenser });
  return { snapshot, vinduer, rader, kall: klient.kall(), bruktMs: klient.brukt() };
}
