import { isPaidTier, type BillingTier } from './plans';
import { MANUAL_GRANT_SOURCE } from './revenuecat';
import { avslutningsfrist } from './prove-paaminnelse-app';
import { intlLocale } from '@/lib/utils/intl-locale';

/**
 * HVOR et abonnement ble kjøpt — og dermed hvor det endres og avsluttes.
 *
 * Kanalen leses av billing-raden, aldri av plattformen kunden står på nå:
 * en som kjøpte på mycelet.com og bruker appen har ingenting hos Apple, og en
 * App Store-kunde på nett har ingen Stripe-portal. Prissiden blandet de to —
 * «Administrer abonnement» ble vist for alle betalende på nett (og svarte
 * «fant ingen betalingskonto» for Apple-kunder og gavepass), mens alle i
 * appen ble sendt til Apple, også Stripe-kundene. Det er oppsigelsesfriksjon,
 * og regelen her er at det ikke skal finnes.
 *
 * Samme rekkefølge som `betalingskilde` i src/lib/rapport/abonnement.ts: et
 * manual_grant-merke vinner over provider (et gavepass lagt over en gammel
 * butikkrad er ikke et kjøp). Rent, uten server-importer — brukes fra både
 * prissiden (klient) og profilsiden (server).
 */
export type AbonnementKanal = 'stripe' | 'apple' | 'tildelt';

export interface KanalRad {
  tier?: BillingTier | string | null;
  stripe_subscription_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function abonnementKanal(rad: KanalRad | null | undefined): AbonnementKanal | null {
  if (!rad) return null;
  const meta = rad.metadata ?? null;
  if (meta?.source === MANUAL_GRANT_SOURCE || meta?.provider === MANUAL_GRANT_SOURCE) return 'tildelt';
  if (meta?.provider === 'revenuecat') return 'apple';
  if (meta?.provider === 'stripe' || rad.stripe_subscription_id) return 'stripe';
  // Betalt plan uten butikk bak: satt inn for hånd.
  if (typeof rad.tier === 'string' && isPaidTier(rad.tier as BillingTier)) return 'tildelt';
  return null;
}

/** Nøklene i `Pricing`-navnerommet for datolinja på statuskortet. */
export type PeriodelinjeNokkel =
  | 'periodRenews'
  | 'periodEndsNoCharge'
  | 'periodTrialFirstCharge'
  | 'periodTrialCancelBy'
  | 'periodTrialChargeBy'
  | 'periodTrialEndsNoCharge'
  | 'periodAccessUntil'
  | 'periodAccessEnded';

export interface PeriodelinjeInn {
  status: string | null | undefined;
  cancelAtPeriodEnd: boolean | null | undefined;
  periodeSlutt: string | null | undefined;
  kanal: AbonnementKanal | null;
  /** Radens metadata. `rc_event_type` skiller en oppsigelse fra et betalingsproblem. */
  metadata?: Record<string, unknown> | null;
  naa: Date;
}

const TIME_MS = 3600_000;

/**
 * Er `cancel_at_period_end` kundens EGEN oppsigelse? Bare da kan kortet love
 * «du belastes ikke igjen».
 *
 * Hos Stripe settes flagget når abonnementet sies opp (portalen).
 * RevenueCat-webhooken setter det også ved BILLING_ISSUE med frist
 * (revenuecat.ts): kortet ble avvist, tilgangen holdes til fristen, og Apple
 * fortsetter å forsøke trekket. Den kunden har ikke sagt opp noe, og blir
 * belastet når forsøket lykkes.
 *
 * Webhooken lagrer siste hendelse som `rc_event_type`. For en App Store-rad
 * regnes oppsigelsen derfor bare som frivillig når den hendelsen var
 * CANCELLATION; alt annet (BILLING_ISSUE, TRANSFER, ukjent) får den nøytrale
 * «Tilgang til {dato}», som er sann uansett.
 *
 * Kjent grense, lukket i webhooken (november 2026): ved et betalingsproblem
 * sender RevenueCat også en CANCELLATION med cancel_reason=BILLING_ERROR. Så
 * lenge den ble skrevet, kunne den stå sist på raden og se ut som en frivillig
 * oppsigelse her. Nå skriver webhooken den aldri — mapRevenueCatEvent
 * kvitterer den uten å røre raden (BILLING_ERROR_CANCELLATION_ACK i
 * revenuecat.ts) — så i begge rekkefølger er det BILLING_ISSUE som står igjen.
 * `rc_event_type === 'CANCELLATION'` er derfor alltid en oppsigelse der
 * fornyelsen er slått av, aldri et trekk Apple fortsatt forsøker, og det
 * trengs ingen lagret cancel_reason i tillegg.
 *
 * Løftet på kortet hviler altså på den regelen i webhooken: skrives
 * BILLING_ERROR-hendelsen igjen, er hullet tilbake her. Rutetesten spiller av
 * paret i begge rekkefølger og leser kortlinja etterpå
 * (src/app/api/revenuecat/webhook/__tests__/route.test.ts).
 */
function erFrivilligOppsagt(kanal: AbonnementKanal | null, metadata: Record<string, unknown> | null | undefined): boolean {
  if (kanal !== 'apple') return true;
  return metadata?.rc_event_type === 'CANCELLATION';
}

/**
 * Apples frist som tidspunkt: prøveslutt minus ett døgn, rundet ned til hel
 * time — samme øyeblikk som avslutningsfrist() skriver ut. (Oslo ligger hele
 * timer fra UTC, så avrundingen er den samme i begge.)
 */
function appleFristMs(sluttMs: number): number {
  return Math.floor((sluttMs - 24 * TIME_MS) / TIME_MS) * TIME_MS;
}

/**
 * Hva datoen på statuskortet BETYR. Sto som «Fornyes/slutter: {dato}» — en som
 * nettopp hadde sagt opp, eller sto i en prøveperiode, kunne ikke se om de
 * ville bli belastet. Status og cancel_at_period_end ligger i samme rad.
 *
 * `null` = ingen linje (ingen dato, eller en status der datoen ikke sier noe:
 * forfalt betaling har sin egen forklaring på kortet).
 *
 * Aldri «fornyes» for et gavepass — det fornyes ikke av noe.
 *
 * Prøve kjøpt i App Store: Apple forsøker trekket i løpet av det siste døgnet
 * FØR prøveslutt, så «Første belastning {prøveslutt}» ville sendt kunden til
 * innstillingene etter at trekket alt var forsøkt — og motsagt påminnelsen
 * (prove-paaminnelse-app.ts). Så lenge fristen ligger foran, sier linja
 * fristen. Etter den (og i sandkassa, der en «uke» varer tre minutter og
 * fristen ville ligget i går) er rådet for sent å følge; da sier linja bare
 * at belastningen kommer SENEST den datoen. Stripe belaster ved prøveslutt,
 * og beholder «Første belastning {dato}».
 */
export function periodelinje({ status, cancelAtPeriodEnd, periodeSlutt, kanal, metadata, naa }: PeriodelinjeInn): PeriodelinjeNokkel | null {
  if (!periodeSlutt) return null;
  const slutt = new Date(periodeSlutt).getTime();
  if (!Number.isFinite(slutt)) return null;
  const utlopt = slutt <= naa.getTime();

  if (kanal === 'tildelt') return utlopt ? 'periodAccessEnded' : 'periodAccessUntil';

  const frivillig = erFrivilligOppsagt(kanal, metadata);

  if (status === 'trialing') {
    if (utlopt) return 'periodAccessEnded';
    if (cancelAtPeriodEnd) return frivillig ? 'periodTrialEndsNoCharge' : 'periodAccessUntil';
    if (kanal !== 'apple') return 'periodTrialFirstCharge';
    return naa.getTime() < appleFristMs(slutt) ? 'periodTrialCancelBy' : 'periodTrialChargeBy';
  }
  if (status === 'active') {
    if (utlopt) return 'periodAccessEnded';
    if (cancelAtPeriodEnd) return frivillig ? 'periodEndsNoCharge' : 'periodAccessUntil';
    return 'periodRenews';
  }
  if (status === 'canceled') return utlopt ? 'periodAccessEnded' : 'periodAccessUntil';
  return null;
}

/**
 * Verdiene datolinja settes inn med — én regel for prissiden og profilen.
 *
 * Oslo-tid, ikke kjøretidens sone: profilsiden rendres på serveren (UTC) og
 * prissiden i nettleseren, og samme rad skal gi samme dato begge steder — og
 * samme dag som fristen ved siden av.
 *
 * `deadline` er Apples frist for å avslutte en prøve uten belastning, fra
 * avslutningsfrist(): «26.9.2026 kl. 07». Bare periodTrialCancelBy leser den.
 */
export function periodelinjeVerdier(periodeSlutt: string, locale: string): { date: string; deadline: string } {
  const sluttMs = new Date(periodeSlutt).getTime();
  if (!Number.isFinite(sluttMs)) return { date: '', deadline: '' };
  const dato = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: 'Europe/Oslo' });
  const frist = avslutningsfrist(sluttMs);
  return {
    date: dato.format(new Date(sluttMs)),
    // Midt på dagen: fristdagen er alt en Oslo-dato, og skal ikke flyttes av sonen.
    deadline: `${dato.format(new Date(`${frist.dag}T12:00:00Z`))} kl. ${String(frist.time).padStart(2, '0')}`
  };
}

export type Faq2Nokkel = 'faq2A' | 'faq2AStripe' | 'faq2AApple';

/**
 * «Kan jeg avslutte når som helst?» må peke på veien som finnes for DENNE
 * kunden på DENNE flaten. Svaret sa «Administrer abonnement på denne siden»
 * til alle — også i appen, der knappen aldri vises.
 *
 *  · nett + Stripe-kunde: knappen står på siden.
 *  · Apple-kunde (begge flater), og alle i appen uten Stripe-abonnement:
 *    iPhone-innstillingene. Appen nevner ikke mycelet.com-kjøp for noen som
 *    ikke har et.
 *  · ellers (uinnlogget/gratis på nett, Stripe-kunde i appen): begge veier.
 */
export function faq2Nokkel(kanal: AbonnementKanal | null, native: boolean): Faq2Nokkel {
  if (kanal === 'apple') return 'faq2AApple';
  if (native) return kanal === 'stripe' ? 'faq2A' : 'faq2AApple';
  return kanal === 'stripe' ? 'faq2AStripe' : 'faq2A';
}

/** Apples egen side for abonnementer. Samme adresse som prøvepåminnelsen bruker. */
export const APPLE_ABONNEMENTER_URL = 'https://apps.apple.com/account/subscriptions';
