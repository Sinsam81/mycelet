'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface DeletionWarning {
  warnedAt: string;
  scheduledDeletionAt: string;
}

/**
 * Top-pinned retention banner shown when the logged-in user has a pending
 * deletion warning. Lets them cancel the scheduled deletion in one click
 * by hitting /api/me/extend-retention.
 *
 * Polls /api/me/deletion-warning once on mount. If no warning, renders
 * nothing — no flash, no layout shift on the common path. The endpoint
 * returns 401 for anonymous traffic; we silently treat that as "no
 * warning" so unauthenticated pages don't error.
 *
 * Mounted once in the root layout via Providers. Stacks above the cookie
 * notice (different vertical anchor) so a brand-new user could in theory
 * see both at once.
 */
export function RetentionWarningBanner() {
  const [warning, setWarning] = useState<DeletionWarning | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/me/deletion-warning', { cache: 'no-store' });
        if (!response.ok) return; // 401 or 5xx — fail silent
        const data = await response.json();
        if (cancelled) return;
        if (data?.warning) setWarning(data.warning);
      } catch {
        // Network blip during nav — banner stays hidden, nothing to do.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const cancelDeletion = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/me/extend-retention', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? 'Kunne ikke avbryte sletting');
      }
      toast.success(data?.message ?? 'Sletting av kontoen din er avbrutt.');
      setWarning(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kunne ikke avbryte sletting');
    } finally {
      setLoading(false);
    }
  };

  if (!warning || dismissed) return null;

  const scheduled = new Date(warning.scheduledDeletionAt);
  const formattedDate = scheduled.toLocaleDateString('nb-NO', {
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
            Kontoen din er planlagt slettet {formattedDate} ({daysRemaining} {daysRemaining === 1 ? 'dag' : 'dager'} igjen).
          </p>
          <p className="text-amber-800">
            Vi har ikke sett deg på en stund. Klikk &laquo;Behold konto&raquo; så avbryter vi slettingen.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void cancelDeletion()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
          Behold konto
        </button>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Skjul varsel midlertidig"
          className="rounded-md p-1 text-amber-600 hover:bg-amber-100 hover:text-amber-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
