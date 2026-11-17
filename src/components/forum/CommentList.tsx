'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { ForumComment, ReportReason } from '@/types/forum';
import { ReportButton } from '@/components/forum/ReportButton';
import { BlockUserButton } from '@/components/forum/BlockUserButton';
import { forumBadgeClass } from '@/lib/utils/forumBadge';
import { useForumBadge } from '@/lib/hooks/useForumBadge';
import { forumTidspunkt } from '@/components/forum/forumDato';
import { grupperKommentarer } from '@/lib/forum/kommentartre';
import { checkContent } from '@/lib/moderation/content-filter';
import { useForumErrorMessage } from '@/components/forum/useForumErrorMessage';

interface CommentListProps {
  comments: ForumComment[];
  currentUserId?: string | null;
  onReply?: (parentCommentId: string, content: string) => Promise<void>;
  onEditComment?: (commentId: string, content: string) => Promise<void>;
  onDeleteComment?: (commentId: string) => Promise<void>;
  onReportComment?: (commentId: string, payload: { reason: ReportReason; description?: string }) => Promise<void>;
  /**
   * Called with the author's id after the reader has blocked them from one of
   * their comments. The thread page uses it to leave a thread whose own author
   * was just blocked — RLS hides that whole thread from now on.
   */
  onUserBlocked?: (userId: string) => void;
}

function CommentCard({
  comment,
  currentUserId,
  onReply,
  onEditComment,
  onDeleteComment,
  onReportComment,
  onUserBlocked,
  isReply = false
}: {
  comment: ForumComment;
  currentUserId?: string | null;
  onReply?: (parentCommentId: string, content: string) => Promise<void>;
  onEditComment?: (commentId: string, content: string) => Promise<void>;
  onDeleteComment?: (commentId: string) => Promise<void>;
  onReportComment?: (commentId: string, payload: { reason: ReportReason; description?: string }) => Promise<void>;
  onUserBlocked?: (userId: string) => void;
  isReply?: boolean;
}) {
  const t = useTranslations('CommentList');
  const tFilter = useTranslations('ContentFilter');
  const forumError = useForumErrorMessage();
  const locale = useLocale();
  const author = comment.profiles?.display_name || comment.profiles?.username || t('unknownUser');
  const badge = useForumBadge()(comment.profiles);
  const isOwner = currentUserId === comment.user_id;

  const [showReply, setShowReply] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [replyErr, setReplyErr] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [editErr, setEditErr] = useState<string | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const submitReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onReply || !replyContent.trim()) return;

    setReplyErr(null);
    // Samme innholdsfilter som i kommentarfeltet nederst (CommentInput).
    if (!checkContent(replyContent).ok) {
      setReplyErr(tFilter('controlledSubstanceTrade'));
      return;
    }
    try {
      await onReply(comment.id, replyContent.trim());
      setReplyContent('');
      setShowReply(false);
    } catch (err) {
      setReplyErr(forumError(err, t('replyError')));
    }
  };

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onEditComment || !editContent.trim()) return;

    setEditErr(null);
    if (!checkContent(editContent).ok) {
      setEditErr(tFilter('controlledSubstanceTrade'));
      return;
    }
    try {
      await onEditComment(comment.id, editContent.trim());
      setEditing(false);
    } catch (err) {
      setEditErr(forumError(err, t('editError')));
    }
  };

  // To trinn, som for innlegg: sletting kan ikke angres, og svar på
  // kommentaren følger med (ON DELETE CASCADE).
  const confirmDelete = async () => {
    if (!onDeleteComment || deleting) return;
    setDeleteErr(null);
    setDeleting(true);
    try {
      await onDeleteComment(comment.id);
    } catch (err) {
      setDeleteErr(forumError(err, t('deleteError')));
      setDeleting(false);
    }
  };

  return (
    <article className={`rounded-xl border border-gray-200 bg-white p-3 ${isReply ? 'ml-4 border-l-2 border-l-forest-300' : ''}`}>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-gray-900">{author}</p>
        {badge ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${forumBadgeClass(badge.tone)}`}>{badge.label}</span> : null}
      </div>

      {editing ? (
        <form className="mt-2 space-y-2" onSubmit={submitEdit}>
          <textarea className="w-full rounded border border-gray-300 px-2 py-1 text-sm" rows={3} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
          {editErr ? <p className="text-xs text-red-600">{editErr}</p> : null}
          <div className="flex gap-2">
            <Button size="sm" type="button" variant="outline" onClick={() => setEditing(false)}>
              {t('cancel')}
            </Button>
            <Button size="sm" type="submit">{t('save')}</Button>
          </div>
        </form>
      ) : (
        <p className="mt-1 text-sm text-gray-800">{comment.content}</p>
      )}

      <p className="mt-1 text-xs text-gray-500">
        <time dateTime={comment.created_at}>{forumTidspunkt(comment.created_at, locale)}</time>
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {onReply ? (
          <button type="button" onClick={() => setShowReply((v) => !v)} className="text-xs font-medium text-forest-800 hover:underline">
            {t('reply')}
          </button>
        ) : null}

        {isOwner && onEditComment ? (
          <button type="button" onClick={() => setEditing((v) => !v)} className="text-xs font-medium text-gray-700 hover:underline">
            {t('edit')}
          </button>
        ) : null}

        {isOwner && onDeleteComment && !confirmingDelete ? (
          <button type="button" onClick={() => setConfirmingDelete(true)} className="text-xs font-medium text-red-700 hover:underline">
            {t('delete')}
          </button>
        ) : null}
      </div>

      {isOwner && onDeleteComment && confirmingDelete ? (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs" role="alert">
          <p className="font-medium text-red-900">{t('confirmDelete')}</p>
          {deleteErr ? <p className="mt-1 text-red-700">{deleteErr}</p> : null}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                setConfirmingDelete(false);
                setDeleteErr(null);
              }}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 font-medium text-gray-700 disabled:opacity-60"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void confirmDelete()}
              className="rounded-md bg-red-600 px-2.5 py-1 font-medium text-white disabled:opacity-60"
            >
              {deleting ? t('deleting') : t('confirmDeleteYes')}
            </button>
          </div>
        </div>
      ) : null}

      {onReportComment ? (
        <div className="mt-2 flex flex-wrap items-start gap-3">
          <ReportButton label={t('reportComment')} onSubmit={(payload) => onReportComment(comment.id, payload)} />
          <BlockUserButton
            userId={comment.user_id}
            displayName={author}
            currentUserId={currentUserId}
            onBlocked={onUserBlocked ? () => onUserBlocked(comment.user_id) : undefined}
          />
        </div>
      ) : null}

      {showReply && onReply ? (
        <form onSubmit={submitReply} className="mt-2 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
          <textarea
            value={replyContent}
            onChange={(event) => setReplyContent(event.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            rows={2}
            placeholder={t('replyPlaceholder')}
          />
          {replyErr ? <p className="text-xs text-red-600">{replyErr}</p> : null}
          <Button size="sm" type="submit">{t('sendReply')}</Button>
        </form>
      ) : null}
    </article>
  );
}

export function CommentList({
  comments,
  currentUserId,
  onReply,
  onEditComment,
  onDeleteComment,
  onReportComment,
  onUserBlocked
}: CommentListProps) {
  const t = useTranslations('CommentList');
  const { topp: topComments, svar: repliesByParent } = useMemo(() => grupperKommentarer(comments), [comments]);

  if (comments.length === 0) {
    return <p className="text-sm text-gray-700">{t('noComments')}</p>;
  }

  return (
    <div className="space-y-2">
      {topComments.map((comment) => (
        <div key={comment.id} className="space-y-2">
          <CommentCard
            comment={comment}
            currentUserId={currentUserId}
            onReply={onReply}
            onEditComment={onEditComment}
            onDeleteComment={onDeleteComment}
            onReportComment={onReportComment}
            onUserBlocked={onUserBlocked}
          />

          {(repliesByParent.get(comment.id) ?? []).map((reply) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              onReply={onReply}
              onEditComment={onEditComment}
              onDeleteComment={onDeleteComment}
              onReportComment={onReportComment}
              onUserBlocked={onUserBlocked}
              isReply
            />
          ))}
        </div>
      ))}
    </div>
  );
}
