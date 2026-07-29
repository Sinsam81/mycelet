'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  ANALYTICS_CONSENT_KEY,
  AnalyticsConsent,
  DENIED_GOOGLE_CONSENT,
  GA_MEASUREMENT_ID,
  GRANTED_ANALYTICS_CONSENT,
  ensureGoogleTagQueue,
  readAnalyticsConsent,
  trackPageView
} from '@/lib/analytics';

const MEASUREMENT_ID = GA_MEASUREMENT_ID;

// Only report from the real production site — localhost, `next start` and
// Vercel preview deploys would otherwise pollute the live GA4 property the
// moment a tester accepts the banner.
function isProductionHost() {
  return typeof window !== 'undefined' && /(^|\.)mycelet\.com$/.test(window.location.hostname);
}

export function Analytics() {
  const pathname = usePathname();
  const initialized = useRef(false);
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!isProductionHost()) return;
    setEnabled(true);
    // Basic consent mode: queue a denied default locally, but do not load the
    // Google script or send any network request before explicit consent.
    ensureGoogleTagQueue()?.('consent', 'default', {
      ...DENIED_GOOGLE_CONSENT,
      wait_for_update: 500
    });
    setConsent(readAnalyticsConsent());

    const onConsentChanged = (event: Event) => {
      setConsent((event as CustomEvent<AnalyticsConsent>).detail);
    };
    window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, onConsentChanged);
    // A withdrawal in another tab must also stop this tab's loaded tag.
    const onStorage = (event: StorageEvent) => {
      if (event.key === ANALYTICS_CONSENT_KEY && event.newValue === 'denied') {
        (window as unknown as Record<string, unknown>)[`ga-disable-${MEASUREMENT_ID}`] = true;
        setConsent('denied');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, onConsentChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    if (consent !== 'denied') return;
    ensureGoogleTagQueue()?.('consent', 'update', DENIED_GOOGLE_CONSENT);
    initialized.current = false;
    setReady(false);
  }, [consent]);

  const initializeAnalytics = useCallback(() => {
    if (initialized.current || consent !== 'granted') return;

    const gtag = ensureGoogleTagQueue();
    if (!gtag) return;

    gtag('consent', 'update', GRANTED_ANALYTICS_CONSENT);
    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: 33_696_000,
      cookie_update: false,
      cookie_flags: 'SameSite=Lax;Secure'
    });
    initialized.current = true;
    setReady(true);
  }, [consent]);

  useEffect(() => {
    if (!ready || consent !== 'granted') return;
    trackPageView(pathname);
  }, [consent, pathname, ready]);

  if (!enabled || consent !== 'granted') return null;

  return (
    <Script
      id="mycelet-ga4"
      src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`}
      strategy="afterInteractive"
      onLoad={initializeAnalytics}
      onReady={initializeAnalytics}
    />
  );
}
