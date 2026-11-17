'use client';

import Link from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
import { isPostNotFoundError } from '@/lib/moderation/forum-errors';

interface ForumPostDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ForumPostDetailPage({ params }: ForumPostDetailPageProps) {
  const { id: postId } = use(params);
  const t = useTranslations('ForumThread');
  const router = useRouter();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);

  const { data: post, isLoading: postLoading, error: postError } = useForumPost(postId);
  // To slags feil, og de skal ikke se like ut. «Borte» (slettet, skjult, eller
  // forfatteren blokkert) er et svar: da skal tråden vekk. Alt annet er en
  // henting som feilet — TanStack setter `error` også når en oppfriskning i
  // bakgrunnen feiler, og beholder innlegget den hadde. Da skal tråden,
  // kommentarene og et halvskrevet svar bli stående under feillinja.
  const postGone = isPostNotFoundError(postError);
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

  // Tre tilstander: undefined = vet ikke ennå, null = utlogget. Uten skillet
  // ville kommentarfeltet blinket inn og ut for utloggede mens økta ble lest.
  const [authUserId, setAuthUserId] = useState<string | null | undefined>(undefined);
  const currentUserId = authUserId ?? null;
  const loggedIn = Boolean(authUserId);
  const loginHref = `/auth/login?redirect=${encodeURIComponent(`/forum/${postId}`)}`;
  const comments = useMemo(() => commentsPages?.pages.flatMap((page) => page.items) ?? [], [commentsPages]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthUserId(data.user?.id ?? null));
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
          <ArrowLeft className="h-4 w-4" /> {t('backToForum')}
        </button>

        {postLoading ? <p className="text-sm text-gray-700">{t('loadingPost')}</p> : null}
        {postGone ? <p className="text-sm text-gray-700">{t('postGone')}</p> : null}
        {postError && !postGone ? <p className="text-sm text-red-600">{t('postError')}</p> : null}

        {/* TanStack beholder forrige data når en ny henting feiler. Uten
            !postGone sto derfor et innlegg som nettopp ble usynlig (forfatteren
            blokkert, innlegget skjult eller slettet) igjen på skjermen. */}
        {post && !postGone ? (
          <PostDetail
            post={post}
            currentUserId={currentUserId}
            // Tråden er åpen for utloggede (delte lenker lander her). Da skal
            // ikke knappene stå der og feile: liker sender til innlogging, og
            // meld/blokker vises ikke (PostDetail skjuler dem uten onReport).
            onToggleLike={() => {
              if (authUserId === undefined) return;
              if (!loggedIn) {
                router.push(loginHref);
                return;
              }
              toggleLike.mutate(post.isLiked);
            }}
            likeLoading={toggleLike.isPending}
            onEdit={(payload) => updatePost.mutateAsync(payload)}
            onDelete={async () => {
              // Kaster ved feil, så bekreftelsen i PostDetail kan vise den og
              // leseren blir stående i tråden.
              await deletePost.mutateAsync();
              router.push('/forum');
            }}
            onReport={
              loggedIn
                ? (payload) =>
                    reportContent.mutateAsync({
                      postId,
                      reason: payload.reason,
                      description: payload.description
                    })
                : undefined
            }
            // Blokkerer leseren den som skrev innlegget, skjuler RLS hele
            // tråden. Da er feeden riktig sted å være, ikke en tom tråd.
            onAuthorBlocked={() => router.replace('/forum')}
          />
        ) : null}

        {postGone ? null : (
          <>
            <div className="rounded-2xl border border-gray-200 bg-cream-dark p-3">
              <h2 className="mb-2 font-serif text-xl font-bold text-forest-900">{t('comments')}</h2>
              {commentsLoading ? <p className="text-sm text-gray-700">{t('loadingComments')}</p> : null}
              {commentsError ? <p className="text-sm text-red-600">{t('commentsError')}</p> : null}
              {comments.length > 0 ? (
                <CommentList
                  comments={comments}
                  currentUserId={currentUserId}
                  onReply={loggedIn ? (parentCommentId, content) => createComment.mutateAsync({ content, parentCommentId }) : undefined}
                  onEditComment={(commentId, content) => updateComment.mutateAsync({ commentId, content })}
                  onDeleteComment={(commentId) => deleteComment.mutateAsync(commentId)}
                  onReportComment={
                    loggedIn
                      ? (commentId, payload) =>
                          reportContent.mutateAsync({
                            commentId,
                            reason: payload.reason,
                            description: payload.description
                          })
                      : undefined
                  }
                  // Den som startet tråden svarer som regel i den selv. Blokkeres
                  // forfatteren fra et slikt svar, skjuler RLS hele tråden —
                  // samme utgang som blokker-knappen på selve innlegget.
                  onUserBlocked={(userId) => {
                    if (post && userId === post.user_id) router.replace('/forum');
                  }}
                />
              ) : null}

              {hasNextComments ? (
                <button
                  type="button"
                  onClick={() => void fetchNextComments()}
                  className="mt-3 inline-flex rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800"
                >
                  {t('loadMoreComments')}
                </button>
              ) : null}
              {commentsFetchingNext ? <p className="mt-2 text-sm text-gray-700">{t('loadingMoreComments')}</p> : null}
            </div>

            {loggedIn ? (
              <CommentInput onSubmit={(content) => createComment.mutateAsync({ content })} loading={createComment.isPending} />
            ) : null}
            {authUserId === null ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-4 text-center shadow-card">
                <p className="text-sm text-gray-700">{t('loginToCommentHint')}</p>
                <Link
                  href={loginHref}
                  className="mt-3 inline-flex rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-forest-700"
                >
                  {t('loginToComment')}
                </Link>
              </div>
            ) : null}
          </>
        )}

        <Link href="/forum/new" className="inline-flex text-sm font-medium text-forest-800 hover:underline">
          {t('createNewPost')}
        </Link>
      </section>
    </PageWrapper>
  );
}
