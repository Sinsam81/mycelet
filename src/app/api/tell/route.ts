import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey } from '@/lib/rate-limit/route';
import { osloDag } from '@/lib/bruk/bruksdag';
import { erTellbarFlate } from '@/lib/bruk/tell';
import { isLocale } from '@/i18n/config';

/**
 * «Første skjerm ble åpnet» — anonym dagsteller for skjermene før konto i
 * appen (migrasjon 070). Kalles av <TellFlate> bare inne i det native
 * skallet, én gang per flate og økt.
 *
 * Ingen innlogging, ingen ID: raden er (dag, flate, språk) → antall. Dagen
 * settes HER (Oslo-dato), aldri av klienten. Skrives via SQL-funksjonen
 * tell_flate med service role — tabellen har RLS uten policyer.
 *
 * Svaret er 204 UANSETT: ugyldig kropp, manglende nøkkel, rate-grense, feil
 * i basen. Målingen skal aldri stå i veien for produktet, og en som prøver å
 * blåse opp telleren får ikke vite om det virket. Grensen (60/min per
 * klientnøkkel = IP uten innlogging) er per instans, som all annen
 * rate-limiting her.
 */

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  const svar = () => new NextResponse(null, { status: 204 });

  const rl = checkRateLimit(`tell:${getClientKey(request, null)}`, 60, 60);
  if (!rl.allowed) return svar();

  const raa = await request.json().catch(() => null);
  const body = (raa && typeof raa === 'object' ? raa : {}) as Record<string, unknown>;
  const flate = body.flate;
  const sprak = body.sprak;
  if (!erTellbarFlate(flate) || !isLocale(typeof sprak === 'string' ? sprak : undefined)) return svar();

  try {
    const db = createAdminClient();
    const { error } = await db.rpc('tell_flate', { p_dag: osloDag(new Date()), p_flate: flate, p_sprak: sprak });
    if (error) log.warn('tell.skriving_feilet', { message: error.message, flate });
  } catch (e) {
    // Mangler service role-nøkkelen (lokalt), eller migrasjonen: logg og gå videre.
    log.warn('tell.utilgjengelig', { message: e instanceof Error ? e.message : 'ukjent', flate });
  }
  return svar();
}
