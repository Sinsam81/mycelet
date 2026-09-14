import { STRIPE_PROVEDAGER } from './plans';

/**
 * Finnes gratisuka for denne brukeren — og hvor lang er den?
 *
 * På nett er svaret kjent med én gang: Stripe gir STRIPE_PROVEDAGER dager
 * til førstegangskjøpere (checkout-ruta), og arket vises bare til dem
 * (kanFaaProveperiode). I appen er det App Store som avgjør, per produkt og
 * per Apple-ID, så svaret må hentes fra RevenueCat (IapOffer.harProve).
 *
 * Til det er hentet, sier arket ingenting om en gratis uke. Et ark som lover
 * «7 dager gratis» til en som blir belastet på dag én, er verre enn et ark
 * uten løftet — det er en refusjon og en anmeldelse i vente.
 *
 * Ren del (type + valg av tilbud), så reglene kan testes uten RevenueCat.
 * Selve hentingen ligger i src/lib/hooks/useProveLofte.ts.
 */
export type ProveLofte =
  | { kjent: false }
  | {
      kjent: true;
      harProve: boolean;
      proveDager: number | null;
      /** Butikkens formaterte månedspris («kr 79,00»), når vi har den. */
      pris: string | null;
    };

export const PROVE_LOFTE_WEB: ProveLofte = { kjent: true, harProve: true, proveDager: STRIPE_PROVEDAGER, pris: null };
export const PROVE_LOFTE_UKJENT: ProveLofte = { kjent: false };
/** Butikken svarte, men uten noe vi kan love. Samme objekt hver gang, så kalleren kan kjenne det igjen. */
export const PROVE_LOFTE_INGEN: ProveLofte = { kjent: true, harProve: false, proveDager: null, pris: null };

/** Undersettet av IapOffer løftet leses fra. */
export interface ProveTilbudLike {
  plan: string;
  harProve: boolean;
  proveDager: number | null;
  priceString: string;
}

/**
 * Arket og Premium-tekstene selger Premium (månedlig), så bare DET tilbudets
 * svar teller. Å falle tilbake på sesongpasset ga arket «kr 249,00 per måned»
 * og en gratisuke lovet fra feil produkt — under en Premium-overskrift som
 * ledet til en prisside der Premium sto uten prøveperiode. Mangler Premium i
 * butikkens tilbud, loves ingenting.
 */
export function lofteFraTilbud(tilbud: ReadonlyArray<ProveTilbudLike>): ProveLofte {
  const premium = tilbud.find((o) => o.plan === 'premium');
  if (!premium) return PROVE_LOFTE_INGEN;
  return { kjent: true, harProve: premium.harProve, proveDager: premium.proveDager, pris: premium.priceString };
}

/** Står løftet om en gratis prøveperiode — nå, med det vi vet? */
export function harProveLofte(lofte: ProveLofte): boolean {
  return lofte.kjent && lofte.harProve;
}
