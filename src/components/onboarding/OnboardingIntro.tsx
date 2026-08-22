'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/hooks/useAuth';

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

/**
 * Er visningsflaten forstyrret av tastaturet akkurat nå?
 *
 * Denne sjekken er grunnen til at App Review avviste bygg 3 (2.1a, 21.08.2026):
 * anmelderen logget inn (innloggingen LYKTES — serverloggen viser det), og
 * introen monterte seg i samme øyeblikk — mens tastaturet fortsatt holdt
 * WKWebViews visuelle viewport sammenpresset. Det bunnforankrede kortet havnet
 * da under skjermkanten, med knappene utenfor rekkevidde, mens sløret
 * (fixed inset-0 z-[100]) lå igjen over alt og spiste hvert eneste trykk.
 * For anmelderen så det ut som at «Logg inn»-knappen var død. Reprodusert
 * deterministisk i iPhone 17 Pro Max-simulatoren: monter med tastatur oppe →
 * murt app; monter uten → alt vel.
 */
function tastaturForstyrrer(): boolean {
  const vv = window.visualViewport;
  if (!vv) return false;
  return vv.height < window.innerHeight - 80;
}

export function OnboardingIntro() {
  const t = useTranslations('OnboardingIntro');
  const { user, loading } = useAuth();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (loading) return;
    let skalVises = false;
    try {
      // The app-intro is for USERS: logged-out visitors land on the marketing
      // page, where a "welcome to the app" modal on top of the hero is noise.
      // New registrants see it on their first logged-in visit instead.
      skalVises = Boolean(user) && window.localStorage.getItem(STORAGE_KEY) !== '1';
    } catch {
      skalVises = false;
    }
    if (!skalVises) {
      // Anon or already onboarded — let listeners (cookie notice) proceed.
      window.dispatchEvent(new Event(ONBOARDING_DONE_EVENT));
      return;
    }

    // ALDRI monter sløret mens tastaturet forstyrrer viewporten — se
    // tastaturForstyrrer(). Typisk øyeblikk: brukeren trykket nettopp
    // «Logg inn» og tastaturet er på vei ned. Vent til flaten er stabil.
    if (!tastaturForstyrrer()) {
      setVisible(true);
      return;
    }
    const vv = window.visualViewport;
    const provIgjen = () => {
      if (!tastaturForstyrrer()) {
        setVisible(true);
        vv?.removeEventListener('resize', provIgjen);
      }
    };
    vv?.addEventListener('resize', provIgjen);
    // Sikkerhetsnett: skulle resize-hendelsen utebli (WebKit har overrasket
    // før), vis introen når flaten uansett har fått roet seg.
    const frist = window.setTimeout(() => {
      vv?.removeEventListener('resize', provIgjen);
      setVisible(true);
    }, 2500);
    return () => {
      vv?.removeEventListener('resize', provIgjen);
      window.clearTimeout(frist);
    };
  }, [user, loading]);

  if (!visible) return null;

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  function finish() {
    markDone();
    setVisible(false);
  }

  return (
    // Sentrert (ikke bunnforankret) med rullbar overflate og lukking ved trykk
    // på sløret: tre uavhengige garantier for at introen aldri kan sperre
    // appen selv om viewporten skulle stå forskjøvet — se tastaturForstyrrer().
    // Sløret er skippbart av design, så et trykk utenfor kortet betyr «gå videre».
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-forest-950/70 px-4 py-8 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) finish();
      }}
    >
      <div className="max-h-[calc(100dvh-4rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-card">
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
