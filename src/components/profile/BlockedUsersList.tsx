'use client';

import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { UserX } from 'lucide-react';
import { useBlockedUsers, useUnblockUser } from '@/lib/hooks/useBlocks';

/**
 * Lets the user see and undo their blocks. Blocking is required by Apple App
 * Review 1.2; being able to undo it is what makes the feature honest — a block
 * the user cannot find again is a trap, not a control.
 *
 * Rendered on the profile page. Hidden entirely when the list is empty, so it
 * does not add noise for the majority who have never blocked anyone.
 */
export function BlockedUsersList() {
  const t = useTranslations('BlockedUsers');
  const { data, isLoading } = useBlockedUsers();
  const unblock = useUnblockUser();

  if (isLoading) return null;
  const blocked = data ?? [];
  if (blocked.length === 0) return null;

  const remove = async (id: string) => {
    try {
      await unblock.mutateAsync(id);
      toast.success(t('unblocked'));
    } catch {
      toast.error(t('failed'));
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3">
      <h2 className="mb-2 flex items-center gap-2 font-semibold text-forest-900">
        <UserX className="h-4 w-4 text-gray-500" /> {t('title')}
      </h2>
      <ul className="space-y-1.5">
        {blocked.map((user) => (
          <li key={user.blocked_id} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-gray-800">{user.username ?? t('unknown')}</span>
            <button
              type="button"
              onClick={() => remove(user.blocked_id)}
              disabled={unblock.isPending}
              className="shrink-0 rounded-md border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 disabled:opacity-60"
            >
              {unblock.isPending ? t('unblocking') : t('unblock')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
