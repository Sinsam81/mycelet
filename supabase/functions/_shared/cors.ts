// CORS headers used by all retention-policy Edge Functions.
// These functions are invoked by Supabase's pg_cron via http.post or
// by external schedulers (cron-job.org, GitHub Actions); they don't
// serve browser traffic. CORS is permissive because the only auth
// mechanism is the bearer token check at the top of each handler.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
