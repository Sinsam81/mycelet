import { NextRequest, NextResponse } from 'next/server';
import { bearerSecretMatches } from '@/lib/security/secret-compare';
import { createRequestLogger } from '@/lib/log/request';
import { sendEpost } from '@/lib/email/send';
import { sprakFraMetadata } from '@/lib/billing/prove-paaminnelse';
import {
  byggPurreEpost,
  PURRE_KALL_FRIST_MS,
  PURRE_KJORETID_FRIST_MS,
  PURRE_MARKOR,
  velgUbekreftede,
  type UbekreftetKandidat
} from '@/lib/onboarding/purre';

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
 *
 * ── HVERT KALL UT HAR EN FRIST ──────────────────────────────────────────────
 *
 * Ingen av kallene mot Supabase hadde tidsavbrudd. Et kall som hang, holdt
 * hele kjøringen til plattformen drepte den (maxDuration) — midt i løkka, uten
 * en eneste logglinje om hvor langt den kom. Nå har hvert kall
 * PURRE_KALL_FRIST_MS, og utsendingen sin egen frist i sendEpost. Et kall som
 * ikke svarer i tide behandles som et kall som feilet, med de samme forsiktige
 * utfallene som før:
 *
 *   · brukerlista svarer ikke   → kjøringen avbrytes (500), ingen er rørt
 *   · lenka kan ikke lages      → kandidaten hoppes over UMERKET, nytt forsøk
 *                                 i morgen
 *   · merkingen svarer ikke     → ingen e-post. Vi vet ikke om merket ble
 *                                 satt; én tapt purring er greit, dobbel er
 *                                 det ikke
 *
 * Løkka slutter også å starte på nye kandidater når PURRE_KJORETID_FRIST_MS
 * er brukt, så en treg dag ender med en logglinje og resten i morgen — ikke
 * med at funksjonen drepes mellom merking og sending. Tallene bor i
 * src/lib/onboarding/purre.ts.
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

type Logg = ReturnType<typeof createRequestLogger>;

/** AbortSignal.timeout gir «TimeoutError»; eldre kjøremiljøer «AbortError». */
function erTidsavbrudd(feil: unknown): boolean {
  return feil instanceof Error && (feil.name === 'TimeoutError' || feil.name === 'AbortError');
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
      cache: 'no-store',
      signal: AbortSignal.timeout(PURRE_KALL_FRIST_MS)
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
async function lagBekreftelseslenke(base: string, epost: string, log: Logg): Promise<string | null> {
  try {
    const res = await fetch(`${base}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: adminHoder(),
      body: JSON.stringify({ type: 'magiclink', email: epost }),
      cache: 'no-store',
      signal: AbortSignal.timeout(PURRE_KALL_FRIST_MS)
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      hashed_token?: string;
      properties?: { hashed_token?: string };
    };
    const token = data.hashed_token ?? data.properties?.hashed_token ?? null;
    if (!token) return null;
    return `https://www.mycelet.com/auth/confirm?token_hash=${encodeURIComponent(token)}`;
  } catch (feil) {
    // Tidsavbrudd eller nettverksfeil: ingen lenke. Kandidaten er ikke merket,
    // så den får et nytt forsøk i morgen — og resten av lista går som normalt.
    // (Adressen logges ikke; kalleren logger bruker-id-en.)
    log.warn('purre.kall-feilet', { kall: 'generate_link', tidsavbrudd: erTidsavbrudd(feil) });
    return null;
  }
}

/** Merk kontoen som purret — app_metadata kan ikke endres av brukeren selv. */
async function merkSomPurret(base: string, brukerId: string, log: Logg): Promise<boolean> {
  try {
    const res = await fetch(`${base}/auth/v1/admin/users/${brukerId}`, {
      method: 'PUT',
      headers: adminHoder(),
      body: JSON.stringify({ app_metadata: { [PURRE_MARKOR]: new Date().toISOString() } }),
      cache: 'no-store',
      signal: AbortSignal.timeout(PURRE_KALL_FRIST_MS)
    });
    return res.ok;
  } catch (feil) {
    // Vi vet ikke om merket ble satt. Da sendes ingenting: står merket der i
    // morgen, er dette én tapt purring; gjør det ikke, purres kontoen da.
    log.warn('purre.kall-feilet', { kall: 'merk', brukerId, tidsavbrudd: erTidsavbrudd(feil) });
    return false;
  }
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
    // Klokka for kjøretidsfristen starter FØR brukerlista hentes: den teller
    // også mot maxDuration.
    const startet = Date.now();
    const alle = await hentAlleBrukere(base);
    const kandidater = velgUbekreftede(alle, new Date());
    log.info('purre.kandidater', { totalt: alle.length, kandidater: kandidater.length });

    let sendt = 0;
    let hoppetOver = 0;
    let utsatt = 0;
    for (const [nr, kandidat] of kandidater.entries()) {
      if (Date.now() - startet > PURRE_KJORETID_FRIST_MS) {
        // Ingen av de gjenstående er merket, så de tas i morgen.
        utsatt = kandidater.length - nr;
        log.warn('purre.avkortet', { utsatt });
        break;
      }

      const lenke = await lagBekreftelseslenke(base, kandidat.email!, log);
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
      const merket = await merkSomPurret(base, kandidat.id, log);
      if (!merket) {
        log.warn('purre.merking-feilet', { brukerId: kandidat.id });
        hoppetOver++;
        continue;
      }

      // Språket kontoen ble opprettet på (user_metadata.sprak, siden
      // 14.09.2026). Mangler det, eller er det noe annet enn nb/sv: norsk.
      const epost = byggPurreEpost(lenke, sprakFraMetadata(kandidat.user_metadata));
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

    log.info('purre.ferdig', { sendt, hoppetOver, utsatt });
    return NextResponse.json({ ok: true, sendt, hoppetOver, utsatt, kandidater: kandidater.length });
  } catch (err) {
    // Feilen er ANDRE argument, konteksten tredje — se Logger.error.
    log.error('purre.feilet', err, { tidsavbrudd: erTidsavbrudd(err) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
