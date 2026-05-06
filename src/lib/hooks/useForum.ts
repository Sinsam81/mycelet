'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import {
  ForumCategory,
  ForumComment,
  ForumPost,
  ForumPostDetail,
  ForumReport,
  ForumSort,
  ReportReason,
  UserFindingOption
} from '@/types/forum';

function normalizeImages(value: unknown) {
  return Array.isArray(value) ? value : [];
}

const FORUM_PAGE_SIZE = 15;
const COMMENTS_PAGE_SIZE = 30;

export function useForumPosts(sort: ForumSort = 'newest', category: ForumCategory = null) {
  return useQuery({
    queryKey: ['forum-posts', sort, category],
    queryFn: async () => {
      const supabase = createClient();

      let query = supabase
        .from('forum_posts')
        .select(
          'id,user_id,title,content,category,images,likes_count,comments_count,created_at,profiles:user_id(username,avatar_url,display_name,verified_foragers(role,badge_label)),finding:finding_id(id,species_id,species_name_override,is_zone_finding,zone_label,zone_precision_km,mushroom_species:species_id(norwegian_name))'
        )
        .eq('is_hidden', false);

      if (category) query = query.eq('category', category);

      switch (sort) {
        case 'popular':
          query = query.order('likes_count', { ascending: false }).order('created_at', { ascending: false });
          break;
        case 'unanswered':
          query = query.eq('category', 'question').eq('comments_count', 0).order('created_at', { ascending: false });
          break;
        default:
          query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query.limit(30);
      if (error) throw error;

      // Supabase types FK joins as arrays even when the relationship is
      // 1:1 (here, finding:finding_id and profiles:user_id). The runtime
      // shape is correct; the cast through `unknown` is the standard way
      // to bypass the comparability check, per the TS error suggestion.
      return (data ?? []).map((post) => ({ ...post, images: normalizeImages(post.images) })) as unknown as ForumPost[];
    }
  });
}

export function useForumPostsInfinite(sort: ForumSort = 'newest', category: ForumCategory = null) {
  return useInfiniteQuery({
    queryKey: ['forum-posts-infinite', sort, category],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const supabase = createClient();
      const from = Number(pageParam);
      const to = from + FORUM_PAGE_SIZE - 1;

      let query = supabase
        .from('forum_posts')
        .select(
          'id,user_id,title,content,category,images,likes_count,comments_count,created_at,profiles:user_id(username,avatar_url,display_name,verified_foragers(role,badge_label)),finding:finding_id(id,species_id,species_name_override,is_zone_finding,zone_label,zone_precision_km,mushroom_species:species_id(norwegian_name))'
        )
        .eq('is_hidden', false);

      if (category) query = query.eq('category', category);

      switch (sort) {
        case 'popular':
          query = query.order('likes_count', { ascending: false }).order('created_at', { ascending: false });
          break;
        case 'unanswered':
          query = query.eq('category', 'question').eq('comments_count', 0).order('created_at', { ascending: false });
          break;
        default:
          query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query.range(from, to);
      if (error) throw error;

      // Same Supabase 1:1-as-array typing quirk; see useForumPosts above.
      const items = (data ?? []).map((post) => ({ ...post, images: normalizeImages(post.images) })) as unknown as ForumPost[];

      return {
        items,
        nextOffset: items.length === FORUM_PAGE_SIZE ? from + FORUM_PAGE_SIZE : null
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset
  });
}

export function useForumPost(postId: string) {
  return useQuery({
    queryKey: ['forum-post', postId],
    enabled: Boolean(postId),
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      const { data: post, error: postError } = await supabase
        .from('forum_posts')
        .select(
          'id,user_id,title,content,category,images,likes_count,comments_count,created_at,profiles:user_id(username,avatar_url,display_name,verified_foragers(role,badge_label)),finding:finding_id(id,species_id,species_name_override,is_zone_finding,zone_label,zone_precision_km,mushroom_species:species_id(norwegian_name))'
        )
        .eq('id', postId)
        .maybeSingle();

      if (postError) throw postError;
      if (!post) throw new Error('Innlegg ikke funnet');

      let isLiked = false;
      if (user) {
        const { data: likeRow } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .maybeSingle();
        isLiked = Boolean(likeRow);
      }

      // Supabase 1:1-as-array typing quirk (see useForumPosts above).
      return {
        ...post,
        images: normalizeImages(post.images),
        isLiked,
        isOwner: user?.id === post.user_id
      } as unknown as ForumPostDetail;
    }
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (post: {
      title: string;
      content: string;
      category: 'find' | 'question' | 'tip' | 'discussion';
      images?: Array<{ url: string; thumbnail_url?: string; caption?: string }>;
      findingId?: string | null;
    }) => {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Ikke innlogget');

      const { data, error } = await supabase
        .from('forum_posts')
        .insert({
          user_id: user.id,
          title: post.title,
          content: post.content,
          category: post.category,
          images: post.images ?? [],
          finding_id: post.findingId ?? null
        })
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forum-posts'] });
      queryClient.invalidateQueries({ queryKey: ['forum-posts-infinite'] });
    }
  });
}

export function useUpdatePost(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { title: string; content: string; category: 'find' | 'question' | 'tip' | 'discussion' }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('forum_posts')
        .update({
          title: payload.title,
          content: payload.content,
          category: payload.category
        })
        .eq('id', postId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forum-post', postId] });
      queryClient.invalidateQueries({ queryKey: ['forum-posts'] });
      queryClient.invalidateQueries({ queryKey: ['forum-posts-infinite'] });
    }
  });
}

export function useDeletePost(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const { error } = await supabase.from('forum_posts').delete().eq('id', postId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forum-posts'] });
      queryClient.invalidateQueries({ queryKey: ['forum-posts-infinite'] });
    }
  });
}

export function useToggleLike(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (isLiked: boolean) => {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Ikke innlogget');

      if (isLiked) {
        const { error } = await supabase.from('post_likes').delete().eq('user_id', user.id).eq('post_id', postId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('post_likes').insert({ user_id: user.id, post_id: postId });
        if (error) throw error;
      }

      return !isLiked;
    },
    onMutate: async (isLiked) => {
      await queryClient.cancelQueries({ queryKey: ['forum-post', postId] });
      const prevDetail = queryClient.getQueryData<ForumPostDetail>(['forum-post', postId]);

      if (prevDetail) {
        queryClient.setQueryData<ForumPostDetail>(['forum-post', postId], {
          ...prevDetail,
          isLiked: !isLiked,
          likes_count: Math.max(0, prevDetail.likes_count + (isLiked ? -1 : 1))
        });
      }

      queryClient.setQueriesData({ queryKey: ['forum-posts'] }, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((post: any) =>
          post.id === postId ? { ...post, likes_count: Math.max(0, (post.likes_count ?? 0) + (isLiked ? -1 : 1)) } : post
        );
      });

      return { prevDetail };
    },
    onError: (_err, _variables, context) => {
      if (context?.prevDetail) {
        queryClient.setQueryData(['forum-post', postId], context.prevDetail);
      }
      queryClient.invalidateQueries({ queryKey: ['forum-posts'] });
      queryClient.invalidateQueries({ queryKey: ['forum-posts-infinite'] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forum-posts'] });
      queryClient.invalidateQueries({ queryKey: ['forum-posts-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['forum-post', postId] });
    }
  });
}

export function useComments(postId: string) {
  return useQuery({
    queryKey: ['forum-comments', postId],
    enabled: Boolean(postId),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('comments')
        .select('id,post_id,user_id,parent_comment_id,content,created_at,profiles:user_id(username,avatar_url,display_name,verified_foragers(role,badge_label))')
        .eq('post_id', postId)
        .eq('is_hidden', false)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as ForumComment[];
    }
  });
}

export function useCommentsInfinite(postId: string) {
  return useInfiniteQuery({
    queryKey: ['forum-comments-infinite', postId],
    enabled: Boolean(postId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const supabase = createClient();
      const from = Number(pageParam);
      const to = from + COMMENTS_PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('comments')
        .select('id,post_id,user_id,parent_comment_id,content,created_at,profiles:user_id(username,avatar_url,display_name,verified_foragers(role,badge_label))')
        .eq('post_id', postId)
        .eq('is_hidden', false)
        .order('created_at', { ascending: true })
        .range(from, to);

      if (error) throw error;
      const items = (data ?? []) as ForumComment[];
      return {
        items,
        nextOffset: items.length === COMMENTS_PAGE_SIZE ? from + COMMENTS_PAGE_SIZE : null
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset
  });
}

export function useCreateComment(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { content: string; parentCommentId?: string | null }) => {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Ikke innlogget');

      const { error } = await supabase.from('comments').insert({
        post_id: postId,
        user_id: user.id,
        content: payload.content,
        parent_comment_id: payload.parentCommentId ?? null
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forum-comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['forum-comments-infinite', postId] });
      queryClient.invalidateQueries({ queryKey: ['forum-post', postId] });
      queryClient.invalidateQueries({ queryKey: ['forum-posts'] });
      queryClient.invalidateQueries({ queryKey: ['forum-posts-infinite'] });
    }
  });
}

export function useUpdateComment(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { commentId: string; content: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from('comments').update({ content: payload.content }).eq('id', payload.commentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forum-comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['forum-comments-infinite', postId] });
    }
  });
}

export function useDeleteComment(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commentId: string) => {
      const supabase = createClient();
      const { error } = await supabase.from('comments').delete().eq('id', commentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forum-comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['forum-comments-infinite', postId] });
      queryClient.invalidateQueries({ queryKey: ['forum-post', postId] });
      queryClient.invalidateQueries({ queryKey: ['forum-posts'] });
      queryClient.invalidateQueries({ queryKey: ['forum-posts-infinite'] });
    }
  });
}

export function useReportContent() {
  return useMutation({
    mutationFn: async (payload: {
      postId?: string;
      commentId?: string;
      findingId?: string;
      reason: ReportReason;
      description?: string;
    }) => {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Ikke innlogget');

      const { error } = await supabase.from('reports').insert({
        reporter_id: user.id,
        post_id: payload.postId ?? null,
        comment_id: payload.commentId ?? null,
        finding_id: payload.findingId ?? null,
        reason: payload.reason,
        description: payload.description ?? null
      });

      if (error) throw error;
    }
  });
}

export function useMyFindings() {
  return useQuery({
    queryKey: ['my-findings-options'],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) return [] as UserFindingOption[];

      const { data, error } = await supabase
        .from('findings')
        .select('id,species_id,species_name_override,found_at,is_zone_finding,zone_label,zone_precision_km,mushroom_species:species_id(norwegian_name)')
        .eq('user_id', user.id)
        .order('found_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      return (data ?? []) as UserFindingOption[];
    }
  });
}

export function useMyReports() {
  return useQuery({
    queryKey: ['my-reports'],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) return [] as ForumReport[];

      const { data, error } = await supabase
        .from('reports')
        .select('id,reason,description,status,created_at,post_id,comment_id,finding_id')
        .eq('reporter_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as ForumReport[];
    }
  });
}

export function useModerationReports() {
  return useQuery({
    queryKey: ['moderation-reports'],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('reports')
        .select('id,reason,description,status,created_at,post_id,comment_id,finding_id')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data ?? []) as ForumReport[];
    }
  });
}

export function useSetReportStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { reportId: string; status: 'reviewed' | 'resolved' | 'dismissed' }) => {
      const supabase = createClient();
      const { error } = await supabase.from('reports').update({ status: payload.status }).eq('id', payload.reportId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moderation-reports'] });
      queryClient.invalidateQueries({ queryKey: ['my-reports'] });
    }
  });
}
