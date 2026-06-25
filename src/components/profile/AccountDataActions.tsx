'use client';

import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useTranslations } from 'next-intl';
import { AlertCircle, Download, Trash2, X } from 'lucide-react';

/**
 * GDPR-rights UI on the profile page.
 *
 * Pairs the data-export and account-delete API endpoints (added in PR #16
 * and #17) with concrete buttons users can actually press.
 *
 * Export: navigates to /api/me/export. The endpoint sets
 * Content-Disposition: attachment so the browser triggers a JSON download
 * directly — no fetch/blob handling needed here.
 *
 * Delete: opens a confirmation modal. The user must type
 * "DELETE-MY-ACCOUNT" literally before the confirm button enables; this
 * matches the literal string the API requires (see /api/me/delete).
 * Norwegian copy explains the UX, the token itself stays English-locked
 * because it's a defense against accidental triggering, not a translatable
 * label.
 */

const CONFIRM_TOKEN = 'DELETE-MY-ACCOUNT';

export function AccountDataActions() {
  const t = useTranslations('AccountDataActions');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleExport() {
    // Trigger browser download via Content-Disposition. Same-origin so no
    // CORS issues; auth cookies travel automatically. Toast confirms the
    // download started — the JSON response itself takes over from there.
    toast.success(t('downloadStarted'), { duration: 3000 });
    window.location.href = '/api/me/export';
  }

  async function handleDelete() {
    if (confirmInput !== CONFIRM_TOKEN) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/me/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: CONFIRM_TOKEN })
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMsg(body.details || body.error || t('deleteFailed'));
        setDeleting(false);
        return;
      }

      // Hard navigation so the auth cookies are re-evaluated everywhere.
      // The deleted user's session token is invalid; landing on / shows
      // the public homepage, not a stale logged-in view.
      window.location.href = '/';
    } catch {
      setErrorMsg(t('networkError'));
      setDeleting(false);
    }
  }

  function closeModal() {
    if (deleting) return;
    setShowDeleteModal(false);
    setConfirmInput('');
    setErrorMsg(null);
  }

  return (
    <>
      <article className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <h2 className="font-semibold">{t('sectionTitle')}</h2>
          <p className="text-sm text-gray-700">
            {t('intro')}{' '}
            <Link href="/personvern" className="font-medium text-forest-800 underline">
              {t('privacyPolicyLink')}
            </Link>{' '}
            {t('introAfterLink')}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            {t('downloadButton')}
          </button>

          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            {t('deleteButton')}
          </button>
        </div>
      </article>

      {showDeleteModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 id="delete-account-title" className="text-lg font-semibold text-red-900">
                {t('modalTitle')}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                disabled={deleting}
                aria-label={t('closeLabel')}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2 rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm text-red-900">
              <p className="font-medium">{t('deletedListIntro')}</p>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>{t('deletedProfile')}</li>
                <li>{t('deletedFindings')}</li>
                <li>{t('deletedForum')}</li>
                <li>{t('deletedInteractions')}</li>
                <li>{t('deletedSubscription')}</li>
              </ul>
              <p className="pt-1 text-xs">
                {t('backupNote')}
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="delete-confirm-input" className="block text-sm font-medium text-gray-800">
                {t('confirmInstruction')}{' '}
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">{CONFIRM_TOKEN}</code>
              </label>
              <input
                id="delete-confirm-input"
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                disabled={deleting}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
                placeholder={CONFIRM_TOKEN}
              />
            </div>

            {errorMsg ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{errorMsg}</p>
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeModal}
                disabled={deleting}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || confirmInput !== CONFIRM_TOKEN}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? t('deleting') : t('confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
