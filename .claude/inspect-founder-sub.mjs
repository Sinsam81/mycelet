// Read-only: inspect the founder subscription row shape + profiles schema
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: subs, error } = await supabase
  .from('billing_subscriptions')
  .select('*')
  .eq('status', 'active')
  .limit(3);
if (error) throw error;
for (const s of subs) {
  const masked = { ...s, user_id: s.user_id?.slice(0, 8) + '…' };
  console.log(JSON.stringify(masked, null, 2));
}
const { data: profile } = await supabase.from('profiles').select('*').limit(1);
console.log('profil-kolonner:', Object.keys(profile?.[0] ?? {}));
