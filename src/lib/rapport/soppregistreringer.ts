/**
 * Soppregistreringer, samme dato som før: er det mindre sopp i år, og hvor?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVORFOR ET RÅTT GBIF-TALL LYVER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Folk legger funn inn i Artsobservasjoner uker og måneder etter turen. Midt
 * i september 2026 fantes bare 57–74 % av et års august-registreringer; rundt
 * 95 % er inne ved nyttår. Et rått tall for i år mot ferdige tall for 2023–25
 * ser derfor ut som «55–60 % av vanlig» — nesten bare etterslep.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * GREPET: TELL TIDLIGERE ÅR SLIK DE STO PÅ SAMME DATO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Artsobservasjoners funn-id (GBIF-feltet catalogNumber) stiger i den
 * rekkefølgen funnene ble LAGT INN (sjekket på 2 700 poster, ingen brudd).
 * For et tidligere år Y er grensen T_Y den høyeste id-en blant postene i
 * datasettet med modified = Y-MM-DD, der MM-DD er datoen på dagens GBIF-
 * utgave (datasettets pubDate). Alt med id ≤ T_Y var lagt inn den dagen.
 * Kontroll: minste id blant funn gjort dagen etter ligger like over T_Y.
 *
 * I år telles alt som står i utgaven; 2023–25 telles bare opp til sin T_Y.
 * Normalen er snittet av de tre, og prosenten er i år mot den.
 *
 * ── HVA TALLET ER, OG IKKE ER ──────────────────────────────────────────────
 *
 * Registreringsaktivitet — ikke soppmengde. Det sier «færre la inn funn fra
 * august enn på samme dato før», ikke «det var mindre sopp». Det vises
 * aldri for kunder, bare i eierens dagsrapport, og alltid med forbeholdet.
 *
 * Denne fila er ren: ingen nettverk, ingen database. Hentingen ligger i
 * soppregistreringer-henting.ts, cronen i api/cron/soppregistreringer.
 */

/** Artsobservasjoner (Norwegian Species Observation Service) i GBIF. ~82–87 % av norske soppfunn. */
export const ARTSOBS_DATASET = 'b124e1e0-4755-430f-9eab-894f25a9b59c';

/** GBIF-backbonens taxonKey for riket sopp. */
export const SOPP_TAXON_KEY = 5;

/**
 * «Storsopp»: de værdrevne kjøttfulle soppene folk plukker og leter etter —
 * skivesopper, rørsopper, kremler/riskere og kantareller med slektninger.
 * orderKey slått opp i GBIF /v1/species/match 17. sep 2026 (rang ORDER,
 * status ACCEPTED, eksakt treff).
 */
export const STORSOPP_ORDENER = {
  Agaricales: 1499,
  Boletales: 1063,
  Russulales: 1144,
  Cantharellales: 1300
} as const;

export type Gruppe = 'alle' | 'storsopp';
export type Vindu = 'sesong' | 'uke';
export const GRUPPER: readonly Gruppe[] = ['alle', 'storsopp'];
export const VINDUER: readonly Vindu[] = ['sesong', 'uke'];

export const NORGE = 'Norge';

/**
 * Fylkene slik de er fra 2024, bygd av GADM 3.6 sine 19 gamle fylker (det er
 * dem GBIF tolker punktene mot). Navnene er sjekket mot
 * GET /v1/geocode/gadm/NOR/subdivisions 17. sep 2026. stateProvince brukes
 * aldri: det er fritekst fra innsenderen, med alle fylkesreformene om hverandre.
 */
export const FYLKER: ReadonlyArray<{ navn: string; gadm: readonly string[] }> = [
  { navn: 'Agder', gadm: ['NOR.3_1', 'NOR.18_1'] }, // Aust-Agder + Vest-Agder
  { navn: 'Akershus', gadm: ['NOR.1_1'] },
  { navn: 'Buskerud', gadm: ['NOR.4_1'] },
  { navn: 'Finnmark', gadm: ['NOR.5_1'] },
  { navn: 'Innlandet', gadm: ['NOR.6_1', 'NOR.11_1'] }, // Hedmark + Oppland
  { navn: 'Møre og Romsdal', gadm: ['NOR.8_1'] },
  { navn: 'Nordland', gadm: ['NOR.10_1'] },
  { navn: 'Oslo', gadm: ['NOR.12_1'] },
  { navn: 'Rogaland', gadm: ['NOR.13_1'] },
  { navn: 'Telemark', gadm: ['NOR.16_1'] },
  { navn: 'Troms', gadm: ['NOR.17_1'] },
  { navn: 'Trøndelag', gadm: ['NOR.9_1', 'NOR.15_1'] }, // Nord- + Sør-Trøndelag
  { navn: 'Vestfold', gadm: ['NOR.19_1'] },
  { navn: 'Vestland', gadm: ['NOR.7_1', 'NOR.14_1'] }, // Hordaland + Sogn og Fjordane
  { navn: 'Østfold', gadm: ['NOR.2_1'] }
];

const FYLKE_FOR_GADM = new Map(FYLKER.flatMap((f) => f.gadm.map((g) => [g, f.navn] as const)));

/** Fylket (2024-inndeling) et GADM 3.6-fylke hører til, eller null. */
export function fylkeForGadm(gid: string): string | null {
  return FYLKE_FOR_GADM.get(gid) ?? null;
}

export interface FacetTelling {
  name: string;
  count: number;
}

/** Summerer en gadmLevel1Gid-facett til 2024-fylkene. Ukjente GID-er (utenfor Norge) hoppes over. */
export function summerPerFylke(counts: readonly FacetTelling[]): Map<string, number> {
  const ut = new Map<string, number>(FYLKER.map((f) => [f.navn, 0]));
  for (const c of counts) {
    const fylke = fylkeForGadm(c.name);
    if (fylke) ut.set(fylke, (ut.get(fylke) ?? 0) + c.count);
  }
  return ut;
}

// ── Id-er og grenser ────────────────────────────────────────────────────────

/** Funn-id → antall poster med den id-en (nesten alltid 1). */
export type IdTelling = ReadonlyMap<number, number>;

/** Bare rene sifre er en Artsobservasjoner-id; alt annet teller ikke under noen grense. */
function somId(name: string): number | null {
  if (!/^\d{1,15}$/.test(name)) return null;
  const n = Number(name);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Leser en catalogNumber-facett. `sum` er postene med en gyldig id, så
 * kalleren kan sammenligne med svarets count og se om noe falt utenfor.
 */
export function lesIdFacet(counts: readonly FacetTelling[]): { ider: Map<number, number>; sum: number } {
  const ider = new Map<number, number>();
  let sum = 0;
  for (const c of counts) {
    const id = somId(c.name);
    if (id === null || !(c.count > 0)) continue;
    ider.set(id, (ider.get(id) ?? 0) + c.count);
    sum += c.count;
  }
  return { ider, sum };
}

/**
 * T_Y: høyeste funn-id blant postene endret på grensedagen. null når dagen
 * ikke har en eneste gyldig id — da finnes ingen grense å regne fra, og
 * kalleren må prøve dagen før (ingen ting ble lagt inn den dagen).
 */
export function grenseFraFacet(counts: readonly FacetTelling[]): number | null {
  let maks: number | null = null;
  for (const c of counts) {
    const id = somId(c.name);
    if (id !== null && c.count > 0 && (maks === null || id > maks)) maks = id;
  }
  return maks;
}

/**
 * Poster med id ≤ grense, valgfritt bare de id-ene som også finnes i hvert
 * av `innenfor`-settene (snittet). Snittet er det som gjør at ett fylkeskall
 * holder: fylkets id-er ∩ Norges storsopp-id-er = fylkets storsopp, fordi
 * hver funn-id er ett funn.
 */
export function tellTilOgMed(ider: IdTelling, grense: number, innenfor: ReadonlyArray<IdTelling> = []): number {
  let n = 0;
  for (const [id, antall] of ider) {
    if (id > grense) continue;
    if (innenfor.some((sett) => !sett.has(id))) continue;
    n += antall;
  }
  return n;
}

// ── Datoer og vinduer ───────────────────────────────────────────────────────

const DAG_MS = 86_400_000;

export function plussDager(iso: string, dager: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dager * DAG_MS).toISOString().slice(0, 10);
}

/** Samme måned og dag i et annet år. 29. februar blir 28. i et vanlig år. */
export function sammeDatoIAar(iso: string, aar: number): string {
  const [, mm, dd] = iso.split('-');
  if (mm === '02' && dd === '29') {
    const skudd = (aar % 4 === 0 && aar % 100 !== 0) || aar % 400 === 0;
    if (!skudd) return `${aar}-02-28`;
  }
  return `${aar}-${mm}-${dd}`;
}

/**
 * Vinduene slutter sju dager før utgaven: funn fra siste uka er knapt lagt
 * inn i noe år, og ville bare gjort prosenten til støy.
 */
export const VINDU_LAG_DAGER = 7;
export const SESONG_START_MMDD = '08-01';
/** Siste dag et sesongvindu kan slutte. Etter det måles ikke før neste august. */
export const SESONG_SLUTT_MMDD = '11-30';

export interface Datovindu {
  fra: string;
  til: string;
}

/**
 * «Sesongen hittil» = 1. august → utgaven − 7 dager. «Siste hele uke» = de
 * sju dagene som slutter samme dag. null utenfor sesongen: uka må ligge
 * inne i sesongvinduet (fra 7. august), ellers stemmer ikke snittet som
 * fylkestallene bygger på, og etter 30. november er det ingen sesong å måle.
 *
 * `sesongTil` overstyrer sluttdatoen (tørrkjøringen mot de verifiserte
 * tallene for 1. aug–7. sep) — grensedatoen er fortsatt utgavens.
 */
export function vinduerFor(snapshot: string, sesongTil?: string): { sesong: Datovindu; uke: Datovindu } | null {
  const aar = Number(snapshot.slice(0, 4));
  const til = sesongTil ?? plussDager(snapshot, -VINDU_LAG_DAGER);
  if (til.slice(0, 4) !== String(aar) || til > snapshot) return null;
  const sesong = { fra: `${aar}-${SESONG_START_MMDD}`, til };
  const uke = { fra: plussDager(til, -6), til };
  if (uke.fra < sesong.fra || til > `${aar}-${SESONG_SLUTT_MMDD}`) return null;
  return { sesong, uke };
}

/** Samme vindu flyttet til et annet år. */
export function vinduIAar(v: Datovindu, aar: number): Datovindu {
  return { fra: sammeDatoIAar(v.fra, aar), til: sammeDatoIAar(v.til, aar) };
}

/** Normalen er snittet av så mange år rett før — rapporteringen vokser år for år, så ikke lenger tilbake. */
export const NORMAL_AAR = 3;

export function normalAarFor(snapshot: string): number[] {
  const aar = Number(snapshot.slice(0, 4));
  return Array.from({ length: NORMAL_AAR }, (_, i) => aar - NORMAL_AAR + i);
}

// ── Normal, prosent og tynt grunnlag ────────────────────────────────────────

/**
 * Tynt grunnlag. To regler; bryter tallet én av dem, får det *:
 *
 * 1. Normalen er under 50 registreringer. Med færre flytter tilfeldig støy
 *    alene prosenten ±15 poeng (√50/50 ≈ 14 %), før noen få ivrige
 *    registrerere er regnet med.
 * 2. De tre årene spriker mer enn tre ganger (største > 3 × minste, eller
 *    et år med null). Ren tilfeldighet gir ikke det når normalen er over 50,
 *    og veksten i rapporteringen 2023–25 er liten (Norge 14,7k / 17,4k /
 *    13,4k på samme dato). En slik sprik betyr at én eller noen få personer
 *    var aktive i ett av årene og ikke de andre — da sier prosenten mer om
 *    dem enn om skogen. Regelen fanger også «et år nesten uten registreringer».
 *
 * Målt på tørrkjøringen 1. aug–7. sep 2026: blant storsopp i fylkene, sesongen
 * hittil, faller Finnmark (355/108/191) og Nordland (242/786/523) på regel 2;
 * i siste hele uke blant annet Telemark (34/47/669) og Nordland (27/436/168).
 */
export const TYNT_MIN_NORMAL = 50;
export const TYNT_MAKS_SPRIK = 3;

export interface SammeDato {
  normal: number | null;
  prosent: number | null;
  tynt: boolean;
}

export function beregnSammeDato(antall: number, perAar: Readonly<Record<string, number>>): SammeDato {
  const verdier = Object.values(perAar).filter((n) => Number.isFinite(n) && n >= 0);
  if (verdier.length === 0) return { normal: null, prosent: null, tynt: true };
  const normal = Math.round((verdier.reduce((a, b) => a + b, 0) / verdier.length) * 10) / 10;
  const prosent = normal > 0 ? Math.round((antall / normal) * 100) : null;
  const minste = Math.min(...verdier);
  const storste = Math.max(...verdier);
  const tynt = verdier.length < NORMAL_AAR || normal < TYNT_MIN_NORMAL || storste > TYNT_MAKS_SPRIK * minste;
  return { normal, prosent, tynt };
}

// ── Radene i tabellen ───────────────────────────────────────────────────────

/** Én rad i soppregistreringer (migrasjon 071), i appens navn. */
export interface SoppregistreringRad {
  snapshot: string;
  vindu: Vindu;
  fra: string;
  til: string;
  /** «Norge» eller et 2024-fylke. */
  omrade: string;
  gruppe: Gruppe;
  antall: number;
  normal: number | null;
  prosent: number | null;
  tynt: boolean;
  /** Tidligere års tall på samme dato, nøkkel = år. */
  perAar: Record<string, number>;
  /** Grensene som ble brukt: år → { dato, id }. */
  grenser: Record<string, { dato: string; id: number }>;
}

/** Alle områdene i fast rekkefølge: Norge først, så fylkene alfabetisk. */
export const OMRADER: readonly string[] = [NORGE, ...FYLKER.map((f) => f.navn)];

export interface Telleresultat {
  /** I år: vindu → gruppe → område → antall. */
  iAar: Record<Vindu, Record<Gruppe, Map<string, number>>>;
  /** Tidligere år: år → vindu → gruppe → område → antall på samme dato. */
  tidligere: Map<number, Record<Vindu, Record<Gruppe, Map<string, number>>>>;
  grenser: Record<string, { dato: string; id: number }>;
}

/** Setter sammen tabellradene (2 vinduer × 2 grupper × 16 områder = 64). */
export function byggRader(snapshot: string, vinduer: { sesong: Datovindu; uke: Datovindu }, t: Telleresultat): SoppregistreringRad[] {
  const rader: SoppregistreringRad[] = [];
  for (const vindu of VINDUER) {
    for (const gruppe of GRUPPER) {
      for (const omrade of OMRADER) {
        const perAar: Record<string, number> = {};
        for (const [aar, tall] of [...t.tidligere.entries()].sort((a, b) => a[0] - b[0])) {
          perAar[String(aar)] = tall[vindu][gruppe].get(omrade) ?? 0;
        }
        const antall = t.iAar[vindu][gruppe].get(omrade) ?? 0;
        rader.push({
          snapshot,
          vindu,
          fra: vinduer[vindu].fra,
          til: vinduer[vindu].til,
          omrade,
          gruppe,
          antall,
          ...beregnSammeDato(antall, perAar),
          perAar,
          grenser: t.grenser
        });
      }
    }
  }
  return rader;
}

/** Radene slik de skrives til tabellen (snake_case). */
export function tilTabellrad(r: SoppregistreringRad) {
  return {
    snapshot: r.snapshot,
    vindu: r.vindu,
    fra: r.fra,
    til: r.til,
    omrade: r.omrade,
    gruppe: r.gruppe,
    antall: r.antall,
    normal: r.normal,
    prosent: r.prosent,
    tynt: r.tynt,
    per_aar: r.perAar,
    grenser: r.grenser
  };
}

/** Tilbake fra tabellen. Tall fra PostgREST kan komme som tekst (numeric). */
export function fraTabellrad(r: Record<string, unknown>): SoppregistreringRad {
  const tall = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    snapshot: String(r.snapshot),
    vindu: r.vindu === 'uke' ? 'uke' : 'sesong',
    fra: String(r.fra),
    til: String(r.til),
    omrade: String(r.omrade),
    gruppe: r.gruppe === 'storsopp' ? 'storsopp' : 'alle',
    antall: Number(r.antall),
    normal: tall(r.normal),
    prosent: tall(r.prosent),
    tynt: r.tynt === true,
    perAar: (r.per_aar ?? {}) as Record<string, number>,
    grenser: (r.grenser ?? {}) as Record<string, { dato: string; id: number }>
  };
}

// ── Rapportblokken ──────────────────────────────────────────────────────────

export interface Registreringscelle {
  omrade: string;
  antall: number;
  normal: number | null;
  prosent: number | null;
  tynt: boolean;
}

export interface Registreringsblokk {
  snapshot: string;
  sesong: Datovindu & { alle: Registreringscelle | null; storsopp: Registreringscelle | null };
  uke: Datovindu & { alle: Registreringscelle | null; storsopp: Registreringscelle | null };
  /** Fylkene med lavest og høyest storsopp-prosent, sesongen hittil. Tynne tas med og merkes. */
  lavest: Registreringscelle[];
  hoyest: Registreringscelle[];
}

export const REGISTRERING_FORBEHOLD =
  'Registreringer, ikke soppmengde. Mange funn legges inn uker og måneder etter turen, så tidligere år telles slik de så ut på samme dato. * = tynt grunnlag.';

const RANGERING_ANTALL = 3;

/**
 * Rapportblokken fra radene for ÉN utgave (den nyeste). null når det ikke
 * finnes rader — rapporten skriver da «ikke målt ennå».
 */
export function byggRegistreringsblokk(rader: readonly SoppregistreringRad[]): Registreringsblokk | null {
  if (rader.length === 0) return null;
  const snapshot = [...rader].map((r) => r.snapshot).sort().at(-1)!;
  const egne = rader.filter((r) => r.snapshot === snapshot);
  const celle = (r: SoppregistreringRad | undefined): Registreringscelle | null =>
    r ? { omrade: r.omrade, antall: r.antall, normal: r.normal, prosent: r.prosent, tynt: r.tynt } : null;
  const finn = (vindu: Vindu, gruppe: Gruppe, omrade: string) =>
    egne.find((r) => r.vindu === vindu && r.gruppe === gruppe && r.omrade === omrade);
  const forste = (vindu: Vindu) => egne.find((r) => r.vindu === vindu);

  const fylker = egne
    .filter((r) => r.vindu === 'sesong' && r.gruppe === 'storsopp' && r.omrade !== NORGE && r.prosent !== null)
    .map((r) => celle(r)!);
  const stigende = [...fylker].sort((a, b) => a.prosent! - b.prosent! || a.omrade.localeCompare(b.omrade, 'nb'));
  const lavest = stigende.slice(0, RANGERING_ANTALL);
  const lavNavn = new Set(lavest.map((c) => c.omrade));
  const hoyest = [...fylker]
    .filter((c) => !lavNavn.has(c.omrade))
    .sort((a, b) => b.prosent! - a.prosent! || a.omrade.localeCompare(b.omrade, 'nb'))
    .slice(0, RANGERING_ANTALL);

  const vinduDel = (vindu: Vindu) => ({
    fra: forste(vindu)?.fra ?? '',
    til: forste(vindu)?.til ?? '',
    alle: celle(finn(vindu, 'alle', NORGE)),
    storsopp: celle(finn(vindu, 'storsopp', NORGE))
  });

  return { snapshot, sesong: vinduDel('sesong'), uke: vinduDel('uke'), lavest, hoyest };
}

/** «91 %», «16 %*» eller «—». */
export function prosentTekst(c: Registreringscelle | null): string {
  if (!c || c.prosent === null) return '—';
  return `${c.prosent} %${c.tynt ? '*' : ''}`;
}

/** «12.9.» for 2026-09-12. */
export function kortDato(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.` : '';
}

/** «1.8.–5.9.» — kort nok til en telefonskjerm. */
export function kortPeriode(v: Datovindu): string {
  return v.fra && v.til ? `${kortDato(v.fra)}–${kortDato(v.til)}` : '';
}
