/**
 * Finnes gratisuka egentlig i App Store?
 *
 * Arket og prissiden sa «7 dager gratis» til alle, også i appen — men der er
 * det Apple som avgjør om det finnes et introduksjonstilbud på produktet, og
 * bare det månedlige er bevist (docs/konvertering-og-gjenbruk-2026-09.md § 4,
 * tiltak 1b og 4). Et løfte om en gratis uke som ender i en belastning på dag
 * én er nettopp den typen ting som gir refusjoner og én-stjernes anmeldelser.
 *
 * RevenueCat legger butikkens introduksjonstilbud på produktet som
 * `introPrice` (null når det ikke finnes). En gratis prøveperiode er et
 * introtilbud med pris 0; et introtilbud med pris > 0 er en rabatt, ikke en
 * gratisuke, og gir derfor ikke harProve.
 *
 * Kvalifisering: RevenueCat kan i tillegg si om AKKURAT denne Apple-ID-en
 * kan få tilbudet (checkTrialOrIntroductoryPriceEligibility). Den svarer
 * INELIGIBLE (1) når Apple-ID-en har hatt abonnement i gruppen før — da
 * finnes tilbudet, men ikke for denne kunden, og løftet skal bort. UNKNOWN
 * (0) er vanlig (eldre iOS, manglende gruppeinfo) og tolkes som «tilbudet
 * finnes» — kanFaaProveperiode i provetilbud.ts har allerede silt bort dem
 * som har hatt abonnement hos oss.
 */

/** Undersettet av RevenueCats PurchasesIntroPrice vi leser. */
export interface IntroPrisLike {
  price: number;
  /** DAY · WEEK · MONTH · YEAR (RevenueCat skriver dem med store bokstaver). */
  periodUnit?: string | null;
  periodNumberOfUnits?: number | null;
  /** ISO 8601, f.eks. «P1W» — reserve når enheten mangler. */
  period?: string | null;
  /** Antall faktureringsperioder tilbudet varer; gratisuka har 1. */
  cycles?: number | null;
}

export interface ProveInfo {
  /** Butikken gir en gratis prøveperiode på produktet (for denne kunden, så langt vi vet). */
  harProve: boolean;
  /** Prøveperiodens lengde i dager, når den er kjent. */
  proveDager: number | null;
}

/** RevenueCats INTRO_ELIGIBILITY_STATUS_INELIGIBLE. */
export const INTRO_IKKE_KVALIFISERT = 1;

const DAGER_PER_ENHET: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

/** «P1W» → 7, «P3D» → 3, «P1M» → 30. Null når strengen ikke er en enkel periode. */
export function dagerFraIsoPeriode(period: string | null | undefined): number | null {
  if (!period) return null;
  const m = /^P(\d+)([DWMY])$/i.exec(period.trim());
  if (!m) return null;
  const antall = Number(m[1]);
  const enhet = { D: 'DAY', W: 'WEEK', M: 'MONTH', Y: 'YEAR' }[m[2].toUpperCase()];
  if (!enhet || !Number.isFinite(antall) || antall <= 0) return null;
  return antall * DAGER_PER_ENHET[enhet];
}

export function proveDagerFra(intro: IntroPrisLike): number | null {
  const enhet = intro.periodUnit ? DAGER_PER_ENHET[intro.periodUnit.toUpperCase()] : undefined;
  const antall = typeof intro.periodNumberOfUnits === 'number' && intro.periodNumberOfUnits > 0 ? intro.periodNumberOfUnits : null;
  let dager: number | null = enhet && antall ? enhet * antall : dagerFraIsoPeriode(intro.period);
  if (dager === null) return null;
  if (typeof intro.cycles === 'number' && intro.cycles > 1) dager *= intro.cycles;
  return dager;
}

/**
 * @param intro produktets introPrice fra RevenueCat (null = ingen introtilbud)
 * @param kvalifisering INTRO_ELIGIBILITY_STATUS for produktet, når vi har fått den
 */
export function lesProve(intro: IntroPrisLike | null | undefined, kvalifisering?: number | null): ProveInfo {
  if (!intro || typeof intro.price !== 'number' || intro.price > 0) return { harProve: false, proveDager: null };
  if (kvalifisering === INTRO_IKKE_KVALIFISERT) return { harProve: false, proveDager: null };
  return { harProve: true, proveDager: proveDagerFra(intro) };
}
