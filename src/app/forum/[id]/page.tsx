'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { CommentInput } from '@/components/forum/CommentInput';
import { CommentList } from '@/components/forum/CommentList';
import { PostDetail } from '@/components/forum/PostDetail';
import {
  useCommentsInfinite,
  useCreateComment,
  useDeleteComment,
  useDeletePost,
  useForumPost,
  useReportContent,
  useToggleLike,
  useUpdateComment,
  useUpdatePost
} from '@/lib/hooks/useForum';
import { createClient } from '@/lib/supabase/client';

interface ForumPostDetailPageProps {
  params: { id: string };
}

export default function ForumPostDetailPage({ params }: ForumPostDetailPageProps) {
  const router = useRouter();
  const postId = params.id;
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);

  const { data: post, isLoading: postLoading, error: postError } = useForumPost(postId);
  const {
    data: commentsPages,
    isLoading: commentsLoading,
    error: commentsError,
    fetchNextPage: fetchNextComments,
    hasNextPage: hasNextComments,
    isFetchingNextPage: commentsFetchingNext
  } = useCommentsInfinite(postId);
  const toggleLike = useToggleLike(postId);
  const createComment = useCreateComment(postId);
  const updateComment = useUpdateComment(postId);
  const deleteComment = useDeleteComment(postId);
  const updatePost = useUpdatePost(postId);
  const deletePost = useDeletePost(postId);
  const reportContent = useReportContent();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const comments = useMemo(() => commentsPages?.pages.flatMap((page) => page.items) ?? [], [commentsPages]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel(`comments-live-${postId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['forum-comments', postId] });
          queryClient.invalidateQueries({ queryKey: ['forum-comments-infinite', postId] });
          queryClient.invalidateQueries({ queryKey: ['forum-post', postId] });
          queryClient.invalidateQueries({ queryKey: ['forum-posts'] });
          queryClient.invalidateQueries({ queryKey: ['forum-posts-infinite'] });
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes', filter: `post_id=eq.${postId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['forum-post', postId] });
        queryClient.invalidateQueries({ queryKey: ['forum-posts'] });
        queryClient.invalidateQueries({ queryKey: ['forum-posts-infinite'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_posts', filter: `id=eq.${postId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['forum-post', postId] });
        queryClient.invalidateQueries({ queryKey: ['forum-posts'] });
        queryClient.invalidateQueries({ queryKey: ['forum-posts-infinite'] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [postId, queryClient, supabase]);

  return (
    <PageWrapper>
      <section className="space-y-3">
        <button type="button" onClick={() => router.push('/forum')} className="inline-flex items-center gap-1 text-sm font-medium text-forest-800">
          <ArrowLeft className="h-4 w-4" /> Tilbake til forum
        </button>

        {postLoading ? <p className="text-sm text-gray-700">Laster innlegg...</p> : null}
        {postError ? <p className="text-sm text-red-600">Kunne ikke hente innlegg.</p> : null}

        {post ? (
          <PostDetail
            post={post}
            onToggleLike={() => toggleLike.mutate(post.isLiked)}
            likeLoading={toggleLike.isPending}
            onEdit={(payload) => updatePost.mutateAsync(payload)}
            onDelete={async () => {
              await deletePost.mutateAsync();
              router.push('/forum');
            }}
            onReport={(payload) =>
              reportContent.mutateAsync({
                postId,
                reason: payload.reason,
                description: payload.description
              })
            }
          />
        ) : null}

        <div className="rounded-xl border border-gray-200 bg-cream-dark p-3">
          <h2 className="mb-2 text-lg font-semibold">Kommentarer</h2>
          {commentsLoading ? <p className="text-sm text-gray-700">Laster kommentarer...</p> : null}
          {commentsError ? <p className="text-sm text-red-600">Kunne ikke hente kommentarer.</p> : null}
          {comments.length > 0 ? (
            <CommentList
              comments={comments}
              currentUserId={currentUserId}
              onReply={(parentCommentId, content) => createComment.mutateAsync({ content, parentCommentId })}
              onEditComment={(commentId, content) => updateComment.mutateAsync({ commentId, content })}
              onDeleteComment={(commentId) => deleteComment.mutateAsync(commentId)}
              onReportComment={(commentId, payload) =>
                reportContent.mutateAsync({
                  commentId,
                  reason: payload.reason,
                  description: payload.description
                })
              }
            />
          ) : null}

          {hasNextComments ? (
            <button
              type="button"
              onClick={() => void fetchNextComments()}
              className="mt-3 inline-flex rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800"
            >
              Last flere kommentarer
            </button>
          ) : null}
          {commentsFetchingNext ? <p className="mt-2 text-sm text-gray-700">Laster flere kommentarer...</p> : null}
        </div>

        <CommentInput onSubmit={(content) => createComment.mutateAsync({ content })} loading={createComment.isPending} />

        <Link href="/forum/new" className="inline-flex text-sm font-medium text-forest-800 hover:underline">
          Opprett nytt innlegg
        </Link>
      </section>
    </PageWrapper>
  );
}
