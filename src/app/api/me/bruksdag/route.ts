import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createRequestLogger } from '@/lib/log/request';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { alleRegionSlugs } from '@/lib/prediction/region-slug';
import { erFlate, osloDag } from '@/lib/bruk/bruksdag';

/**
 * «Jeg så soppforholdene i dag» — én rad per bruker, dag og flate
 * (migrasjon 064). Kalles av <RegistrerBruksdag> når et prognosekort,
 * kartet eller en områdeside vises for en innlogget bruker.
 *
 * Skriver med SESJONSKLIENTEN: RLS lar en bruker bare sette inn sin egen rad,
 * så ruta trenger verken user_id fra klienten eller service role. Dagen
 * settes HER, ikke av klienten — en telefon med feil klokke skal ikke kunne
 * flytte en bruksdag.
 *
 * Duplikater er ikke feil: samme flate to ganger samme dag gir én rad
 * (ON CONFLICT DO NOTHING via ignoreDuplicates). Svaret er 204 uansett, så
 * klienten aldri må bry seg om utfallet.
 */

export const runtime = 'nodejs';

const GYLDIGE_OMRADER = new Set(alleRegionSlugs());

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });

  const rl = checkRateLimit(`bruksdag:${getClientKey(request, user.id)}`, 30, 60);
  if (!rl.allowed) return rateLimitResponse(rl);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const flate = body.flate;
  if (!erFlate(flate)) return NextResponse.json({ error: 'Ugyldig flate' }, { status: 400 });

  // Området er bare meningsfullt for områdesidene, og må være ett av våre —
  // kolonnen er fritekst, og den ender i dagsrapporten.
  let omrade = '';
  if (flate === 'omrade') {
    if (typeof body.omrade !== 'string' || !GYLDIGE_OMRADER.has(body.omrade)) {
      return NextResponse.json({ error: 'Ugyldig område' }, { status: 400 });
    }
    omrade = body.omrade;
  }

  const { error } = await supabase
    .from('bruksdager')
    .upsert({ user_id: user.id, dag: osloDag(new Date()), flate, omrade }, { onConflict: 'user_id,dag,flate,omrade', ignoreDuplicates: true });

  if (error) {
    // Målingen skal aldri stå i veien for produktet: logg og svar som om det gikk.
    log.warn('bruksdag.skriving_feilet', { message: error.message, flate });
  }
  return new NextResponse(null, { status: 204 });
}
