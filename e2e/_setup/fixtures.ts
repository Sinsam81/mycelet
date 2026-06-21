import { test as base, expect } from '@playwright/test';

/**
 * Base test for the whole evaluation suite. Seeds the first-run localStorage
 * flags so the onboarding intro, cookie notice and map intro never appear —
 * those full-screen overlays intercept clicks and are not what we're testing.
 * A real user sees each only once; the QA loop bypasses them to reach the flows.
 *
 * Import `{ test, expect }` from here instead of '@playwright/test'.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      try {
        localStorage.setItem('mycelet:onboarding-v1', '1');
        localStorage.setItem('mycelet:cookie-notice-dismissed-v1', '1');
        localStorage.setItem('mycelet:map-intro-v1', '1');
      } catch {
        // localStorage may be unavailable before first navigation — ignore.
      }
    });
    await use(context);
  }
});

export { expect };
