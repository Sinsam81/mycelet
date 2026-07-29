export const ANALYTICS_CONSENT_KEY = 'mycelet:analytics-consent-v1';
export const ANALYTICS_CONSENT_CHANGED_EVENT = 'mycelet:analytics-consent-changed';
export const ANALYTICS_CONSENT_REQUEST_EVENT = 'mycelet:analytics-consent-request';

// GA4 admin settings this integration assumes for property G-0ZYHPZ2KM4
// (they are NOT code-enforceable — set them in GA4 Admin and keep them):
//   - Data retention: 14 months, "Reset user data on new activity" OFF
//     (matches the privacy-policy wording in messages/*.json)
//   - Enhanced measurement → "Page changes based on browser history events"
//     OFF (we send consent-guarded page_view manually; the default ON would
//     double-count every SPA navigation)
//   - Google Signals OFF at property level
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? 'G-0ZYHPZ2KM4';

export type AnalyticsConsent = 'granted' | 'denied';

// Session-scoped mirror of the persisted consent so a grant still works when
// localStorage is blocked (private mode) — readAnalyticsConsent() would return
// null there and silently drop every event after the user said yes.
let sessionConsent: AnalyticsConsent | null = null;

type AnalyticsValue =
  | string
  | number
  | boolean
  | null
  | AnalyticsValue[]
  | { [key: string]: AnalyticsValue };

export type AnalyticsEventParameters = Record<string, AnalyticsValue>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export const DENIED_GOOGLE_CONSENT = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied'
} as const;

export const GRANTED_ANALYTICS_CONSENT = {
  analytics_storage: 'granted',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied'
} as const;

/**
 * Creates Google's command queue without loading or contacting Google.
 * The external gtag script is mounted separately, and only after consent.
 */
export function ensureGoogleTagQueue() {
  if (typeof window === 'undefined') return null;

  window.dataLayer ??= [];
  window.gtag ??= (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };

  return window.gtag;
}

export function readAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    if (stored === 'granted' || stored === 'denied') return stored;
  } catch {
    // Storage blocked — fall through to the session-scoped choice.
  }
  return sessionConsent;
}

function clearGoogleAnalyticsCookies() {
  if (typeof document === 'undefined') return;

  const cookieNames = document.cookie
    .split(';')
    .map((cookie) => cookie.split('=')[0]?.trim())
    .filter((name): name is string => Boolean(name?.startsWith('_ga')));

  const hostname = window.location.hostname;
  const rootDomain = hostname.split('.').slice(-2).join('.');
  const domains = ['', hostname, `.${hostname}`, rootDomain, `.${rootDomain}`];

  for (const name of cookieNames) {
    for (const domain of domains) {
      const domainPart = domain ? `;domain=${domain}` : '';
      document.cookie = `${name}=;Max-Age=0;path=/${domainPart};SameSite=Lax`;
    }
  }
}

export function updateAnalyticsConsent(consent: AnalyticsConsent) {
  if (typeof window === 'undefined') return;

  const previous = readAnalyticsConsent();
  sessionConsent = consent;

  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, consent);
  } catch {
    // Consent still applies for this page even if persistent storage is blocked.
  }

  // Google's documented kill switch: fully disables an already-loaded gtag
  // instance (a mere consent update still allows cookieless pings).
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`] =
    consent === 'denied';

  const gtag = ensureGoogleTagQueue();
  gtag?.(
    'consent',
    'update',
    consent === 'granted' ? GRANTED_ANALYTICS_CONSENT : DENIED_GOOGLE_CONSENT
  );

  if (consent === 'denied') {
    clearGoogleAnalyticsCookies();
    // An in-flight gtag write can re-create _ga right after the update; sweep
    // once more after the current task queue drains.
    setTimeout(clearGoogleAnalyticsCookies, 0);
  }

  window.dispatchEvent(
    new CustomEvent<AnalyticsConsent>(ANALYTICS_CONSENT_CHANGED_EVENT, {
      detail: consent
    })
  );

  // Withdrawing after the script has loaded: a reload is the only way back to
  // a truly Google-free page (the loaded script cannot be unloaded).
  if (previous === 'granted' && consent === 'denied' && document.getElementById('mycelet-ga4')) {
    window.location.reload();
  }
}

export function requestAnalyticsConsentChoice() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ANALYTICS_CONSENT_REQUEST_EVENT));
}

export function trackEvent(name: string, parameters: AnalyticsEventParameters = {}) {
  if (readAnalyticsConsent() !== 'granted') return;
  ensureGoogleTagQueue()?.('event', name, parameters);
}

export function trackPageView(pathname: string) {
  if (typeof window === 'undefined' || readAnalyticsConsent() !== 'granted') return;

  ensureGoogleTagQueue()?.('event', 'page_view', {
    page_location: `${window.location.origin}${pathname}`,
    page_path: pathname,
    page_title: document.title
  });
}
