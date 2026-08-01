// Create the Apple App Review demo account with an active season pass.
// Idempotent: skips creation steps that already exist.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const EMAIL = 'applereview@mycelet.com';
const PASSWORD = 'Mycelet-Review-2026!';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// 1) Auth user
const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
let user = list.users.find((u) => u.email === EMAIL);
if (!user) {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true
  });
  if (error) throw error;
  user = data.user;
  console.log('auth-bruker opprettet:', user.id);
} else {
  console.log('auth-bruker fantes:', user.id);
}

// 2) Profile
const { data: existingProfile } = await admin.from('profiles').select('id').eq('id', user.id).maybeSingle();
if (!existingProfile) {
  const { error } = await admin.from('profiles').insert({
    id: user.id,
    username: 'applereview',
    display_name: 'Apple Review'
  });
  if (error) throw error;
  console.log('profil opprettet');
} else {
  console.log('profil fantes');
}

// 3) Active season pass (same manual_grant pattern as the founder pass)
const { data: existingSub } = await admin
  .from('billing_subscriptions')
  .select('id, tier, status')
  .eq('user_id', user.id)
  .maybeSingle();
if (!existingSub) {
  const { error } = await admin.from('billing_subscriptions').insert({
    user_id: user.id,
    tier: 'season_pass',
    status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: '2028-01-01T00:00:00Z',
    cancel_at_period_end: true,
    metadata: { note: 'Apple App Review demo account', source: 'manual_grant' }
  });
  if (error) throw error;
  console.log('season pass tildelt (til 2028-01-01)');
} else {
  console.log('abonnement fantes:', existingSub.tier, existingSub.status);
}

// 4) Verify: real password login + billing row visible
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: session, error: loginError } = await anon.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD
});
if (loginError) throw loginError;
console.log('innlogging verifisert som', session.user.email);

const { data: sub } = await admin
  .from('billing_subscriptions')
  .select('tier, status, current_period_end')
  .eq('user_id', user.id)
  .single();
console.log('aktiv plan:', JSON.stringify(sub));
