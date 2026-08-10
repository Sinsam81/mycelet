import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';

/**
 * Avmelding fra soppvarsel — uten innlogging.
 *
 * ── HVORFOR TO METODER ──────────────────────────────────────────────────────
 *
 * POST er RFC 8058 «one-click»: e-posten setter List-Unsubscribe-Post, og da
 * viser Gmail og Outlook en innebygd avmeldingsknapp øverst i meldingen. Den
 * knappen sender en POST hit, uten at brukeren åpner noe. Det er den beste
 * forsikringen mot at folk trykker «søppelpost» i stedet — en spam-markering
 * rammer leveringen av ALLE e-postene våre, også de som ikke er varsler.
 *
 * GET er mennesket som trykker på lenka i brødteksten. Den gjør det samme og
 * sender deg videre til en side som sier at det er gjort.
 *
 * ── HVORFOR TOKEN OG IKKE INNLOGGING ────────────────────────────────────────
 *
 * Åpner du e-posten på en telefon der du ikke er logget inn, og eneste vei ut
 * er «logg inn først», så finnes det i praksis ingen vei ut. Tokenet er en
 * tilfeldig uuid som bare identifiserer én rad, leses kun med tjenestenøkkelen,
 * og kan ikke brukes til noe annet enn å slå av varselet.
 *
 * Vi SLETTER ikke raden — vi setter active = false. Da beholder brukeren
 * regionvalget sitt om hen slår varselet på igjen, og vi unngår at en feilklikket
 * avmelding koster mer enn den skal.
 */

export const runtime = 'nodejs';

async function meldAv(token: string | null, log: ReturnType<typeof createRequestLogger>) {
  if (!token) return { ok: false as const, status: 400 };

  // Ugyldig uuid skal ikke nå databasen som en tekstsammenligning.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return { ok: false as const, status: 400 };
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from('alert_subscriptions')
    .update({ active: false })
    .eq('unsubscribe_token', token)
    .select('id');

  if (error) {
    log.error('soppvarsel.avmelding_feilet', { message: error.message });
    return { ok: false as const, status: 500 };
  }

  // Ukjent token gir samme svar som et gyldig. Et varierende svar ville gjort
  // ruta til et orakel for å gjette gyldige tokens.
  log.info('soppvarsel.avmeldt', { traff: (data ?? []).length });
  return { ok: true as const, status: 200 };
}

/** RFC 8058 one-click. Skal svare 200 og ikke omdirigere. */
export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  const res = await meldAv(request.nextUrl.searchParams.get('t'), log);
  return new NextResponse(null, { status: res.ok ? 200 : res.status });
}

/** Mennesket som trykker på lenka. */
export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const res = await meldAv(request.nextUrl.searchParams.get('t'), log);
  const mål = res.ok ? '/soppvarsel/av?ok=1' : '/soppvarsel/av?ok=0';
  return NextResponse.redirect(new URL(mål, request.nextUrl.origin));
}
