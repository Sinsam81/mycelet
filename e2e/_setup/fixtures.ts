import { test as base, expect } from '@playwright/test';

/**
 * Base test for the whole evaluation suite. Seeds the first-run localStorage
 * flags so the onboarding intro, cookie notice and map intro never appear —
 * those full-screen overlays intercept clicks and are not what we're testing.
 * A real user sees each only once; the QA loop bypasses them to reach the flows.
 *
 * NØKKELNAVNENE MÅ MATCHE KILDEN. Fram til nå satte fixturen
 * `mycelet:cookie-notice-dismissed-v1`, en nøkkel INGEN kode leser: CookieNotice
 * kaller readAnalyticsConsent(), som leser `mycelet:analytics-consent-v1`
 * (src/lib/analytics.ts). Kommentaren her lovet altså at notisen aldri dukket
 * opp, mens hver eneste QA-kjøring i praksis kjørte med den oppe — og suiten
 * ble grønn likevel, fordi `toBeVisible()` godtar elementer under et overlay.
 *
 * De to andre nøklene stemmer (OnboardingIntro.tsx, MushroomMap.tsx).
 *
 * NB: dette skjuler notisen for suiten. Én test bør bevisst LA VÆRE å sette
 * flagget og klikke seg gjennom bunnmenyen med notisen oppe — ellers er
 * overlappen fortsatt utestet, bare på en ærlig måte.
 *
 * Import `{ test, expect }` from here instead of '@playwright/test'.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      try {
        localStorage.setItem('mycelet:onboarding-v1', '1');
        // 'denied' er verdien src faktisk forstår (AnalyticsConsent).
        localStorage.setItem('mycelet:analytics-consent-v1', 'denied');
        localStorage.setItem('mycelet:map-intro-v1', '1');
      } catch {
        // localStorage may be unavailable before first navigation — ignore.
      }
    });
    await use(context);
  }
});

export { expect };
