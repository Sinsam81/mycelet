'use client';

import { useTranslations } from 'next-intl';
import { getForumBadge, type ForumBadge } from '@/lib/utils/forumBadge';
import type { ForumProfile } from '@/types/forum';

/**
 * Rollemerkene i forumet, oversatt.
 *
 * Merkene rendres tre steder (PostCard, CommentList, PostDetail) og hentet
 * tidligere norske strengliteraler rett ut av forumBadge.ts. Denne hooken
 * samler oppslaget ett sted så alle tre får samme språk.
 */
export function useForumBadge(): (profile?: ForumProfile | null) => ForumBadge | null {
  const t = useTranslations('ForumBadge');
  const labels = {
    expert: t('expert'),
    community: t('community'),
    moderator: t('moderator'),
    trusted: t('trusted')
  };
  return (profile) => getForumBadge(profile, labels);
}
