import type { BillingSubscription } from './subscription';
import { harHattStripeAbonnementFor, harHattTilgangIRaden, type StripeKallValg, type StripeKundeoppslag } from './tidligere-abonnent';

/**
 * Kan en VISNINGSFLATE love gratisuka? Samme regel som checkout
 * (tidligere-abonnent.ts) — men med frist, og med «vet ikke» som eget svar.
 *
 * ── HVORFOR DEN FINNES ──────────────────────────────────────────────────────
 *
 * Forsiden kalte `harHattTilgangFor` for hver eneste gratisbruker, på hver
 * eneste visning. Den slo opp e-posten hos Stripe (customers.list, så
 * subscriptions.list per kunde) med klientens daværende standardvalg: 80
 * sekunders tidsavbrudd og ett nytt forsøk. Oppslaget var dokumentert som
 * «best effort», men siden ventet på det — så et tregt Stripe hang forsiden
 * for alle som ikke betaler, altså nesten alle.
 *
 * ── HVORFOR IKKE BARE `harHattTilgangFor` ───────────────────────────────────
 *
 * Den funksjonen har sin egen frist (5 s samlet), og går den ut, svarer den
 * «ikke hatt tilgang før» — altså prøven. Det er riktig for statusruta og
 * checkout, som MÅ svare likt: den ene lover uka, den andre gir den.
 *
 * Forsiden avgjør ingenting. Den trenger derfor ikke gjette når Stripe er
 * tregt: den venter kortere (halvparten) og lar være å love noe. Slik kan en
 * treg dag aldri få den første skjermen i appen til å love en uke kjøpet
 * nekter, og innholdet på forsiden står ikke og venter i fem sekunder på et
 * svar som bare avgjør teksten på en knapp.
 *
 * ── TRE SVAR, IKKE TO ───────────────────────────────────────────────────────
 *
 *   'ny'         ingen historikk — flaten kan love gratisuka
 *   'tidligere'  har hatt tilgang før — ingen ny uke
 *   'ukjent'     Stripe svarte ikke i tide, eller feilet — flaten lover INGENTING
 *
 * «Vet ikke» skal ikke leses som «ny»: da kan forsiden love en uke kjøpet
 * nekter (kjøpet gjør sitt eget oppslag, et øyeblikk senere), som er feilen
 * tidligere-abonnent.ts ble skrevet for å fjerne. Nøytral tekst én visning er
 * billig; checkout gir fortsatt uka til den som har krav på den.
 *
 * Selve REGELEN (hvilke Stripe-kunder som teller) ligger fortsatt ett sted:
 * denne fila kaller `harHattStripeAbonnementFor` gjennom en innpakket klient
 * som bare legger på frist og per-kall-valg. Skriv aldri løkka en gang til
 * her — to utgaver av regelen er to svar på samme spørsmål.
 *
 * Ingen cache: et negativt svar som huskes, lover uka til en som nettopp har
 * kjøpt, slettet kontoen og registrert seg på nytt.
 */

export type Provesvar = 'ny' | 'tidligere' | 'ukjent';

/** Så lenge venter en visningsflate på Stripe før den lar være å love noe. */
export const VISNINGSFRIST_MS = 2_500;

/**
 * Per-kall-valgene stripe-node tar som andre argument, og undersettet av
 * Stripe-klienten oppslaget bruker. Begge er regelens egne typer
 * (tidligere-abonnent.ts) — den ekte klienten passer rett inn, og tester kan
 * se hva som ble sendt. Navnene står igjen fordi flaten og testene bruker dem.
 */
export type StripeForesporselsvalg = StripeKallValg;
export type StripeKundeoppslagMedValg = StripeKundeoppslag;

/** Bare et uttrykkelig «ny» er et ja. */
export function kanLoveProve(svar: Provesvar): boolean {
  return svar === 'ny';
}

/**
 * @param stripe lages først når raden ikke alt har svart. Kaster den
 *   (STRIPE_SECRET_KEY mangler), er svaret 'ny' — som i tidligere-abonnent.ts:
 *   uten nøkkel finnes det heller ingen checkout som kan nekte uka.
 * @param fristMs ÉN frist for hele oppslaget (opptil 1 + 5 kall), ikke per kall.
 */
export async function provesvarForVisning(args: {
  subscription: Pick<BillingSubscription, 'stripe_subscription_id' | 'metadata'> | null | undefined;
  email: string | null | undefined;
  stripe: () => StripeKundeoppslagMedValg;
  fristMs?: number;
}): Promise<Provesvar> {
  if (harHattTilgangIRaden(args.subscription)) return 'tidligere';
  if (!args.email) return 'ny';

  let klient: StripeKundeoppslagMedValg;
  try {
    klient = args.stripe();
  } catch {
    return 'ny';
  }

  const fristMs = args.fristMs ?? VISNINGSFRIST_MS;
  const start = Date.now();
  // Regelen under svelger feil og svarer «nei». Her må vi vite forskjellen på
  // «Stripe sa nei» og «Stripe svarte ikke».
  let ubesvart = false;

  const medFrist =
    <P, R>(kall: (p: P, valg: StripeForesporselsvalg) => Promise<R>) =>
    async (p: P): Promise<R> => {
      try {
        const igjen = fristMs - (Date.now() - start);
        if (igjen <= 0) throw new Error('Fristen for Stripe-oppslaget er brukt opp.');
        // timeout bryter selve forbindelsen (en ren Promise.race lar kallet stå
        // og gå), og uten nye forsøk kan ikke ett kall bruke fristen to ganger.
        // Heltall over null: stripe-node overser alt annet og faller STILLE
        // tilbake på sine 80 sekunder.
        return await kall(p, { timeout: Math.max(1, Math.ceil(igjen)), maxNetworkRetries: 0 });
      } catch (feil) {
        ubesvart = true;
        throw feil;
      }
    };

  const avgrenset: StripeKundeoppslag = {
    customers: { list: medFrist((p, valg) => klient.customers.list(p, valg)) },
    subscriptions: { list: medFrist((p, valg) => klient.subscriptions.list(p, valg)) }
  };

  const oppslag = harHattStripeAbonnementFor(avgrenset, args.email).then<Provesvar>((hatt) =>
    // Et funn er et funn, også om et annet kall feilet underveis.
    hatt ? 'tidligere' : ubesvart ? 'ukjent' : 'ny'
  );

  // Livreim: klientens timeout måler stillstand på forbindelsen, ikke total
  // tid. Siden skal aldri vente lenger enn fristen uansett.
  let tidtaker: ReturnType<typeof setTimeout> | undefined;
  const frist = new Promise<Provesvar>((resolve) => {
    tidtaker = setTimeout(() => resolve('ukjent'), fristMs);
  });
  try {
    return await Promise.race([oppslag, frist]);
  } finally {
    clearTimeout(tidtaker);
  }
}
