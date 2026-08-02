import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Append-only audit logging for sensitive operations (admin role changes,
 * account deletion, etc.). Writes to the `admin_audit_log` table from
 * migration 008.
 *
 * Failure-safe: if the audit insert errors (service-role key missing, table
 * not migrated yet, network blip), we swallow it and log to server console.
 * The underlying action that triggered the audit must NEVER fail because of
 * audit-write failure — that would punish users for our infrastructure
 * problems.
 *
 * Standard action vocabulary (extend as needed; keep dot-namespaced):
 *
 *   verified_forager.upsert    — admin assigned/updated a verified-forager role
 *   verified_forager.delete    — admin removed a verified-forager role
 *   account.self_delete        — user deleted their own account (GDPR Art. 17)
 *   account.admin_delete       — admin deleted another user's account
 *
 * Reads happen via the regular session client; RLS in migration 008 only
 * allows moderators/admins to SELECT.
 */

export interface AuditLogEntry {
  /** Who initiated the action. NULL for system-triggered events. */
  actorId: string | null;
  /** Dot-namespaced action identifier (see vocabulary above). */
  action: string;
  /** Affected user, if action is user-targeted. */
  targetUserId?: string | null;
  /** Free-form resource identifier when not user-targeted. */
  targetResource?: string | null;
  /** Per-action context. Avoid PII here — keep to IDs and codes. */
  metadata?: Record<string, unknown>;
  /** Pass through for IP + user-agent capture. */
  request?: NextRequest;
}

/**
 * Handlinger som ALDRI skal lagre IP-adresse og nettleserstreng.
 *
 * admin_audit_log kan ingen slette fra — triggerne i migrasjon 008 blokkerer
 * både UPDATE og DELETE, også for tjenesterollen. En rad her er i praksis evig.
 *
 * `account.self_delete` skrives i det øyeblikket brukeren har bedt om å bli
 * glemt etter GDPR art. 17. Å legge igjen IP-adressen og nettleserstrengen
 * deres i nettopp den tabellen er det motsatte av det de ba om — og den
 * opplysningen tilfører ingenting: raden har allerede bruker-ID-en, som er hele
 * poenget med sporet.
 *
 * Merk at dette er en regel i selve hjelperen, ikke bare på kallstedet. Da kan
 * ikke en fremtidig ny kaller gjeninnføre lagringen ved uhell.
 */
const ACTIONS_WITHOUT_CLIENT_CONTEXT = new Set(['account.self_delete']);

function getIpFromRequest(req: NextRequest): string | null {
  // Vercel and most reverse proxies set X-Forwarded-For; the first hop is
  // the original client. X-Real-IP is the fallback header some setups use.
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? null;
  }
  return req.headers.get('x-real-ip');
}

export async function logAdminAction(entry: AuditLogEntry): Promise<void> {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    // Service role key missing — common in dev. Don't break the action.
    console.warn('[audit] admin client unavailable; skipping log for action:', entry.action);
    return;
  }

  const captureClientContext = !ACTIONS_WITHOUT_CLIENT_CONTEXT.has(entry.action);
  const ipAddress = entry.request && captureClientContext ? getIpFromRequest(entry.request) : null;
  const userAgent = (captureClientContext ? entry.request?.headers.get('user-agent') : null) ?? null;

  const { error } = await admin.from('admin_audit_log').insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_user_id: entry.targetUserId ?? null,
    target_resource: entry.targetResource ?? null,
    metadata: entry.metadata ?? {},
    ip_address: ipAddress,
    user_agent: userAgent
  });

  if (error) {
    // Don't throw — audit logging should never break the underlying action.
    // Surface to server console so the failure is visible in deploy logs.
    console.error('[audit] insert failed for action', entry.action, error);
  }
}
