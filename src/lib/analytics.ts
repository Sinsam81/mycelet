export const ANALYTICS_CONSENT_KEY = 'mycelet:analytics-consent-v1';
export const ANALYTICS_CONSENT_CHANGED_EVENT = 'mycelet:analytics-consent-changed';
export const ANALYTICS_CONSENT_REQUEST_EVENT = 'mycelet:analytics-consent-request';

export type AnalyticsConsent = 'granted' | 'denied';

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
    return stored === 'granted' || stored === 'denied' ? stored : null;
  } catch {
    return null;
  }
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

  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, consent);
  } catch {
    // Consent still applies for this page even if persistent storage is blocked.
  }

  const gtag = ensureGoogleTagQueue();
  gtag?.(
    'consent',
    'update',
    consent === 'granted' ? GRANTED_ANALYTICS_CONSENT : DENIED_GOOGLE_CONSENT
  );

  if (consent === 'denied') clearGoogleAnalyticsCookies();

  window.dispatchEvent(
    new CustomEvent<AnalyticsConsent>(ANALYTICS_CONSENT_CHANGED_EVENT, {
      detail: consent
    })
  );
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
