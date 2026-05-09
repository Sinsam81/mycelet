// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { requireServiceRole } from '../_shared/auth.ts';

/**
 * Cron Edge Function — Daily 04:00 Europe/Oslo
 *
 * Implements the "Stripe webhook-events — slettes etter 2 år" line in
 * docs/retention-policy.md. Webhook events are diagnostic data (we
 * inspect them when something goes wrong with a subscription); past
 * 2 years they're noise, and Stripe Dashboard preserves the
 * authoritative record anyway.
 *
 * billing_subscriptions rows are NOT touched here — they're kept for
 * 5 years per bokføringsloven, but that retention is currently handled
 * by Stripe's own data + the cascade FK from auth.users. Adding a
 * 5-year purge here is straightforward when we decide to copy that
 * responsibility into our DB.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authError = requireServiceRole(req);
  if (authError) return authError;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
  const errors: string[] = [];

  const { data, error } = await supabase
    .from('billing_webhook_events')
    .delete()
    .lt('received_at', twoYearsAgo)
    .select('id');

  let deletedCount = 0;
  if (error) {
    if (/relation .* does not exist|column .* does not exist/i.test(error.message)) {
      console.log('[prune-billing-events] table or column missing — no-op');
      return new Response(
        JSON.stringify({ ok: true, deletedCount: 0, note: 'billing_webhook_events schema not ready; no-op' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    errors.push(error.message);
  } else {
    deletedCount = (data ?? []).length;
  }

  console.log('[prune-billing-events]', { deletedCount, errors });

  return new Response(JSON.stringify({ ok: errors.length === 0, deletedCount, errors }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: errors.length === 0 ? 200 : 500
  });
});
