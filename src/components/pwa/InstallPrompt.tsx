'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ANALYTICS_CONSENT_CHANGED_EVENT, readAnalyticsConsent } from '@/lib/analytics';

const DISMISS_KEY = 'mycelet:install-prompt-dismissed-v1';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function rememberDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch (err) {
    console.debug('install-prompt: could not persist dismissal', err);
  }
}

/**
 * Android/Chrome "Install app" banner. Captures the `beforeinstallprompt`
 * event — which only fires on installable web (never inside the Capacitor
 * native shell, never on iOS Safari) — and offers a one-tap install. Hidden
 * once the app runs standalone (already installed) or after the user dismisses
 * it. Renders nothing where the event never fires, so it is a safe no-op.
 */
export function InstallPrompt() {
  const t = useTranslations('InstallPrompt');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      // Storage blocked — treat as not dismissed.
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      // Don't fight the cookie-consent card for the bottom of the screen:
      // wait until the visitor has answered it before showing the banner.
      if (readAnalyticsConsent() !== null) {
        setVisible(true);
        return;
      }
      const onConsentAnswered = () => {
        setVisible(true);
        window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, onConsentAnswered);
      };
      window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, onConsentAnswered);
    };
    const onInstalled = () => setVisible(false);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    rememberDismissed();
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
    rememberDismissed();
  };

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-forest-200 bg-white p-3 shadow-card">
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-forest-900">{t('title')}</p>
          <p className="text-xs text-gray-600">{t('subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-full bg-forest-700 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-forest-800"
        >
          {t('install')}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('close')}
          className="shrink-0 rounded-full p-1 text-gray-400 transition hover:text-gray-700"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
