import { BILLING_PLANS, STRIPE_PROVEDAGER, type IapPlan } from './plans';

/**
 * Hva kan vi love om de to abonnementene — pris, og finnes gratisuka?
 *
 * På nett er svaret kjent med én gang: Stripe gir STRIPE_PROVEDAGER dager
 * til førstegangskjøpere på BEGGE planene (checkout-ruta), og arket vises
 * bare til dem (kanFaaProveperiode). I appen er det App Store som avgjør,
 * per produkt og per Apple-ID, så svaret må hentes fra RevenueCat — og
 * hentes for hver plan for seg: et introtilbud på det månedlige produktet
 * sier ingenting om sesongpasset.
 *
 * Til det er hentet, sier arket ingenting om en gratis uke. Et ark som lover
 * «7 dager gratis» til en som blir belastet på dag én, er verre enn et ark
 * uten løftet — det er en refusjon og en anmeldelse i vente.
 *
 * Prisen blandes aldri: i appen er hvert tall butikkens priceString, på nett
 * Stripe-beløpet fra BILLING_PLANS. Sju av åtte prøver siden 12. september
 * 2026 valgte måned, fordi arket bare leste Premium-tilbudet — nå kjenner
 * det begge, og leder med passet (docs/konvertering-og-gjenbruk-2026-09.md).
 *
 * Ren del (type + valg av tilbud), så reglene kan testes uten RevenueCat.
 * Selve hentingen ligger i src/lib/hooks/useProveLofte.ts.
 */
export interface PlanLofte {
  plan: IapPlan;
  harProve: boolean;
  proveDager: number | null;
  /** Prisen slik den skal vises: butikkens priceString i appen («kr 249,00»), Stripe-beløpet på nett («249 kr»). */
  pris: string;
}

export type ProveLofte =
  | { kjent: false }
  | {
      kjent: true;
      /** Null når planen ikke finnes i butikkens tilbud — da loves ingenting om den. */
      season_pass: PlanLofte | null;
      premium: PlanLofte | null;
    };

export const PROVE_LOFTE_WEB: ProveLofte = {
  kjent: true,
  season_pass: {
    plan: 'season_pass',
    harProve: true,
    proveDager: STRIPE_PROVEDAGER,
    pris: `${BILLING_PLANS.season_pass.yearlyNok ?? 249} kr`
  },
  premium: {
    plan: 'premium',
    harProve: true,
    proveDager: STRIPE_PROVEDAGER,
    pris: `${BILLING_PLANS.premium.monthlyNok ?? 99} kr`
  }
};
export const PROVE_LOFTE_UKJENT: ProveLofte = { kjent: false };
/** Butikken svarte, men uten noe vi kan love. Samme objekt hver gang, så kalleren kan kjenne det igjen. */
export const PROVE_LOFTE_INGEN: ProveLofte = { kjent: true, season_pass: null, premium: null };

/** Undersettet av IapOffer løftet leses fra. */
export interface ProveTilbudLike {
  plan: string;
  harProve: boolean;
  proveDager: number | null;
  priceString: string;
}

/**
 * Hver plan leses fra SITT tilbud i butikken. Å la det ene svare for det
 * andre ga arket «kr 249,00 per måned» og en gratisuke lovet fra feil produkt.
 * Mangler begge, loves ingenting.
 */
export function lofteFraTilbud(tilbud: ReadonlyArray<ProveTilbudLike>): ProveLofte {
  const les = (plan: IapPlan): PlanLofte | null => {
    const o = tilbud.find((t) => t.plan === plan);
    return o ? { plan, harProve: o.harProve, proveDager: o.proveDager, pris: o.priceString } : null;
  };
  const season_pass = les('season_pass');
  const premium = les('premium');
  if (!season_pass && !premium) return PROVE_LOFTE_INGEN;
  return { kjent: true, season_pass, premium };
}

/** Planens tilbud — null før butikken har svart, og når planen ikke finnes der. */
export function planLofte(lofte: ProveLofte, plan: IapPlan): PlanLofte | null {
  return lofte.kjent ? lofte[plan] : null;
}

/**
 * Står løftet om en gratis prøveperiode — nå, med det vi vet? Sesongpasset
 * er planen alle knappene leder til, så det er standarden; tekster som
 * navngir Premium spør om Premium.
 */
export function harProveLofte(lofte: ProveLofte, plan: IapPlan = 'season_pass'): boolean {
  return planLofte(lofte, plan)?.harProve === true;
}
