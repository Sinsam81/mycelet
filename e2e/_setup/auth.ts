import { resolve } from 'node:path';

// Where the authenticated browser state (cookies) is saved by auth.setup.ts and
// reused by the authed test project. Kept out of git (.gitignore covers e2e/.auth).
export const AUTH_FILE = resolve(process.cwd(), 'e2e/.auth/state.json');

export const QA_EMAIL = process.env.QA_TEST_EMAIL ?? '';
export const QA_PASSWORD = process.env.QA_TEST_PASSWORD ?? '';

/**
 * True when a dedicated QA test user is configured. Authenticated tests skip
 * themselves when this is false so the suite stays green before `npm run qa:setup`.
 */
export function hasQaCreds(): boolean {
  return QA_EMAIL.length > 0 && QA_PASSWORD.length > 0;
}
