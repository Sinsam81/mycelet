import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Landingspunktet for bekreftelseslenker vi selv sender ut (purremailen til
 * ubekreftede kontoer — se src/lib/onboarding/purre.ts).
 *
 * Lenken bærer generate_link-ets `hashed_token`, og denne ruten løser den inn
 * server-side med verifyOtp. Det er Supabases dokumenterte mønster for
 * SSR-apper — det RÅ action_link-et fra generate_link er et implicit-flow-
 * endepunkt som ville sendt tokener i URL-fragmentet til en app som aldri
 * leser dem (vi bruker cookie-økter med PKCE): e-posten ville blitt bekreftet,
 * men brukeren hadde stått uinnlogget på forsiden med gyldige tokener
 * liggende igjen i nettleserhistorikken.
 *
 * ⚠️ BEKREFTER MED VILJE UTEN Å LOGGE INN. Klienten under skriver ingen
 * øktkapsler (persistSession: false), og brukeren sendes til innloggings-
 * siden med en tydelig beskjed. Grunnen er kontokaprings-forarbeid: adressen
 * lenken gikk til er per definisjon UBEKREFTET, så det kan være feil persons
 * innboks (tastefeil ved registrering). Å logge mottakeren rett inn i en
 * konto der registranten kjenner passordet, ville gitt to fremmede tilgang
 * til samme konto. En bekreftet adresse + eget innloggingssteg (eller «Glemt
 * passord», som også bekrefter adressen og setter NYTT passord) lukker det.
 */
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');

  const tilLogin = (parameter: string) =>
    NextResponse.redirect(new URL(`/auth/login?${parameter}=1`, url.origin));

  if (!tokenHash) {
    return tilLogin('linkExpired');
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !anon) {
    return tilLogin('linkExpired');
  }

  // Bar klient uten kapselskriving: verifiseringen markerer e-posten som
  // bekreftet hos Supabase, og økten den returnerer forkastes.
  const supabase = createClient(base, anon, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });

  return tilLogin(error ? 'linkExpired' : 'verified');
}
