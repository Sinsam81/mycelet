'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/hooks/useAuth';
import { intlLocale } from '@/lib/utils/intl-locale';

interface DeletionWarning {
  warnedAt: string;
  scheduledDeletionAt: string;
}

/**
 * Top-pinned retention banner shown when the logged-in user has a pending
 * deletion warning. Lets them cancel the scheduled deletion in one click
 * by hitting /api/me/extend-retention.
 *
 * Asks /api/me/deletion-warning once per logged-in user. If no warning,
 * renders nothing — no flash, no layout shift on the common path.
 *
 * ⚠️ ONLY WHEN SOMEONE IS LOGGED IN. This component is mounted on every page
 * (root layout, via Providers), and it used to ask on mount no matter who was
 * looking. For a logged-out visitor — /soppforhold, the species library, the
 * calendar, the login page — that was one serverless call per page load that
 * could only answer 401, plus a red «Failed to load resource: 401» in the
 * console of every anonymous visit. The endpoint still answers 401 for
 * anonymous traffic and that is still treated as «no warning»: the browser's
 * idea of the session can be staler than the server's.
 *
 * The answer is kept together with the user it belongs to, so it disappears
 * when that user logs out and is asked for again when someone logs in —
 * Providers is never remounted by client-side navigation.
 *
 * Stacks above the cookie notice (different vertical anchor) so a brand-new
 * user could in theory see both at once.
 */
export function RetentionWarningBanner() {
  const t = useTranslations('RetentionWarningBanner');
  const locale = useLocale();
  const { user } = useAuth();
  // The id, not the user object: Supabase hands out a new object on every
  // token refresh, and that must not ask again.
  const userId = user?.id ?? null;
  const [fetched, setFetched] = useState<{ userId: string; warning: DeletionWarning } | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  useEffect(() => {
    // Logged out, or the session is not known yet: nothing to ask about.
    if (!userId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/me/deletion-warning', { cache: 'no-store' });
        if (!response.ok) return; // 401 or 5xx — fail silent
        const data = await response.json();
        if (cancelled) return;
        if (data?.warning) setFetched({ userId, warning: data.warning });
      } catch {
        // Network blip during nav — banner stays hidden, nothing to do.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Only the warning that belongs to whoever is logged in right now.
  const warning = fetched && fetched.userId === userId ? fetched.warning : null;
  const dismissed = dismissedFor !== null && dismissedFor === userId;

  const cancelDeletion = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/me/extend-retention', { method: 'POST' });
      // Et svar som ikke er JSON (plattformens egen feilside) er også en feil,
      // men skal ikke vises som «Unexpected token <».
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        // Rutens feiltekster er på leserens språk (apiFeil og rate-limit).
        toast.error(data?.error ?? t('cancelError'));
        return;
      }
      // Også bekreftelsen kommer oversatt fra ruta, som vet om det faktisk
      // fantes en planlagt sletting å avbryte.
      toast.success(data?.message ?? t('cancelSuccess'));
      setFetched(null);
    } catch (err) {
      // Nettverksfeil. Aldri err.message: det er nettleserens egen engelske
      // tekst («Load failed»), ikke noe vi har skrevet.
      toast.error(t('cancelError'));
    } finally {
      setLoading(false);
    }
  };

  if (!warning || dismissed) return null;

  const scheduled = new Date(warning.scheduledDeletionAt);
  const formattedDate = scheduled.toLocaleDateString(intlLocale(locale), {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  const daysRemaining = Math.max(0, Math.ceil((scheduled.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <div
      role="alert"
      aria-live="polite"
      className="sticky top-0 z-40 border-b border-amber-200 bg-amber-50"
    >
      <div className="mx-auto flex max-w-5xl items-start gap-3 px-4 py-3 sm:px-6">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />

        <div className="flex-1 space-y-1 text-sm text-amber-900">
          <p className="font-medium">
            {t('scheduledDeletion', { date: formattedDate, count: daysRemaining })}
          </p>
          <p className="text-amber-800">
            {t('inactivityNotice')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void cancelDeletion()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
          {t('keepAccount')}
        </button>

        <button
          type="button"
          onClick={() => setDismissedFor(userId)}
          aria-label={t('dismissAriaLabel')}
          className="rounded-md p-1 text-amber-600 hover:bg-amber-100 hover:text-amber-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
