'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cookie, X } from 'lucide-react';

/**
 * Bottom-pinned informational notice about cookies.
 *
 * Mycelet only uses strictly-necessary cookies (Supabase auth session,
 * Stripe checkout). Per ePrivacy + GDPR, strictly-necessary cookies do not
 * require opt-in consent — but users still have a right to be informed.
 * This is a one-time notice, not a consent dialog. If we ever add analytics
 * or marketing cookies, this needs to be replaced with a proper consent UI.
 *
 * Dismissal is persisted in localStorage (not a cookie — avoids the irony
 * of a "we use cookies" cookie). The localStorage key is namespaced so
 * unrelated entries don't collide.
 */
const STORAGE_KEY = 'mycelet:cookie-notice-dismissed-v1';

export function CookieNotice() {
  // Default to true so we don't flash the banner before reading localStorage.
  // SSR will render nothing; client mount checks storage on next paint.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== '1') {
        setDismissed(false);
      }
    } catch {
      // Private mode / disabled storage — show the banner once per session.
      setDismissed(false);
    }
  }, []);

  function handleDismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Ignore storage failures; we still want the banner to disappear in
      // the current view.
    }
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-labelledby="cookie-notice-title"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6"
    >
      <div className="mx-auto flex max-w-3xl items-start gap-3 rounded-xl border border-forest-200 bg-white p-4 shadow-lg">
        <Cookie aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-forest-700" />

        <div className="flex-1 space-y-1 text-sm text-gray-800">
          <p id="cookie-notice-title" className="font-medium text-gray-900">
            Vi bruker kun nødvendige informasjonskapsler
          </p>
          <p>
            Mycelet setter cookies for innlogging og betaling. Vi har ingen analyse-, sporings- eller markedsførings-cookies.{' '}
            <Link href="/personvern" className="font-medium text-forest-700 underline">
              Les personvernerklæringen
            </Link>
            .
          </p>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Lukk informasjonsboks"
          className="rounded-md bg-forest-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-forest-800 focus:outline-none focus:ring-2 focus:ring-forest-400"
        >
          Forstått
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Lukk"
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 sm:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
