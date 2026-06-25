import { getTranslations } from 'next-intl/server';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Admin-only view of the append-only `admin_audit_log` table (migration 008,
 * shipped in PR #25). Lists the last 100 sensitive operations: who-did-what-
 * to-whom, with IP and User-Agent for forensics.
 *
 * Access:
 *   - Middleware already protects `/admin/*` paths against logged-out users
 *     (see src/lib/supabase/middleware.ts PROTECTED_PATHS)
 *   - This page additionally checks moderator_roles and renders an explicit
 *     "no access" message for logged-in non-moderators (more useful than a
 *     blank screen)
 *   - All actual queries run through the service-role admin client so we
 *     don't depend on a moderator's RLS visibility into profiles for
 *     resolving actor / target usernames
 *
 * Robust to setup gaps:
 *   - If migration 008 hasn't been applied yet, the audit_log query errors;
 *     we render a clear "migration pending" message rather than crashing
 *   - If the user has no moderator_roles row, "no access" message
 */

export async function generateMetadata() {
  const t = await getTranslations('AdminAuditLog');
  return {
    title: t('metaTitle'),
    description: t('metaDescription')
  };
}

interface AuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_user_id: string | null;
  target_resource: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface ProfileLookup {
  id: string;
  username: string | null;
  display_name: string | null;
}

const ACTION_LABEL_KEYS: Record<string, string> = {
  'verified_forager.upsert': 'actionVerifiedForagerUpsert',
  'verified_forager.delete': 'actionVerifiedForagerDelete',
  'account.self_delete': 'actionAccountSelfDelete',
  'account.admin_delete': 'actionAccountAdminDelete'
};

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString('nb-NO', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function truncateMiddle(value: string, maxLength = 16) {
  if (value.length <= maxLength) return value;
  const head = Math.ceil((maxLength - 1) / 2);
  const tail = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

function UserCell({
  id,
  lookup,
  deletedLabel
}: {
  id: string | null;
  lookup: Map<string, ProfileLookup>;
  deletedLabel: string;
}) {
  if (!id) return <span className="text-gray-400">—</span>;
  const profile = lookup.get(id);
  if (profile) {
    return (
      <span title={id}>
        {profile.display_name ?? profile.username ?? truncateMiddle(id)}
        {profile.username && profile.display_name ? (
          <span className="text-gray-500"> · @{profile.username}</span>
        ) : null}
      </span>
    );
  }
  // Profile not found — likely a deleted user. Show truncated UUID.
  return (
    <span className="text-gray-500" title={id}>
      <span className="italic">{deletedLabel}</span> · {truncateMiddle(id)}
    </span>
  );
}

export default async function AuditLogPage() {
  const t = await getTranslations('AdminAuditLog');
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    // Middleware should already have redirected, but be defensive.
    return (
      <PageWrapper>
        <p className="text-sm text-gray-700">{t('mustBeLoggedIn')}</p>
      </PageWrapper>
    );
  }

  const { data: roleRow } = await supabase
    .from('moderator_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  const role = roleRow?.role ?? null;
  if (role !== 'admin' && role !== 'moderator') {
    return (
      <PageWrapper>
        <article className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-6 w-6 shrink-0 text-amber-700" />
            <div>
              <p className="text-base font-bold text-amber-900">{t('noAccessTitle')}</p>
              <p className="text-sm text-amber-900">
                {t('noAccessBodyBefore')} <code>moderator_roles</code>.
              </p>
            </div>
          </div>
        </article>
      </PageWrapper>
    );
  }

  // Use the service-role client so we can resolve usernames across all
  // profiles regardless of RLS, and so a missing migration surfaces as a
  // clean error rather than a confusing empty list.
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return (
      <PageWrapper>
        <article className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 shrink-0 text-red-700" />
            <div>
              <p className="text-base font-bold text-red-900">{t('serverConfigErrorTitle')}</p>
              <p className="text-sm text-red-900">
                <code>SUPABASE_SERVICE_ROLE_KEY</code> {t('serverConfigErrorBody')}
              </p>
            </div>
          </div>
        </article>
      </PageWrapper>
    );
  }

  const { data: rawEntries, error: auditError } = await admin
    .from('admin_audit_log')
    .select('id,actor_id,action,target_user_id,target_resource,metadata,ip_address,user_agent,created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (auditError) {
    return (
      <PageWrapper>
        <article className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 shrink-0 text-amber-700" />
            <div>
              <p className="text-base font-bold text-amber-900">{t('cannotReadTitle')}</p>
              <p className="text-sm text-amber-900">
                {t('cannotReadBodyBefore')} (<code>admin_audit_log</code>) {t('cannotReadBodyMiddle')}{' '}
                <code>supabase/migrations/008_admin_audit_log.sql</code> {t('cannotReadBodyAfter')}
              </p>
              <p className="mt-1 text-xs text-amber-900/80">{t('detailsPrefix')} {auditError.message}</p>
            </div>
          </div>
        </article>
      </PageWrapper>
    );
  }

  const entries = (rawEntries ?? []) as AuditRow[];

  // Resolve usernames for actor + target so the table is readable. Build a
  // single set of UUIDs to look up to avoid duplicates and N+1 queries.
  const userIdSet = new Set<string>();
  for (const entry of entries) {
    if (entry.actor_id) userIdSet.add(entry.actor_id);
    if (entry.target_user_id) userIdSet.add(entry.target_user_id);
  }
  const userIds = Array.from(userIdSet);

  let profileMap = new Map<string, ProfileLookup>();
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id,username,display_name')
      .in('id', userIds);

    profileMap = new Map<string, ProfileLookup>(
      (profiles ?? []).map((p) => [p.id as string, p as ProfileLookup])
    );
  }

  return (
    <PageWrapper>
      <section className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{t('heading')}</h1>
          <p className="text-sm text-gray-700">{t('intro')}</p>
        </div>

        {entries.length === 0 ? (
          <article className="rounded-xl bg-white p-6 text-center text-sm text-gray-700 shadow-sm">
            <p>{t('emptyState')}</p>
          </article>
        ) : (
          <article className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('colTime')}</th>
                  <th className="px-3 py-2 font-medium">{t('colAction')}</th>
                  <th className="px-3 py-2 font-medium">{t('colBy')}</th>
                  <th className="px-3 py-2 font-medium">{t('colTarget')}</th>
                  <th className="px-3 py-2 font-medium">{t('colDetails')}</th>
                  <th className="px-3 py-2 font-medium">{t('colIp')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((entry) => (
                  <tr key={entry.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-700">{formatTimestamp(entry.created_at)}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-forest-900">
                        {ACTION_LABEL_KEYS[entry.action] ? t(ACTION_LABEL_KEYS[entry.action]) : entry.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-800">
                      <UserCell id={entry.actor_id} lookup={profileMap} deletedLabel={t('deletedUser')} />
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-800">
                      {entry.target_user_id ? (
                        <UserCell id={entry.target_user_id} lookup={profileMap} deletedLabel={t('deletedUser')} />
                      ) : entry.target_resource ? (
                        <span className="text-gray-700">{entry.target_resource}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {Object.keys(entry.metadata ?? {}).length > 0 ? (
                        <pre className="max-w-[24rem] overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-tight">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-600" title={entry.user_agent ?? ''}>
                      {entry.ip_address ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        )}

        <p className="pt-2 text-xs text-gray-500">{t('footerNote')}</p>
      </section>
    </PageWrapper>
  );
}
