'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cookie } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  ANALYTICS_CONSENT_REQUEST_EVENT,
  readAnalyticsConsent,
  updateAnalyticsConsent
} from '@/lib/analytics';

/**
 * Consent dialog for optional analytics. Google Analytics is not loaded until
 * the user explicitly accepts. Necessary Supabase/Stripe cookies are described
 * here but are not part of the choice because the service cannot work without
 * them.
 */
const ONBOARDING_KEY = 'mycelet:onboarding-v1';
const ONBOARDING_DONE_EVENT = 'mycelet:onboarding-done';

export function CookieNotice() {
  const t = useTranslations('CookieNotice');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onPreferenceRequest = () => setVisible(true);
    window.addEventListener(ANALYTICS_CONSENT_REQUEST_EVENT, onPreferenceRequest);

    let show: (() => void) | null = null;
    try {
      if (readAnalyticsConsent() !== null) {
        return () => window.removeEventListener(ANALYTICS_CONSENT_REQUEST_EVENT, onPreferenceRequest);
      }

      show = () => setVisible(true);
      if (window.localStorage.getItem(ONBOARDING_KEY) === '1') {
        show();
        return () => window.removeEventListener(ANALYTICS_CONSENT_REQUEST_EVENT, onPreferenceRequest);
      }
    } catch {
      setVisible(true);
      return () => window.removeEventListener(ANALYTICS_CONSENT_REQUEST_EVENT, onPreferenceRequest);
    }

    const onDone = () => show?.();
    window.addEventListener(ONBOARDING_DONE_EVENT, onDone);
    return () => {
      window.removeEventListener(ONBOARDING_DONE_EVENT, onDone);
      window.removeEventListener(ANALYTICS_CONSENT_REQUEST_EVENT, onPreferenceRequest);
    };
  }, []);

  function handleChoice(consent: 'granted' | 'denied') {
    updateAnalyticsConsent(consent);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-labelledby="cookie-notice-title"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6"
    >
      <div className="mx-auto flex max-w-3xl items-start gap-3 rounded-xl border border-forest-200 bg-white p-4 shadow-lg">
        <Cookie aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-forest-700" />

        <div className="flex-1 space-y-2 text-sm text-gray-800">
          <p id="cookie-notice-title" className="font-medium text-gray-900">
            {t('title')}
          </p>
          <p>
            {t('description')}{' '}
            <Link href="/personvern" className="font-medium text-forest-700 underline">
              {t('privacyLink')}
            </Link>
            .
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleChoice('denied')}
              className="min-w-32 rounded-md border border-forest-700 bg-white px-3 py-2 text-sm font-medium text-forest-800 hover:bg-forest-50 focus:outline-none focus:ring-2 focus:ring-forest-400"
            >
              {t('reject')}
            </button>
            <button
              type="button"
              onClick={() => handleChoice('granted')}
              className="min-w-32 rounded-md border border-forest-700 bg-white px-3 py-2 text-sm font-medium text-forest-800 hover:bg-forest-50 focus:outline-none focus:ring-2 focus:ring-forest-400"
            >
              {t('accept')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
