'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  AnalyticsConsent,
  DENIED_GOOGLE_CONSENT,
  GRANTED_ANALYTICS_CONSENT,
  ensureGoogleTagQueue,
  readAnalyticsConsent,
  trackPageView
} from '@/lib/analytics';

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? 'G-0ZYHPZ2KM4';

export function Analytics() {
  const pathname = usePathname();
  const initialized = useRef(false);
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
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
    return () => window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, onConsentChanged);
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

  if (consent !== 'granted') return null;

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
