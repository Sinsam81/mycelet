'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Three-screen first-run intro. Shows once (localStorage-versioned), can be
 * skipped at any point, and announces completion via the
 * `mycelet:onboarding-done` window event so the cookie notice can wait its
 * turn instead of being the first thing a new user ever sees.
 */
const STORAGE_KEY = 'mycelet:onboarding-v1';
export const ONBOARDING_DONE_EVENT = 'mycelet:onboarding-done';

const STEPS = [
  { emoji: '🍄', titleKey: 'step1Title', bodyKey: 'step1Body' },
  { emoji: '📍', titleKey: 'step2Title', bodyKey: 'step2Body' },
  { emoji: '🛡️', titleKey: 'step3Title', bodyKey: 'step3Body' }
] as const;

function markDone() {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Private mode — the intro will simply show again next session.
  }
  window.dispatchEvent(new Event(ONBOARDING_DONE_EVENT));
}

export function OnboardingIntro() {
  const t = useTranslations('OnboardingIntro');
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== '1') {
        setVisible(true);
      } else {
        // Already onboarded — let listeners (cookie notice) proceed at once.
        window.dispatchEvent(new Event(ONBOARDING_DONE_EVENT));
      }
    } catch {
      window.dispatchEvent(new Event(ONBOARDING_DONE_EVENT));
    }
  }, []);

  if (!visible) return null;

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  function finish() {
    markDone();
    setVisible(false);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-forest-950/70 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-12 backdrop-blur-sm sm:items-center sm:pb-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-card">
        <div className="text-5xl" aria-hidden="true">
          {current.emoji}
        </div>
        <h2 className="mt-4 font-serif text-2xl font-semibold text-forest-950">{t(current.titleKey)}</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">{t(current.bodyKey)}</p>

        <div className="mt-5 flex items-center gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-forest-700' : 'w-1.5 bg-gray-300'}`}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="rounded-full px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            {t('skip')}
          </button>
          <button
            type="button"
            onClick={() => (last ? finish() : setStep((s) => s + 1))}
            className="rounded-full bg-forest-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-forest-700"
          >
            {last ? t('getStarted') : t('next')}
          </button>
        </div>
      </div>
    </div>
  );
}
