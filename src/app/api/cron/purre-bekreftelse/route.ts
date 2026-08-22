import { NextRequest, NextResponse } from 'next/server';
import { bearerSecretMatches } from '@/lib/security/secret-compare';
import { createRequestLogger } from '@/lib/log/request';
import { sendEpost } from '@/lib/email/send';
import { byggPurreEpost, PURRE_MARKOR, velgUbekreftede, type UbekreftetKandidat } from '@/lib/onboarding/purre';

/**
 * Daglig purremail til kontoer som aldri bekreftet e-posten sin.
 * Reglene (én purring, 24 t–10 døgn-vindu, aldri interne kontoer) og hele
 * begrunnelsen står i src/lib/onboarding/purre.ts.
 *
 * Kjøres av Vercel-cron kl. 07:00 (vercel.json), etter soppvarselet kl. 05.
 * Volumet er i praksis 0–2 e-poster per dag; pausen mellom utsendinger
 * holder oss under Resends takgrense (2/s) med god margin.
 *
 * Går via Supabase Admin-API-et direkte (ikke supabase-js) av samme grunn som
 * ellers i cron-rutene: vi trenger bare tre små kall, og admin-endepunktene
 * for auth-brukere er ikke eksponert gjennom klientbiblioteket vårt.
 */

export const runtime = 'nodejs';
export const maxDuration = 120;

const PER_SIDE = 200;

function adminHoder(): Record<string, string> {
  const nokkel = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return {
    apikey: nokkel,
    Authorization: `Bearer ${nokkel}`,
    'Content-Type': 'application/json'
  };
}

async function hentAlleBrukere(base: string): Promise<UbekreftetKandidat[]> {
  // Map på id, ikke liste: GoTrue pagineres med offset over created_at DESC,
  // så en registrering som lander MELLOM to sidehentinger forskyver radene og
  // kan servere samme bruker på begge sidene. Uten dedup ville vedkommende
  // fått to purremail i samme kjøring — regelen «aldri mer enn én» er hele
  // grunnlaget for at utsendingen er forsvarlig. Sovende i dag (én side),
  // væpnet den dagen brukertallet passerer sidestørrelsen.
  const alle = new Map<string, UbekreftetKandidat>();
  // Taket på 25 sider (5000 brukere) er en ren sikkerhetsventil mot en evig
  // løkke, ikke en forventet grense.
  for (let side = 1; side <= 25; side++) {
    const res = await fetch(`${base}/auth/v1/admin/users?page=${side}&per_page=${PER_SIDE}`, {
      headers: adminHoder(),
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`admin/users side ${side}: ${res.status}`);
    const data = (await res.json()) as { users?: UbekreftetKandidat[] };
    const brukere = data.users ?? [];
    for (const b of brukere) alle.set(b.id, b);
    if (brukere.length < PER_SIDE) break;
  }
  return [...alle.values()];
}

/**
 * Engangs bekreftelseslenke til VÅR EGEN /auth/confirm-rute.
 *
 * Vi bruker generate_link-ets `hashed_token`, ikke action_link-et: det rå
 * action_link-et er et implicit-flow-endepunkt som ville lagt tokener i
 * URL-fragmentet til en app som aldri leser dem (cookie-økter + PKCE) — og
 * en utløpt lenke ville landet stille på forsiden. /auth/confirm løser inn
 * tokenet server-side, bekrefter e-posten UTEN å logge inn (kaprings-
 * forarbeid: adressen er ubekreftet og kan tilhøre feil person), og gir
 * tydelig beskjed i begge utfall. Se kommentaren i auth/confirm/route.ts.
 */
async function lagBekreftelseslenke(base: string, epost: string): Promise<string | null> {
  const res = await fetch(`${base}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: adminHoder(),
    body: JSON.stringify({ type: 'magiclink', email: epost }),
    cache: 'no-store'
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    hashed_token?: string;
    properties?: { hashed_token?: string };
  };
  const token = data.hashed_token ?? data.properties?.hashed_token ?? null;
  if (!token) return null;
  return `https://www.mycelet.com/auth/confirm?token_hash=${encodeURIComponent(token)}`;
}

/** Merk kontoen som purret — app_metadata kan ikke endres av brukeren selv. */
async function merkSomPurret(base: string, brukerId: string): Promise<boolean> {
  const res = await fetch(`${base}/auth/v1/admin/users/${brukerId}`, {
    method: 'PUT',
    headers: adminHoder(),
    body: JSON.stringify({ app_metadata: { [PURRE_MARKOR]: new Date().toISOString() } }),
    cache: 'no-store'
  });
  return res.ok;
}

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);

  if (!bearerSecretMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    log.warn('purre.ikke-konfigurert', {});
    return NextResponse.json({ ok: false, detalj: 'Supabase-miljø mangler' }, { status: 503 });
  }

  try {
    const alle = await hentAlleBrukere(base);
    const kandidater = velgUbekreftede(alle, new Date());
    log.info('purre.kandidater', { totalt: alle.length, kandidater: kandidater.length });

    let sendt = 0;
    let hoppetOver = 0;
    for (const kandidat of kandidater) {
      const lenke = await lagBekreftelseslenke(base, kandidat.email!);
      if (!lenke) {
        // Typisk: kontoen er sperret eller slettet i mellomtiden. Ikke merk
        // som purret — da får den et nytt forsøk i morgen hvis den kvalifiserer.
        log.warn('purre.lenke-feilet', { brukerId: kandidat.id });
        hoppetOver++;
        continue;
      }

      // MERK FØR SENDING. Skulle merkingen feile, sender vi heller ikke —
      // motsatt rekkefølge kunne gitt samme bruker en ny purring hver dag,
      // og «aldri mer enn én» er regelen som gjør utsendingen forsvarlig.
      const merket = await merkSomPurret(base, kandidat.id);
      if (!merket) {
        log.warn('purre.merking-feilet', { brukerId: kandidat.id });
        hoppetOver++;
        continue;
      }

      const epost = byggPurreEpost(lenke);
      const resultat = await sendEpost({
        til: kandidat.email!,
        emne: epost.emne,
        html: epost.html,
        tekst: epost.tekst
      });
      if (resultat.ok) {
        sendt++;
      } else {
        // Merket, men ikke sendt: bevisst. Én tapt purring er greit;
        // dobbel purring er det ikke.
        log.warn('purre.sending-feilet', { brukerId: kandidat.id, detalj: resultat.detalj });
        hoppetOver++;
      }

      // Resend tillater 2 kall/s — 600 ms gir god margin.
      await new Promise((r) => setTimeout(r, 600));
    }

    log.info('purre.ferdig', { sendt, hoppetOver });
    return NextResponse.json({ ok: true, sendt, hoppetOver, kandidater: kandidater.length });
  } catch (err) {
    log.error('purre.feilet', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
