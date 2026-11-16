import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { NYERE_TABELLER, erManglendeTabell } from '@/lib/supabase/tabell-finnes';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import {
  erAiNokkelSatt,
  hentKindwiseStatus,
  kindwiseTilstand,
  type KindwiseTilstand
} from '@/lib/identifications/kindwise-status';
import { KINDWISE_KREDITT_VARSEL } from '@/lib/rapport/dagsrapport';

/**
 * Health check endpoint for uptime monitoring (UptimeRobot, BetterUptime,
 * Vercel's built-in checks, etc.).
 *
 * Two flavors:
 *
 *   GET /api/health          — full check, queries DB. ~50-100ms.
 *   GET /api/health?fast=1   — env + build only, no DB query. ~1ms.
 *                              Use this for high-frequency probes that
 *                              would otherwise hammer the DB.
 *
 * Returns:
 *   200 + { status: 'ok',      checks: {...} }   — everything healthy
 *   503 + { status: 'degraded', checks: {...} }  — at least one check failed
 *
 * Each check is reported individually so a probe can decide what to alert
 * on. We never return secrets or PII; only "is it set" booleans.
 *
 * NB: This route is intentionally PUBLIC and unauthenticated — health probes
 * need to hit it constantly, and auth-gating would defeat the purpose. We don't
 * expose anything sensitive in the response.
 *
 * Den har likevel en bremse. Uten `?fast=1` gjør hvert kall to spørringer mot
 * databasen (pluss tabellisten, som mellomlagres i fem minutter), og ruta er offentlig og trivielt gjettbar — en løkke mot den var
 * en vei til å presse ut Supabase-poolen for ekte brukere. Grensen er satt
 * romslig (120/min per klient = 2 i sekundet); enhver reell oppetidsprobe
 * ligger flere størrelsesordener under.
 */

export const runtime = 'nodejs';
// Don't cache health responses — they reflect current state.
export const dynamic = 'force-dynamic';

interface CheckResult {
  ok: boolean;
  message?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded';
  ts: string;
  uptimeSeconds: number;
  build: {
    nextVersion: string;
    nodeEnv: string;
  };
  checks: {
    envVars: CheckResult;
    epost: CheckResult;
    /** Kindwise-nøkkelen: gyldig, og med kreditter igjen? Bare uten ?fast=1. Grov tilstand, aldri tall. */
    ai?: CheckResult & { tilstand: KindwiseTilstand };
    database?: CheckResult;
    auditLogTable?: CheckResult;
    /** Tabeller fra nyere migrasjoner: finnes de? Bare uten ?fast=1, aldri 503. */
    tabeller?: CheckResult;
  };
}

const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY'
] as const;

function checkEnvVars(): CheckResult {
  const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    return { ok: false, message: `Mangler: ${missing.join(', ')}` };
  }
  return { ok: true };
}

/**
 * Kan appen sende e-post i det hele tatt?
 *
 * Egen sjekk, ikke en del av REQUIRED_ENV_VARS, fordi konsekvensen er en helt
 * annen: mangler Supabase-nøklene, er appen åpenbart nede. Mangler
 * e-postnøklene, ser ALT normalt ut — soppvarselets nattjobb kjører,
 * regionscorene skrives, loggen sier «epost.ikke-konfigurert» én gang per
 * mottaker, og ingen e-post går ut. Se src/lib/email/send.ts, som med vilje
 * svarer {ok:false} i stedet for å kaste.
 *
 * Det er den dyreste stille feilen i appen: den rammer bare folk som har
 * BEDT om å høre fra oss, og de merker den som taushet — som er akkurat det
 * varselet lover når forholdene ikke har snudd. Derfor står den her, der en
 * oppetidsprobe kan se den, i stedet for å oppdages den dagen noen spør
 * hvorfor de aldri får noe.
 *
 * Rapporterer bare OM variablene er satt, aldri verdiene — samme regel som
 * resten av ruta.
 */
function checkEpost(): CheckResult {
  const missing = (['RESEND_API_KEY', 'RESEND_FROM'] as const).filter((v) => !process.env[v]);
  if (missing.length > 0) {
    return { ok: false, message: `E-post er ikke konfigurert — mangler: ${missing.join(', ')}. Soppvarselet sender ingenting.` };
  }
  return { ok: true };
}

/**
 * Virker AI-identifiseringen — kan vi kalle Kindwise?
 *
 * Samme slags stille feil som e-posten, bare dyrere: fra mai til 29. sep 2026
 * feilet hvert eneste Kindwise-kall, brukeren så «Identifikasjon feilet», og
 * ingen målte det. Denne sjekken fanger det som lar seg fange uten å bruke en
 * kreditt: nøkkel som mangler eller avvises, og tom kvote. (Et feil
 * forespørselsformat — selve feilen fra i sommer — fanger dagsrapporten, som
 * teller feilede kall mot vellykkede.)
 *
 * Kindwise spørres høyst hvert femte minutt uansett hvor ofte proben kaller;
 * ruta er offentlig, og de skal ikke få vår trafikk. Svaret er bare `ok` og en
 * grov `tilstand` (ok / lav / sperret / utilgjengelig / mangler-nokkel) —
 * aldri nøkkelen, aldri antall kreditter, aldri Kindwise sin svartekst. Før
 * sto «N kreditter igjen» her, lesbart for alle. Tallene står i eierens
 * dagsrapport; detaljen fra Kindwise går til serverloggen.
 */
const AI_CACHE_MS = 5 * 60 * 1000;
type AiSjekk = NonNullable<HealthResponse['checks']['ai']>;
let aiCache: { ts: number; resultat: AiSjekk } | null = null;

const AI_MELDING: Record<KindwiseTilstand, string> = {
  ok: 'Kindwise svarer, nøkkelen virker.',
  lav: 'Kindwise svarer, men det er få kreditter igjen.',
  sperret: 'Kindwise avviser nøkkelen. Hvert AI-kall feiler.',
  utilgjengelig: 'Kindwise svarte ikke.',
  'mangler-nokkel': 'AI er ikke konfigurert — PLANTID_API_KEY mangler eller er plassholderen. /api/identify svarer 503.'
};

function aiSjekk(tilstand: KindwiseTilstand): AiSjekk {
  return { ok: tilstand === 'ok' || tilstand === 'lav', tilstand, message: AI_MELDING[tilstand] };
}

async function checkAi(log: ReturnType<typeof createRequestLogger>): Promise<AiSjekk> {
  const apiKey = process.env.PLANTID_API_KEY;
  if (!erAiNokkelSatt(apiKey)) return aiSjekk('mangler-nokkel');
  if (aiCache && Date.now() - aiCache.ts < AI_CACHE_MS) return aiCache.resultat;

  const r = await hentKindwiseStatus(apiKey);
  const tilstand = kindwiseTilstand(r, KINDWISE_KREDITT_VARSEL);
  if (tilstand !== 'ok') {
    // Detaljen hører hjemme i serverloggen, ikke i det offentlige svaret.
    log.warn('health.ai_detalj', r.ok
      ? { tilstand, grunn: r.status.grunn, igjen: r.status.igjen }
      : { tilstand, httpStatus: r.httpStatus, feil: r.feil });
  }
  const resultat = aiSjekk(tilstand);
  aiCache = { ts: Date.now(), resultat };
  return resultat;
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    const supabase = createClient();
    // Cheapest possible query that exercises auth + connectivity. We don't
    // care about the result — only whether the call succeeds.
    const { error } = await supabase.from('mushroom_species').select('id', { count: 'exact', head: true }).limit(1);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'unknown' };
  }
}

async function checkAuditLogTable(): Promise<CheckResult> {
  try {
    const supabase = createClient();
    // Migration 008 introduced admin_audit_log. If the table doesn't exist
    // (migration not applied), we surface it here so deployment scripts
    // can catch it before it bites in production.
    //
    // GET, not HEAD: a HEAD against a missing table has no body, and the
    // client turns that into "no error" — the check could never fire. The
    // code PostgREST sends is PGRST205, not Postgres' 42P01.
    const { error } = await supabase.from('admin_audit_log').select('id').limit(1);
    if (error) {
      if (erManglendeTabell(error)) {
        return { ok: false, message: 'Migrasjon 008 ikke påført' };
      }
      // Any other error (RLS denial etc.) means the table exists, which is
      // what this check actually wants to verify.
      return { ok: true, message: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'unknown' };
  }
}

/**
 * Tabeller som kom med nyere migrasjoner. Migrasjonene limes inn for hånd, og
 * en glemt en har før gitt måneder med stille nuller. Her blir den synlig.
 *
 * Skjemacachen er lik for alle roller, så anon-klienten får PGRST205 bare når
 * tabellen virkelig mangler. Et tomt svar eller et RLS-avslag betyr at den
 * finnes. Ingen rader forlater funksjonen. Listen bor i tabell-finnes.ts.
 */
const TABELL_CACHE_MS = 5 * 60 * 1000;
let tabellCache: { ts: number; resultat: CheckResult } | null = null;

async function checkNyereTabeller(): Promise<CheckResult> {
  if (tabellCache && Date.now() - tabellCache.ts < TABELL_CACHE_MS) return tabellCache.resultat;
  let resultat: CheckResult;
  try {
    const supabase = createClient();
    const svar = await Promise.all(
      NYERE_TABELLER.map(async ({ tabell, migrasjon }) => {
        const { error } = await supabase.from(tabell).select('*').limit(1);
        return erManglendeTabell(error) ? `${tabell} (migrasjon ${migrasjon})` : null;
      })
    );
    const mangler = svar.filter((s): s is string => s !== null);
    resultat = mangler.length
      ? { ok: false, message: `Mangler: ${mangler.join(', ')}` }
      : { ok: true, message: `${NYERE_TABELLER.length} tabeller funnet` };
  } catch (err) {
    resultat = { ok: false, message: err instanceof Error ? err.message : 'unknown' };
  }
  // Bare et rent svar mellomlagres — en mangel skal forsvinne straks den er rettet.
  if (resultat.ok) tabellCache = { ts: Date.now(), resultat };
  return resultat;
}

// Read Next's version from its package.json once at module load; this
// resolves through node_modules and works on both Node and Edge runtimes
// since the file is a static JSON.
const NEXT_VERSION = (() => {
  try {
    // require() works because this route is on the Node runtime (force-dynamic)
    // and avoids needing to mark the import as a JSON module via esbuild.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('next/package.json') as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
})();

function getNextVersion(): string {
  return NEXT_VERSION;
}

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const fast = new URL(request.url).searchParams.get('fast') === '1';

  const rl = checkRateLimit(`health:${getClientKey(request, null)}`, 120, 60);
  if (!rl.allowed) {
    return rateLimitResponse(rl);
  }

  const envVarsCheck = checkEnvVars();

  // E-postsjekken er med i BEGGE varianter, også ?fast=1: den koster ingenting
  // (to oppslag i process.env) og er nettopp den feilen man vil se hyppig.
  const checks: HealthResponse['checks'] = {
    envVars: envVarsCheck,
    epost: checkEpost()
  };

  if (!fast) {
    const [database, auditLogTable, ai, tabeller] = await Promise.all([
      checkDatabase(),
      checkAuditLogTable(),
      checkAi(log),
      checkNyereTabeller()
    ]);
    checks.database = database;
    checks.auditLogTable = auditLogTable;
    checks.ai = ai;
    checks.tabeller = tabeller;
  }

  // E-post står i svaret, men teller IKKE mot 503.
  //
  // Appen serverer helt fint uten utsending: kart, arter, identifisering og
  // betaling er upåvirket. En oppetidsprobe som blir rød for manglende
  // RESEND-nøkler melder feil problem — og i lokal dev og i `npm run qa` er
  // nøklene aldri satt, så et 503 der ville gjort helsetesten permanent rød og
  // dermed verdiløs.
  //
  // Den som vil vokte utsendingen, vokter feltet `checks.epost.ok` direkte.
  // Det er hele grunnen til at sjekken finnes: å gjøre en stille feil synlig,
  // ikke å felle appen.
  // AI-sjekken står utenfor 503 av samme grunn: nøkkelen er aldri satt lokalt
  // og i `npm run qa`, og kart, arter og betaling går uten den. Den som vil
  // vokte AI-en, vokter `checks.ai.ok` — og dagsrapporten sier fra hver morgen.
  // Tabellisten står også utenfor 503 i første runde: den er ny, og et
  // oppetidsvarsel skal ikke bli rødt av en liste ingen har sett svaret på i
  // prod ennå. Den logges som advarsel og kan voktes via `checks.tabeller.ok`.
  const { epost, ai, tabeller, ...oppetidssjekker } = checks;
  const allOk = Object.values(oppetidssjekker).every((c) => c?.ok);
  const status: 'ok' | 'degraded' = allOk ? 'ok' : 'degraded';

  if (!allOk) {
    log.warn('health.degraded', { checks });
  } else if (!fast) {
    log.debug('health.ok');
  }
  if (tabeller && !tabeller.ok) {
    log.warn('health.tabeller_mangler', { message: tabeller.message });
  }
  if (ai && !ai.ok) {
    log.warn('health.ai_utilgjengelig', { message: ai.message });
  }
  if (!epost.ok) {
    // Egen linje, alltid — også når status er ok. Ellers er den ene feilen
    // som ikke feller appen også den ingen ser.
    log.warn('health.epost_ikke_konfigurert', { message: epost.message });
  }

  const body: HealthResponse = {
    status,
    ts: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime?.() ?? 0),
    build: {
      nextVersion: getNextVersion(),
      nodeEnv: process.env.NODE_ENV ?? 'unknown'
    },
    checks
  };

  return NextResponse.json(body, { status: allOk ? 200 : 503 });
}
