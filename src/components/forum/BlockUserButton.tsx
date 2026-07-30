'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { UserX } from 'lucide-react';
import { useBlockUser } from '@/lib/hooks/useBlocks';

interface BlockUserButtonProps {
  /** The author being blocked. */
  userId: string;
  /** Shown in the confirmation so the user knows who they are blocking. */
  displayName: string;
  /** Hidden entirely when the author is the signed-in user. */
  currentUserId?: string | null;
}

/**
 * Block the author of a post or comment. Apple App Review 1.2 requires this for
 * apps with user-generated content.
 *
 * Confirms first, because blocking is invisible to the person blocked and easy
 * to hit by accident next to the report button. The hiding itself is enforced by
 * RLS — see src/lib/hooks/useBlocks.ts.
 */
export function BlockUserButton({ userId, displayName, currentUserId }: BlockUserButtonProps) {
  const t = useTranslations('BlockUser');
  const [confirming, setConfirming] = useState(false);
  const blockUser = useBlockUser();

  // Nobody needs to block themselves, and the database rejects it anyway.
  if (currentUserId && currentUserId === userId) return null;

  const block = async () => {
    try {
      await blockUser.mutateAsync(userId);
      toast.success(t('blocked', { name: displayName }));
      setConfirming(false);
    } catch {
      toast.error(t('failed'));
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 hover:underline"
      >
        <UserX className="h-3.5 w-3.5" /> {t('block')}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
      <p>{t('confirm', { name: displayName })}</p>
      <p className="mt-1 text-gray-500">{t('explain')}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={block}
          disabled={blockUser.isPending}
          className="rounded-md bg-gray-900 px-2.5 py-1 font-medium text-white disabled:opacity-60"
        >
          {blockUser.isPending ? t('blocking') : t('confirmYes')}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md border border-gray-300 px-2.5 py-1 font-medium text-gray-700"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}
