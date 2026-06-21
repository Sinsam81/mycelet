#!/usr/bin/env node
/**
 * QA test-user setup for the full-evaluation loop.
 *
 * Most of the app is login-gated (PROTECTED_PATHS in middleware.ts), so the
 * Playwright evaluation needs a dedicated, confirmed account. This script:
 *   1. Creates (or reuses) a QA user via the Supabase admin client.
 *   2. Ensures a profiles row exists for it.
 *   3. Writes QA_TEST_EMAIL + QA_TEST_PASSWORD into .env.local (idempotent).
 *
 * It is idempotent — safe to run repeatedly. Run once before the first loop:
 *   npm run qa:setup
 * To remove the user later:
 *   npm run qa:setup -- --delete
 *
 * Run with:  node --env-file=.env.local scripts/qa-create-test-user.mjs
 * (the npm script wires the env file for you).
 *
 * NOTE: there is only one Supabase project (no staging), so this user lives in
 * the production database. It is a plain free account; the evaluation keeps
 * authenticated tests read-only so nothing is written to prod.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const QA_EMAIL = 'qa-autotest@mycelet.com';
const QA_USERNAME = 'qa-autotest';
const ENV_PATH = resolve(process.cwd(), '.env.local');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    '✗ Mangler NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY.\n' +
      '  Kjør via npm-scriptet (npm run qa:setup) så .env.local lastes automatisk.'
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

/** Find an existing auth user by email (paginates so it works at any size). */
async function findUserByEmail(email) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) break;
  }
  return null;
}

/** Read .env.local into a {key: rawLine} map plus the raw text. */
function readEnv() {
  if (!existsSync(ENV_PATH)) return { text: '', keys: new Set() };
  const text = readFileSync(ENV_PATH, 'utf8');
  const keys = new Set(
    text
      .split('\n')
      .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=/))
      .filter(Boolean)
      .map((m) => m[1])
  );
  return { text, keys };
}

/** Append KEY=value lines that are not already present. Returns added keys. */
function ensureEnvLines(pairs) {
  const { text, keys } = readEnv();
  const toAdd = pairs.filter(([k]) => !keys.has(k));
  if (toAdd.length === 0) return [];
  const block =
    (text.length && !text.endsWith('\n') ? '\n' : '') +
    '\n# QA full-evaluation loop (scripts/qa-create-test-user.mjs)\n' +
    toAdd.map(([k, v]) => `${k}=${v}`).join('\n') +
    '\n';
  writeFileSync(ENV_PATH, text + block, 'utf8');
  return toAdd.map(([k]) => k);
}

async function deleteUser() {
  const existing = await findUserByEmail(QA_EMAIL);
  if (!existing) {
    console.log(`Ingen QA-bruker (${QA_EMAIL}) å slette.`);
    return;
  }
  const { error } = await admin.auth.admin.deleteUser(existing.id);
  if (error) throw error;
  console.log(`✓ Slettet QA-bruker ${QA_EMAIL} (FK-cascade rydder profil + rader).`);
  console.log('  Fjern QA_TEST_EMAIL/QA_TEST_PASSWORD fra .env.local manuelt hvis du vil.');
}

async function createOrReuse() {
  // Reuse an existing password from .env.local if present, otherwise generate one.
  let password = process.env.QA_TEST_PASSWORD;
  const generated = !password;
  if (!password) password = `Qa!${randomBytes(18).toString('base64url')}`;

  let user = await findUserByEmail(QA_EMAIL);

  if (user) {
    console.log(`• QA-bruker finnes allerede (${QA_EMAIL}).`);
    // If we just generated a fresh password, sync it so login works.
    if (generated) {
      const { error } = await admin.auth.admin.updateUserById(user.id, {
        password,
        email_confirm: true
      });
      if (error) throw error;
      console.log('  ↳ Satt nytt passord (lagres i .env.local under).');
    }
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: QA_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { username: QA_USERNAME, display_name: 'QA Autotest' }
    });
    if (error) throw error;
    user = data.user;
    console.log(`✓ Opprettet QA-bruker ${QA_EMAIL} (e-post bekreftet).`);
  }

  // Ensure a profiles row (admin-created users skip the auth/callback upsert).
  const { error: profileError } = await admin
    .from('profiles')
    .upsert(
      { id: user.id, username: QA_USERNAME, display_name: 'QA Autotest' },
      { onConflict: 'id' }
    );
  if (profileError) {
    console.warn(`⚠ Kunne ikke sikre profil-rad: ${profileError.message} (ikke kritisk for de fleste tester).`);
  } else {
    console.log('✓ Profil-rad sikret.');
  }

  const added = ensureEnvLines([
    ['QA_TEST_EMAIL', QA_EMAIL],
    ['QA_TEST_PASSWORD', password]
  ]);
  if (added.length) {
    console.log(`✓ La til ${added.join(' + ')} i .env.local.`);
  } else {
    console.log('• .env.local hadde allerede QA_TEST_EMAIL/QA_TEST_PASSWORD.');
  }

  console.log('\nKlart. Kjør `npm run qa` for å starte full produktevaluering.');
}

async function main() {
  if (process.argv.includes('--delete')) {
    await deleteUser();
    return;
  }
  await createOrReuse();
}

main().catch((err) => {
  console.error('✗ Feilet:', err instanceof Error ? err.message : err);
  process.exit(1);
});
