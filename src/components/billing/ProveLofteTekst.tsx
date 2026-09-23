'use client';

import { useProveLofte } from '@/lib/hooks/useProveLofte';
import { harProveLofte } from '@/lib/billing/prove-lofte';
import type { IapPlan } from '@/lib/billing/plans';

/**
 * Én tekst når gratisuka finnes, en annen når den ikke gjør det — eller vi
 * ikke vet ennå.
 *
 * Premium-knappene («Se alle 12 områdene — prøv gratis i 7 dager») sto bare
 * på Mycelets egen historikk (kanFaaProve), ikke på butikkens svar. I appen
 * kunne arket rett over si «Se Premium» uten løfte, mens knappen under lovet
 * en gratis uke som endte i et trekk på dag én. På nett er svaret kjent
 * synkront (Stripe gir den), så der endres ingenting; i appen står teksten
 * uten løfte til App Store har svart ja.
 *
 * `plan`: hvilken plans gratisuke løftet gjelder. Standard er sesongpasset,
 * planen alle knappene leder til på prissiden; en tekst som navngir Premium
 * («Prøv Premium gratis i 7 dager») må spørre om Premium.
 */
export function ProveLofteTekst({ med, utenProve, plan = 'season_pass' }: { med: string; utenProve: string; plan?: IapPlan }) {
  const lofte = useProveLofte();
  return <>{harProveLofte(lofte, plan) ? med : utenProve}</>;
}
