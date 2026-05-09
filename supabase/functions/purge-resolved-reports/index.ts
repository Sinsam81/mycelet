// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { requireServiceRole } from '../_shared/auth.ts';

/**
 * Cron Edge Function — Daily 03:30 Europe/Oslo
 *
 * Implements the "Reports filed OM bruker — slettes 1 år etter løsning"
 * line in docs/retention-policy.md. Reports against a user are kept
 * during active investigation, but once status='resolved' and a year
 * has passed since resolved_at, the row is deleted. The reporter and
 * reportee no longer need (or have any reason) to see it.
 *
 * Reports filed BY the user (i.e. reports they raised) keep the
 * existing ON DELETE CASCADE — they go away when the reporter's
 * account is deleted, or when the reported content is deleted.
 *
 * Schema requirements (migration 011 ensures these are present):
 *   - reports.status — set to 'resolved' or 'dismissed' when handled
 *   - reports.resolved_at — set when status changes to one of those
 *
 * Both fields are validated below; older schema versions return a
 * graceful no-op rather than an error.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authError = requireServiceRole(req);
  if (authError) return authError;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  let deletedCount = 0;
  const errors: string[] = [];

  // Defensive — older schema versions may not have status/resolved_at.
  // Try the query and treat schema errors as "no-op, schema not ready".
  const { data, error } = await supabase
    .from('reports')
    .delete()
    .in('status', ['resolved', 'dismissed'])
    .lt('resolved_at', oneYearAgo)
    .select('id');

  if (error) {
    if (/column .* does not exist/i.test(error.message)) {
      console.log('[purge-resolved-reports] schema does not have status/resolved_at yet — no-op');
      return new Response(
        JSON.stringify({ ok: true, deletedCount: 0, note: 'reports schema lacks status/resolved_at; no-op' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    errors.push(error.message);
  } else {
    deletedCount = (data ?? []).length;
  }

  console.log('[purge-resolved-reports]', { deletedCount, errors });

  return new Response(JSON.stringify({ ok: errors.length === 0, deletedCount, errors }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: errors.length === 0 ? 200 : 500
  });
});
