import { NextResponse } from 'next/server';
import { getUserLocale } from '@/i18n/locale';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';
import { delingKaranteneTekst, funnFeilTekst, type FunnFeilKode } from '@/lib/findings/feil';

/**
 * Feilsvarene til /api/findings-rutene: `error` på leserens språk, `code` som
 * klienten kan forgrene på. Tekstene og begrunnelsen står i
 * src/lib/findings/feil.ts.
 *
 * Språket slås opp HER, ikke i hver handler — samme valg som
 * rateLimitResponse: en valgfri parameter hver rute kunne glemme å sende,
 * ville betydd at noen av dem fortsatt svarte på norsk. Kostnaden er ett
 * cookie-oppslag, og bare når noe faktisk går galt.
 */

/** Serverside-tekst dekkes ikke av next-intl — språket må hentes eksplisitt. */
export async function lesSprak(): Promise<Locale> {
  try {
    return await getUserLocale();
  } catch {
    // cookies() kaster utenfor en request-kontekst. En 404 skal aldri bli en
    // 500 fordi vi ikke fant språket.
    return DEFAULT_LOCALE;
  }
}

export async function funnFeilSvar(
  kode: FunnFeilKode,
  status: number,
  ekstra: Record<string, unknown> = {}
): Promise<NextResponse> {
  const locale = await lesSprak();
  return NextResponse.json({ error: funnFeilTekst(kode, locale), code: kode, ...ekstra }, { status });
}

/**
 * Migrasjonene kjøres for hånd i Supabase SQL Editor (se CLAUDE.md), så det
 * finnes et vindu rett etter utrulling der koden er ute og kolonnen ikke er
 * det. Da skal brukeren få vite hva som IKKE skjedde — ikke en anonym 500 som
 * lar hen tro at funnet er slettet eller endret.
 */
export async function migrasjonManglerSvar(
  detaljer: 'delete_migration_missing' | 'restore_migration_missing' | 'update_migration_missing'
): Promise<NextResponse> {
  const locale = await lesSprak();
  return NextResponse.json(
    {
      error: funnFeilTekst('feature_not_enabled', locale),
      details: funnFeilTekst(detaljer, locale),
      code: 'feature_not_enabled'
    },
    { status: 503 }
  );
}

/**
 * En åpnere deling som må vente (se src/lib/findings/delingsendring.ts).
 *
 * 429 med Retry-After: det ER en struping, og klienten får tidspunktet både
 * som tekst og som `availableAt`, så den kan vise det i sin egen form.
 */
export async function delingKaranteneSvar(tidligstMs: number, naaMs: number): Promise<NextResponse> {
  const locale = await lesSprak();
  const retryAfterSeconds = Math.max(1, Math.ceil((tidligstMs - naaMs) / 1000));
  return NextResponse.json(
    {
      error: delingKaranteneTekst(tidligstMs, locale),
      code: 'sharing_cooldown',
      availableAt: new Date(tidligstMs).toISOString(),
      retryAfterSeconds
    },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}
