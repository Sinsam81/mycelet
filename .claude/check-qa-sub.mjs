// Read-only baseline check: QA user's billing_subscriptions row
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const envPath = process.argv[2]
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data: users, error: userErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
if (userErr) throw userErr
const qa = users.users.find((u) => u.email === 'qa-autotest@mycelet.com')
if (!qa) {
  console.log('QA-bruker ikke funnet')
  process.exit(1)
}
console.log('QA user id:', qa.id)

const { data: subs, error: subErr } = await supabase
  .from('billing_subscriptions')
  .select('*')
  .eq('user_id', qa.id)
if (subErr) throw subErr
console.log('billing_subscriptions rader:', subs.length)
for (const s of subs) {
  console.log(JSON.stringify(s, null, 2))
}
