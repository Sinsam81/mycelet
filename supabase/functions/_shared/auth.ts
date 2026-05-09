/**
 * Shared bearer-token check for cron Edge Functions.
 *
 * The cron functions write privileged operations (deleting users,
 * deleting reports). They must NOT be invokable by anonymous traffic
 * even with the public anon key. We require the SERVICE_ROLE_KEY in
 * the Authorization header — the same key Supabase auto-injects when
 * it invokes the function from pg_cron, and the same key the user
 * pastes into an external scheduler's bearer-token field.
 *
 * Returns null if authorized, or a Response (to short-circuit) if not.
 */
export function requireServiceRole(req: Request): Response | null {
  const auth = req.headers.get('Authorization') ?? '';
  const provided = auth.replace(/^Bearer\s+/i, '');
  const expected = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!expected) {
    return new Response(
      JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }),
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
