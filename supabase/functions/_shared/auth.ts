/**
 * Shared bearer-token check for cron Edge Functions.
 *
 * The cron functions write privileged operations (deleting users,
 * deleting reports). They must NOT be invokable by anonymous traffic
 * even with the public anon key.
 *
 * We use a dedicated CRON_SECRET (set via `supabase secrets set`)
 * rather than reusing SUPABASE_SERVICE_ROLE_KEY. Supabase's runtime
 * injects its own value of SUPABASE_SERVICE_ROLE_KEY which doesn't
 * always match the dashboard-visible service_role value (legacy vs
 * the new "secret API keys" system can differ); using a key we
 * generate ourselves removes that ambiguity.
 *
 * Returns null if authorized, or a Response (to short-circuit) if not.
 */
export function requireServiceRole(req: Request): Response | null {
  const auth = req.headers.get('Authorization') ?? '';
  const provided = auth.replace(/^Bearer\s+/i, '');
  const expected = Deno.env.get('CRON_SECRET') ?? '';

  if (!expected) {
    return new Response(
      JSON.stringify({ error: 'CRON_SECRET not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!provided || provided !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return null;
}
