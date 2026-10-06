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
 * Pluss ett kall for utgaven og to for om GBIF er ferdig med å indeksere
 * den: 3 + 4 + 57 = 64. Med 2 s pause etter hvert svar og svartider målt
 * til 0,1–1,2 s er det ~130–210 s.
 *
 * ── UTGAVEDATOEN KOMMER FØR TALLENE ────────────────────────────────────────
 *
 * 12. sep-utgaven, 14. sep 2026 (UTC), slik GBIF selv logget den:
 *   11:28–11:29  henting 494 laster ned arkivet (finishReason NORMAL)
 *   11:35:52     registeret får ny pubDate (datasettets modified)
 *   11:36:52     henting 495: ingenting nytt (NOT_MODIFIED), står som FINISHED
 *   11:40        pipelines for forsøk 494 starter
 *   13:22:08     INTERPRETED_TO_INDEX ferdig — FØRST NÅ svarer søket med
 *                den nye utgaven
 * I nesten to timer sto altså ny pubDate og FINISHED i /process mens
 * søkeindeksen fortsatt var forrige ukes. /process beskriver nedlastingen,
 * ikke indeksen. Den ukentlige hentingen går søndager ~03:00–03:35 UTC, og
 * indeksen er ferdig ~05:00–05:20 (sesongen 2026). En telling i det vinduet
 * ville regnet i år fra forrige utgave og tidligere år fra den nye datoen —
 * skjevt nedover, akkurat den falske nedgangen tabellen skal fjerne — og
 * låst tallene for hele uka.
 *
 * Derfor sjekkIndeksering: nyeste NORMAL-henting må ha et pipelines-forsøk,
 * ingen indeksering av det forsøket kan pågå, og hentingens egen
 * INTERPRETED_TO_INDEX må være COMPLETED og ferdig ETTER datasettets
 * modified. Mangler noe av dette, ventes det (feiler lukket): en tapt natt
 * koster ingenting, en feil utgave står en uke. Cronen går 05:45 UTC, etter
 * søndagsindekseringen og før dagsrapporten 06:00.
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

/** Så mange hentinger bakover i /process letes det etter den nyeste NORMAL-hentingen. */
export const PROSESS_SIDE = 20;

/** Kall i en vanlig kjøring, utgavekallet og de to indekseringskallene medregnet. Testen binder dette til budsjettet. */
export function planlagteKall(antallAar = NORMAL_AAR): number {
  const iAar = VINDUER.length * GRUPPER.length;
  const perTidligereAar = 1 + 3 + FYLKER.length;
  return 3 + iAar + antallAar * perTidligereAar;
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

export interface Utgave {
  /** pubDate som YYYY-MM-DD — nøkkelen radene lagres under. */
  dato: string;
  /** Datasettets modified (når registeret sist ble oppdatert), eller null. */
  endret: string | null;
}

/** Artsobservasjoners nyeste utgave i GBIF: pubDate, og når registeret fikk den. Ett kall. */
export async function lesUtgave(klient: GbifKlient): Promise<Utgave> {
  const d = await klient.hent(`/dataset/${ARTSOBS_DATASET}`);
  const pub = typeof d.pubDate === 'string' ? d.pubDate.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pub)) throw new GbifFeil('Datasettet mangler pubDate');
  return { dato: pub, endret: typeof d.modified === 'string' ? d.modified : null };
}

export interface Indeksering {
  ferdig: boolean;
  /** Hvorfor — til loggen og tørrkjøringen. */
  grunn: string;
}

type Obj = Record<string, unknown>;
const somObj = (x: unknown): Obj | null => (x !== null && typeof x === 'object' && !Array.isArray(x) ? (x as Obj) : null);
const liste = (x: unknown): Obj[] => (Array.isArray(x) ? x.map(somObj).filter((o): o is Obj => o !== null) : []);

/** GBIF skriver både «2026-09-14T11:35:52.268+00:00» og «2026-09-14 13:22:08Z». */
function tidspunkt(x: unknown): number | null {
  if (typeof x !== 'string') return null;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2} /.test(x) ? x.replace(' ', 'T') : x);
  return Number.isFinite(t) ? t : null;
}

/** Tilstander der en indeksering ikke er ferdig (pipelines' Status-enum). */
const PAGAAR = new Set(['SUBMITTED', 'QUEUED', 'RUNNING']);

/**
 * Har søkeindeksen utgaven registeret nå viser? Ren funksjon over svarene
 * fra /dataset/{key}/process og /pipelines/history/{key} — se toppen av
 * fila for hvorfor /process alene ikke holder. Alle vilkårene må stemme, og
 * mangler et felt, er svaret nei.
 */
export function vurderIndeksering(inn: { endret: string | null; prosess: Obj; historikk: Obj }): Indeksering {
  const endret = tidspunkt(inn.endret);
  if (endret === null) return { ferdig: false, grunn: 'datasettet mangler modified' };

  const normal = liste(inn.prosess.results).find((p) => p.finishReason === 'NORMAL');
  const hentet = somObj(normal?.crawlJob)?.attempt;
  if (typeof hentet !== 'number') return { ferdig: false, grunn: `ingen NORMAL-henting blant de ${PROSESS_SIDE} siste i /process` };

  const siste = liste(inn.historikk.results)[0];
  const forsok = siste?.attempt;
  if (typeof forsok !== 'number') return { ferdig: false, grunn: 'pipelines-historikken er tom' };
  if (forsok < hentet) return { ferdig: false, grunn: `henting ${hentet} har ikke startet i pipelines (nyeste der: ${forsok})` };

  const kjoringer = liste(siste.executions);
  const indekssteg = (k: Obj | undefined) => liste(k?.steps).filter((st) => st.type === 'INTERPRETED_TO_INDEX');
  if (kjoringer.some((k) => indekssteg(k).some((st) => typeof st.state === 'string' && PAGAAR.has(st.state)))) {
    return { ferdig: false, grunn: `forsøk ${forsok} indekseres nå` };
  }
  // Hentingens egen kjøring — ikke en senere omkjøring (rerunReason) — nyeste først.
  const henting = kjoringer.filter((k) => !k.rerunReason).sort((a, b) => (tidspunkt(b.created) ?? 0) - (tidspunkt(a.created) ?? 0))[0];
  const steg = indekssteg(henting).find((st) => st.state === 'COMPLETED');
  if (!steg) return { ferdig: false, grunn: `forsøk ${forsok} er ikke ferdig indeksert` };
  const ferdigTid = tidspunkt(steg.finished);
  if (ferdigTid === null) return { ferdig: false, grunn: `indekseringen av forsøk ${forsok} mangler ferdigtid` };
  if (ferdigTid <= endret) {
    return { ferdig: false, grunn: `forsøk ${forsok} ble indeksert ${String(steg.finished)}, før registeret sist ble endret ${inn.endret}` };
  }
  return { ferdig: true, grunn: `forsøk ${forsok} indeksert ${String(steg.finished)}, etter registerendringen ${inn.endret}` };
}

/** To kall: de siste hentingene og det nyeste pipelines-forsøket. */
export async function sjekkIndeksering(klient: GbifKlient, utgave: Utgave): Promise<Indeksering> {
  const prosess = await klient.hent(`/dataset/${ARTSOBS_DATASET}/process`, new URLSearchParams({ limit: String(PROSESS_SIDE) }));
  const historikk = await klient.hent(`/pipelines/history/${ARTSOBS_DATASET}`, new URLSearchParams({ limit: '1' }));
  return vurderIndeksering({ endret: utgave.endret, prosess, historikk });
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

/**
 * Leser en catalogNumber-facett og stopper hvis den kan være ufullstendig:
 * fullt svar (facetLimit nådd — GBIF sorterer likt antall på navnet som
 * tekst, så det er de høyeste id-ene som faller bort, og både tellinger og
 * grenser blir for lave uten å se gale ut) eller for få poster med gyldig id.
 */
function fullIdFacet(svar: Record<string, unknown>, hva: string): { counts: FacetTelling[]; ider: Map<number, number> } {
  const counts = facetAv(svar);
  const totalt = antallAv(svar);
  if (counts.length >= ID_FACET_GRENSE || totalt >= ID_FACET_GRENSE) {
    throw new GbifFeil(`Id-facetten for ${hva} ble kuttet ved ${ID_FACET_GRENSE} (${totalt} poster)`);
  }
  const { ider, sum } = lesIdFacet(counts);
  if (totalt > 0 && sum < totalt * MIN_ID_ANDEL) {
    throw new GbifFeil(`Bare ${sum} av ${totalt} poster har en gyldig funn-id (${hva})`);
  }
  return { counts, ider };
}

async function hentIder(klient: GbifKlient, s: Omit<Sporring, 'facet'>): Promise<IdTelling> {
  const svar = await klient.hent('/occurrence/search', sokeParametre({ ...s, facet: 'catalogNumber' }));
  return fullIdFacet(svar, `eventDate ${s.vindu.fra},${s.vindu.til}`).ider;
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
    // Samme vakt som for tellingene: en kuttet grensefacett gir en for lav
    // grense, og da blir tidligere år for små og prosentene for høye.
    const id = grenseFraFacet(fullIdFacet(svar, `modified ${d}`).counts);
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
