import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createRequestLogger } from '@/lib/log/request';

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
 * NB: This route is intentionally PUBLIC. No auth, no rate limiting.
 * Health probes need to hit it constantly; auth-gating would defeat the
 * purpose. We don't expose anything sensitive in the response.
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
    database?: CheckResult;
    auditLogTable?: CheckResult;
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
    const { error } = await supabase.from('admin_audit_log').select('id', { count: 'exact', head: true }).limit(1);
    if (error) {
      // 42P01 = relation does not exist
      if (error.code === '42P01') {
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

// Read Next's version from its package.json once at module load; this
// resolves through node_modules and works on both Node and Edge runtimes
// since the file is a static JSON.
// eslint-disable-next-line @typescript-eslint/no-var-requires
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

  const envVarsCheck = checkEnvVars();

  const checks: HealthResponse['checks'] = {
    envVars: envVarsCheck
  };

  if (!fast) {
    const [database, auditLogTable] = await Promise.all([checkDatabase(), checkAuditLogTable()]);
    checks.database = database;
    checks.auditLogTable = auditLogTable;
  }

  const allOk = Object.values(checks).every((c) => c?.ok);
  const status: 'ok' | 'degraded' = allOk ? 'ok' : 'degraded';

  if (!allOk) {
    log.warn('health.degraded', { checks });
  } else if (!fast) {
    log.debug('health.ok');
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
