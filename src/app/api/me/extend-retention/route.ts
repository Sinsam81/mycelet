import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { apiFeil, apiSprak, loggFeil } from '@/lib/api/feil';
import type { Locale } from '@/i18n/config';

/**
 * Bekreftelsen banneret viser som toast. Generert på serveren, så next-intl
 * dekker den ikke: en svensk bruker som trykket «Behåll konto» fikk norsk
 * «Sletting av kontoen din er avbrutt.» på den vellykkede stien, selv om
 * sv.json har teksten. `avbrutt` er ordrett `cancelSuccess` i
 * RetentionWarningBanner-navnerommet, på begge språk.
 */
const BEKREFTELSE: Record<Locale, { avbrutt: string; ikkePlanlagt: string }> = {
  nb: {
    avbrutt: 'Sletting av kontoen din er avbrutt.',
    ikkePlanlagt: 'Kontoen din var ikke planlagt slettet — ingen handling nødvendig.'
  },
  sv: {
    avbrutt: 'Raderingen av ditt konto är avbruten.',
    ikkePlanlagt: 'Ditt konto var inte schemalagt att raderas — ingen åtgärd behövs.'
  }
};

/**
 * Extend retention — clears the user's row in account_deletion_warnings.
 *
 * Called when a user with a pending deletion warning logs in or clicks
 * "Behold kontoen min" in the warning banner. Authenticated users can
 * also drop the warning indirectly by simply logging in (the cron job
 * removes warnings whose user has signed in since `warned_at`), but
 * this endpoint gives the UI an explicit lever — the user clicks a
 * button and gets immediate confirmation.
 *
 * RLS already permits "Users can clear own deletion warning" so we
 * don't need the admin client here.
 */
export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return apiFeil('unauthenticated', 401);
  }

  const userLog = log.child({ userId: user.id });

  const rateLimit = checkRateLimit(`me-extend-retention:${getClientKey(request, user.id)}`, 10, 60);
  if (!rateLimit.allowed) {
    userLog.warn('me.extend_retention.rate_limited');
    return rateLimitResponse(rateLimit);
  }

  // Returns whether a row was actually deleted so the UI can show the
  // right toast — "kontoen din var ikke i fare" vs "vi har avbrutt
  // sletting av kontoen din".
  const { data, error } = await supabase
    .from('account_deletion_warnings')
    .delete()
    .eq('user_id', user.id)
    .select('user_id');

  if (error) {
    // Svaret var `error.message` — den rå Postgres-meldingen, på engelsk, i
    // en toast. Den hører hjemme i loggen.
    loggFeil(userLog, 'me.extend_retention.delete_failed', error);
    return apiFeil('retention_cancel_failed', 500);
  }

  const cleared = (data ?? []).length > 0;
  userLog.info('me.extend_retention.success', { cleared });

  const tekst = BEKREFTELSE[await apiSprak()];
  return NextResponse.json({
    ok: true,
    cleared,
    message: cleared ? tekst.avbrutt : tekst.ikkePlanlagt
  });
}
