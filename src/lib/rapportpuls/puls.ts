/**
 * Rapportpuls: rapportaktivitet i Artsobservasjoner/GBIF per område i uka som
 * gikk, mot samme uke de foregående årene og mot uka før.
 *
 * Hva det ER: et tegn på at det skjer noe i skogen — folk som registrerer,
 * registrerer mer når det er sopp. Hva det IKKE er: et mål på hvor soppen
 * står (punktene sier hvor folk går — docs/mikro-prediksjon-gjennomgang.md)
 * og ikke en utløser for varsel (fasiten teller de samme rapportene).
 *
 * Etterslep: GBIF får de norske rapportene over ~en uke (målt 14. sep 2026:
 * et vindu som slutter i dag holder ~40 % av det et uke gammelt vindu holder,
 * se migrasjon 069). Derfor slutter vinduet PULS_LAG_DAGER dager tilbake, og
 * trenden mot uka før sammenligner to rader med samme alder — aldri et
 * ferskt tall mot et gammelt. Sammenligningen med tidligere år ligger
 * likevel litt lavt (sen-opplastinger over måneder), så «under» krever mer
 * enn «over».
 *
 * Alle sopparter, ikke per art. Bare Norge: Artportalen leverer til GBIF med
 * ukers etterslep.
 */

/** Vinduet slutter så mange dager før «dag». 7 = ~98 % av platået (migrasjon 069). */
export const PULS_LAG_DAGER = 7;
export const PULS_MIN_BASELINE = 10;
export const PULS_OVER_PST = 30;
export const PULS_UNDER_PST = -40;
export const PULS_TREND_PST = 30;
export const PULS_AAR_TILBAKE = 3;

export type PulsNivaa = 'over' | 'vanlig' | 'under' | 'tynt';

export interface PulsInn {
  /** ISO-datoer for vinduet [fra, til], begge inkludert. */
  fra: string;
  til: string;
  siste7: number;
  /** Samme vindu de foregående årene (null = ikke hentet). */
  tidligereAar: Array<number | null>;
  /** siste7 fra raden sju dager tidligere (samme alder), null første uka. */
  forrigeUke?: number | null;
}

export interface Puls {
  fra: string;
  til: string;
  siste7: number;
  /** Snitt av samme vindu de foregående årene; null når ingen år kunne hentes. */
  baseline: number | null;
  avvikPst: number | null;
  aarBrukt: number;
  nivaa: PulsNivaa;
  forrigeUke: number | null;
  /** Endring mot uka før (samme alder); null uten forrige uke eller for tynne tall. */
  trendPst: number | null;
}

export function beregnPuls(inn: PulsInn): Puls {
  const gyldige = inn.tidligereAar.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0);
  const forrigeUke = typeof inn.forrigeUke === 'number' && Number.isFinite(inn.forrigeUke) ? inn.forrigeUke : null;
  const trendPst =
    forrigeUke !== null && forrigeUke >= PULS_MIN_BASELINE ? Math.round(((inn.siste7 - forrigeUke) / forrigeUke) * 100) : null;
  const felles = { fra: inn.fra, til: inn.til, siste7: inn.siste7, forrigeUke, trendPst, aarBrukt: gyldige.length };
  if (gyldige.length === 0) return { ...felles, baseline: null, avvikPst: null, nivaa: 'tynt' };
  const baseline = Math.round((gyldige.reduce((a, b) => a + b, 0) / gyldige.length) * 10) / 10;
  if (baseline < PULS_MIN_BASELINE) return { ...felles, baseline, avvikPst: null, nivaa: 'tynt' };
  const avvikPst = Math.round(((inn.siste7 - baseline) / baseline) * 100);
  const nivaa: PulsNivaa = avvikPst >= PULS_OVER_PST ? 'over' : avvikPst <= PULS_UNDER_PST ? 'under' : 'vanlig';
  return { ...felles, baseline, avvikPst, nivaa };
}

/** Vinduet [dag−lag−6, dag−lag] som ISO-datoer, valgfritt n år tidligere. */
export function pulsVindu(dagIso: string, aarTilbake = 0, lagDager = PULS_LAG_DAGER): { fra: string; til: string } {
  const til = new Date(`${dagIso}T00:00:00Z`);
  til.setUTCFullYear(til.getUTCFullYear() - aarTilbake);
  til.setUTCDate(til.getUTCDate() - lagDager);
  const fra = new Date(til.getTime() - 6 * 86_400_000);
  return { fra: fra.toISOString().slice(0, 10), til: til.toISOString().slice(0, 10) };
}

const MND = {
  nb: ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'],
  sv: ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']
} as const;

/** «1.–7. september» (nb) / «1–7 september» (sv); over månedsskifte «29. august–4. september». */
export function pulsPeriode(fra: string, til: string, locale: 'nb' | 'sv' = 'nb'): string {
  const [, fm, fd] = fra.split('-').map(Number);
  const [, tm, td] = til.split('-').map(Number);
  const pkt = locale === 'nb' ? '.' : '';
  const m = MND[locale];
  if (fm === tm) return `${fd}${pkt}–${td}${pkt} ${m[tm - 1]}`;
  return `${fd}${pkt} ${m[fm - 1]}–${td}${pkt} ${m[tm - 1]}`;
}

function trendDel(p: Puls, locale: 'nb' | 'sv'): string {
  if (p.trendPst === null || Math.abs(p.trendPst) < PULS_TREND_PST) return '';
  const n = Math.abs(p.trendPst);
  if (locale === 'sv') return p.trendPst > 0 ? ` och ${n} % fler än veckan innan` : ` men ${n} % färre än veckan innan`;
  return p.trendPst > 0 ? ` og ${n} % flere enn uka før` : ` men ${n} % færre enn uka før`;
}

const COPY = {
  nb: {
    over: (p: Puls, per: string) =>
      `Uka ${per}: ${p.siste7} soppfunn registrert i Artsobservasjoner her, ${p.avvikPst} % over det vanlige for uka${trendDel(p, 'nb')}.`,
    under: (p: Puls, per: string) =>
      `Uka ${per}: ${p.siste7} soppfunn registrert i Artsobservasjoner her, ${Math.abs(p.avvikPst ?? 0)} % under det vanlige for uka${trendDel(p, 'nb')}.`,
    vanlig: (p: Puls, per: string) =>
      `Uka ${per}: ${p.siste7} soppfunn registrert i Artsobservasjoner her, omtrent som vanlig for uka${trendDel(p, 'nb')}.`,
    kilde: 'Rapporter fra folk som registrerer, alle arter, med en ukes etterslep — et tegn på aktivitet, ikke et kart over soppen.'
  },
  sv: {
    over: (p: Puls, per: string) =>
      `Veckan ${per}: ${p.siste7} svampfynd registrerade i Artsobservasjoner här, ${p.avvikPst} % över det vanliga för veckan${trendDel(p, 'sv')}.`,
    under: (p: Puls, per: string) =>
      `Veckan ${per}: ${p.siste7} svampfynd registrerade i Artsobservasjoner här, ${Math.abs(p.avvikPst ?? 0)} % under det vanliga för veckan${trendDel(p, 'sv')}.`,
    vanlig: (p: Puls, per: string) =>
      `Veckan ${per}: ${p.siste7} svampfynd registrerade i Artsobservasjoner här, ungefär som vanligt för veckan${trendDel(p, 'sv')}.`,
    kilde: 'Rapporter från folk som registrerar, alla arter, med en veckas eftersläpning — ett tecken på aktivitet, inte en karta över svampen.'
  }
} as const;

/** Én setning for e-post/rapport, eller null når tallet er for tynt til å si noe. */
export function pulsLinje(p: Puls | null | undefined, locale: 'nb' | 'sv' = 'nb'): string | null {
  if (!p || p.nivaa === 'tynt' || p.avvikPst === null) return null;
  return COPY[locale][p.nivaa](p, pulsPeriode(p.fra, p.til, locale));
}

export function pulsKilde(locale: 'nb' | 'sv' = 'nb'): string {
  return COPY[locale].kilde;
}

/** Kort variant til X (280 tegn er trangt): bare når det er over vanlig. */
export function pulsKortLinje(region: string, p: Puls | null | undefined): string | null {
  if (!p || p.nivaa !== 'over' || p.avvikPst === null) return null;
  return `Artsobservasjoner uka ${pulsPeriode(p.fra, p.til)}: ${p.siste7} soppfunn i ${region}, ${p.avvikPst} % over vanlig.`;
}
