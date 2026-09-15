/**
 * Hvem betaler? Én regel, brukt av dagsrapporten og admin-statistikken.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVORFOR EN EGEN FIL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dagsrapporten fikk riktig telling i PR #265. Admin-siden (/admin) hadde sin
 * egen løkke — `tier !== 'free'` og status active eller trialing — og viste
 * 15. september 2026 «Betalende: 8». Fasit var én: tre løpende prøver, tre
 * gavepass (grunnleggerpasset, et gavepass og Apples demokonto), én ekte
 * App Store-kunde som har sagt opp, men har betalt ut september, og én
 * Stripe-rad med status active der perioden gikk ut 2. juli.
 *
 * To flater med hver sin regel betyr at den ene lyver. Derfor bor regelen her.
 *
 * ── REGELEN ─────────────────────────────────────────────────────────────────
 *
 * Hver rad havner i nøyaktig én bøtte (klassifiserAbonnement):
 *
 *  - utlopt:        status active eller trialing, men current_period_end er
 *                   passert. Status alene lyver — målt i produksjon 2026-08-13.
 *  - inaktiv:       canceled, past_due, unpaid …, eller en gratis plan.
 *  - gratisTildelt: løpende tilgang uten at penger har flyttet seg. Raden er
 *                   merket `metadata.source = 'manual_grant'`, mangler en
 *                   butikk-provider, eller eies av en intern konto — der er et
 *                   App Store-kjøp testing av kjøpsflyten, ikke et salg.
 *  - prove:         butikkrad med status trialing. Sju dager gratis er ikke
 *                   en kunde.
 *  - betalende:     butikkrad (Stripe eller App Store) med status active og
 *                   løpende periode. En kunde som har sagt opp, teller til
 *                   den betalte perioden er ute.
 *
 * Dette er RAPPORTERING. Tilgang til Premium avgjøres av hasPaidAccess()
 * (billing/plans.ts), der en prøve og et gavepass selvsagt gir tilgang. Ikke
 * bruk denne fila til å slippe noen inn eller ut.
 */

import { isPaidTier, type BillingTier } from '@/lib/billing/plans';
import { MANUAL_GRANT_SOURCE } from '@/lib/billing/revenuecat';

export type Betalingskilde = 'stripe' | 'revenuecat' | 'manuell';
/** Kildene der penger faktisk flytter seg. */
export type Butikk = Exclude<Betalingskilde, 'manuell'>;

export interface AbonnementRad {
  user_id: string;
  tier: string;
  status: string;
  current_period_end: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  /** Oppsagt, men løper ut perioden. Valgfri for eldre kall. */
  cancel_at_period_end?: boolean | null;
}

export type AbonnementKlasse = 'betalende' | 'prove' | 'gratisTildelt' | 'utlopt' | 'inaktiv';

export interface Abonnementstall {
  /** Alle rader, uansett status — «Abonnement-rader» på /admin. */
  rader: number;
  betalende: number;
  betalendePerButikk: Record<Butikk, number>;
  /** Løpende prøver på butikkrader. */
  prover: number;
  gratisTildelt: number;
  /** Rader som SIER aktiv eller prøve, men der perioden er ute. */
  utloptMenMarkertAktiv: number;
}

/** QA-brukeren og Apples demokonto ligger på eget domene. */
const INTERNT_EPOSTDOMENE = '@mycelet.com';

/** Intern konto = e-post på Mycelets eget domene. Kjøpene deres er testing. */
export function erInternKonto(epost: string | null | undefined): boolean {
  return typeof epost === 'string' && epost.trim().toLowerCase().endsWith(INTERNT_EPOSTDOMENE);
}

/**
 * Hvor pengene kom fra. Bare `stripe` og `revenuecat` betyr et kjøp; alt annet
 * er satt inn for hånd. Et manual_grant-merke vinner over provider — i tvil
 * teller en rad aldri som salg.
 */
export function betalingskilde(rad: AbonnementRad, interne?: ReadonlySet<string>): Betalingskilde {
  if (interne?.has(rad.user_id)) return 'manuell';
  const meta = rad.metadata;
  if (meta?.source === MANUAL_GRANT_SOURCE) return 'manuell';
  if (meta?.provider === 'stripe') return 'stripe';
  if (meta?.provider === 'revenuecat') return 'revenuecat';
  return 'manuell';
}

export function periodeLoper(rad: AbonnementRad, naa: Date): boolean {
  // Ingen sluttdato = løper til noe annet sier stopp. Sjeldent, men gyldig.
  if (!rad.current_period_end) return true;
  return new Date(rad.current_period_end).getTime() > naa.getTime();
}

export function klassifiserAbonnement(rad: AbonnementRad, naa: Date, interne?: ReadonlySet<string>): AbonnementKlasse {
  if (rad.status !== 'active' && rad.status !== 'trialing') return 'inaktiv';
  if (!periodeLoper(rad, naa)) return 'utlopt';
  if (!isPaidTier(rad.tier as BillingTier)) return 'inaktiv';
  if (betalingskilde(rad, interne) === 'manuell') return 'gratisTildelt';
  return rad.status === 'trialing' ? 'prove' : 'betalende';
}

export function tellAbonnement(rader: readonly AbonnementRad[], naa: Date, interne?: ReadonlySet<string>): Abonnementstall {
  const tall: Abonnementstall = {
    rader: rader.length,
    betalende: 0,
    betalendePerButikk: { stripe: 0, revenuecat: 0 },
    prover: 0,
    gratisTildelt: 0,
    utloptMenMarkertAktiv: 0
  };
  for (const rad of rader) {
    const klasse = klassifiserAbonnement(rad, naa, interne);
    if (klasse === 'betalende') {
      tall.betalende += 1;
      tall.betalendePerButikk[betalingskilde(rad, interne) as Butikk] += 1;
    } else if (klasse === 'prove') tall.prover += 1;
    else if (klasse === 'gratisTildelt') tall.gratisTildelt += 1;
    else if (klasse === 'utlopt') tall.utloptMenMarkertAktiv += 1;
  }
  return tall;
}
