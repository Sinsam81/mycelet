'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

/**
 * Blocking another user. Apple App Review 1.2 requires apps with
 * user-generated content to let users block abusive ones.
 *
 * The HIDING is done by RLS, not here — the select policies on forum_posts and
 * comments exclude authors the current user has blocked (see
 * supabase/migrations/032_block_users_and_content_filter.sql). So every query in
 * the app, including ones written later that forget about blocking, is filtered
 * server-side and cannot be bypassed from the client.
 *
 * These hooks therefore only manage the block list itself, and invalidate the
 * forum queries so the feed reflects a new block immediately.
 */

export interface BlockedUser {
  blocked_id: string;
  created_at: string;
  username: string | null;
  avatar_url: string | null;
}

/** The people the signed-in user has blocked, newest first. */
export function useBlockedUsers() {
  return useQuery({
    queryKey: ['blocked-users'],
    queryFn: async (): Promise<BlockedUser[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('blocked_users')
        .select('blocked_id, created_at, profiles!blocked_users_blocked_id_fkey(username, avatar_url)')
        .order('created_at', { ascending: false });
      if (error) throw error;

      return (data ?? []).map((row) => {
        const profile = (row as { profiles?: { username?: string | null; avatar_url?: string | null } }).profiles;
        return {
          blocked_id: row.blocked_id as string,
          created_at: row.created_at as string,
          username: profile?.username ?? null,
          avatar_url: profile?.avatar_url ?? null
        };
      });
    }
  });
}

/** Ids only — cheap enough to call from list views that need to hide UI affordances. */
export function useBlockedUserIds() {
  const { data } = useBlockedUsers();
  return new Set((data ?? []).map((b) => b.blocked_id));
}

/**
 * Every query whose result depends on the block list.
 *
 * TanStack matches query keys element by element, so ['forum-posts'] does NOT
 * cover ['forum-posts-infinite', …]. The feed and the thread use the infinite
 * hooks, and for a while only the plain keys were listed here: the toast said
 * "blocked" while the blocked content stayed on screen. Keep both forms.
 */
export const BLOCK_INVALIDATION_KEYS: ReadonlyArray<readonly [string]> = [
  ['blocked-users'],
  ['forum-posts'],
  ['forum-posts-infinite'],
  ['forum-post'],
  ['forum-comments'],
  ['forum-comments-infinite']
];

/** The feed, any open thread, and the block list itself all change. */
export function invalidateAfterBlockChange(queryClient: QueryClient) {
  for (const queryKey of BLOCK_INVALIDATION_KEYS) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

function useInvalidateAfterBlockChange() {
  const queryClient = useQueryClient();
  return () => invalidateAfterBlockChange(queryClient);
}

export function useBlockUser() {
  const invalidate = useInvalidateAfterBlockChange();

  return useMutation({
    mutationFn: async (blockedId: string) => {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error('not_authenticated');
      if (user.id === blockedId) throw new Error('cannot_block_self');

      // Blocking twice is not an error from the user's point of view.
      const { error } = await supabase
        .from('blocked_users')
        .upsert({ blocker_id: user.id, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' });
      if (error) throw error;
    },
    onSuccess: invalidate
  });
}

export function useUnblockUser() {
  const invalidate = useInvalidateAfterBlockChange();

  return useMutation({
    mutationFn: async (blockedId: string) => {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error('not_authenticated');

      const { error } = await supabase
        .from('blocked_users')
        .delete()
        .eq('blocker_id', user.id)
        .eq('blocked_id', blockedId);
      if (error) throw error;
    },
    onSuccess: invalidate
  });
}
