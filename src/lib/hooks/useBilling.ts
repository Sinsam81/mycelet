'use client';

import { useQuery } from '@tanstack/react-query';

export interface BillingStatusResult {
  capabilities: {
    tier: 'free' | 'premium' | 'season_pass';
    status: string;
    paid: boolean;
    aiDailyLimit: number | null;
  };
  /** Raden fra billing_subscriptions, eller null. */
  subscription?: { stripe_customer_id?: string | null; status?: string } | null;
  /**
   * Får kunden gratisuka? Avgjort på serveren med samme sjekker som checkout
   * (tidligere-abonnent.ts) — les den via kanFaaProveperiode, aldri av om
   * `subscription` er null.
   */
  kanFaaProve?: boolean;
}

/**
 * Nøkkelen til den DELTE betalingsstatusen.
 *
 * Eksportert med vilje: den leses av headerens plan-merke og må kunne
 * ugyldiggjøres av /pricing etter et kjøp. Da nøkkelen sto som en løs streng
 * her og prissiden hentet sin egen status ved siden av, kunne headeren si
 * «Gratis» i opptil fem minutter etter at kunden hadde betalt.
 */
export const BILLING_STATUS_KEY = ['billing-status'] as const;

/**
 * Reserveteksten når svaret ikke bar en egen feilmelding. Bare for loggen og
 * utviklere: ingen flate viser `error.message` fra denne kroken (headeren og
 * kartet leser bare om statusen kom). En flate som vil vise feilen, forgrener
 * på `code` og henter teksten fra meldingskatalogen.
 */
export const BETALINGSSTATUS_FEILTEKST = 'Kunne ikke hente betalingsstatus';

/** Stabil kode når svaret ikke bar sin egen (plattformens HTML-side, ødelagt kropp). */
export const BETALINGSSTATUS_FEILKODE = 'billing_status_unavailable';

/** Feilen kroken kaster: teksten som før, pluss en kode klienter kan forgrene på. */
export type BetalingsstatusFeil = Error & { code: string };

/**
 * Henter betalingsstatusen. `null` betyr «ikke logget inn» (401) — det er et
 * svar, ikke en feil. Eksportert for å kunne testes uten React.
 *
 * Svaret tolkes aldri ubetinget som JSON: en feil på plattformnivå (Vercels
 * 504, 502 fra kanten) svarer med HTML, og da kastet `response.json()` en
 * SyntaxError med nettleserens egen engelske tekst i stedet for vår. Se
 * usePrediction og useIdentify.
 */
export async function hentBetalingsstatus(): Promise<BillingStatusResult | null> {
  const response = await fetch('/api/billing/status', { cache: 'no-store' });
  if (response.status === 401) return null;
  const data = (await response.json().catch(() => null)) as (BillingStatusResult & { error?: string; code?: string }) | null;
  if (!response.ok || !data) {
    const feil: BetalingsstatusFeil = Object.assign(new Error(data?.error ?? BETALINGSSTATUS_FEILTEKST), {
      code: typeof data?.code === 'string' ? data.code : BETALINGSSTATUS_FEILKODE
    });
    throw feil;
  }
  return data;
}

export function useBillingStatus(enabled: boolean) {
  return useQuery<BillingStatusResult | null>({
    queryKey: BILLING_STATUS_KEY,
    enabled,
    queryFn: hentBetalingsstatus,
    staleTime: 1000 * 60 * 5
  });
}

