'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ForumComment, ReportReason } from '@/types/forum';
import { ReportButton } from '@/components/forum/ReportButton';
import { forumBadgeClass, getForumBadge } from '@/lib/utils/forumBadge';

interface CommentListProps {
  comments: ForumComment[];
  currentUserId?: string | null;
  onReply?: (parentCommentId: string, content: string) => Promise<void>;
  onEditComment?: (commentId: string, content: string) => Promise<void>;
  onDeleteComment?: (commentId: string) => Promise<void>;
  onReportComment?: (commentId: string, payload: { reason: ReportReason; description?: string }) => Promise<void>;
}

function CommentCard({
  comment,
  currentUserId,
  onReply,
  onEditComment,
  onDeleteComment,
  onReportComment,
  isReply = false
}: {
  comment: ForumComment;
  currentUserId?: string | null;
  onReply?: (parentCommentId: string, content: string) => Promise<void>;
  onEditComment?: (commentId: string, content: string) => Promise<void>;
  onDeleteComment?: (commentId: string) => Promise<void>;
  onReportComment?: (commentId: string, payload: { reason: ReportReason; description?: string }) => Promise<void>;
  isReply?: boolean;
}) {
  const author = comment.profiles?.display_name || comment.profiles?.username || 'Ukjent bruker';
  const badge = getForumBadge(comment.profiles);
  const isOwner = currentUserId === comment.user_id;

  const [showReply, setShowReply] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [replyErr, setReplyErr] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [editErr, setEditErr] = useState<string | null>(null);

  const submitReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onReply || !replyContent.trim()) return;

    setReplyErr(null);
    try {
      await onReply(comment.id, replyContent.trim());
      setReplyContent('');
      setShowReply(false);
    } catch (err) {
      setReplyErr(err instanceof Error ? err.message : 'Kunne ikke sende svar.');
    }
  };

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onEditComment || !editContent.trim()) return;

    setEditErr(null);
    try {
      await onEditComment(comment.id, editContent.trim());
      setEditing(false);
    } catch (err) {
      setEditErr(err instanceof Error ? err.message : 'Kunne ikke oppdatere kommentar.');
    }
  };

  return (
    <article className={`rounded-lg border border-gray-200 bg-white p-3 ${isReply ? 'ml-6' : ''}`}>
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
              Avbryt
            </Button>
            <Button size="sm" type="submit">Lagre</Button>
          </div>
        </form>
      ) : (
        <p className="mt-1 text-sm text-gray-800">{comment.content}</p>
      )}

      <p className="mt-1 text-xs text-gray-500">{new Date(comment.created_at).toLocaleString('nb-NO')}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {onReply ? (
          <button type="button" onClick={() => setShowReply((v) => !v)} className="text-xs font-medium text-forest-800 hover:underline">
            Svar
          </button>
        ) : null}

        {isOwner && onEditComment ? (
          <button type="button" onClick={() => setEditing((v) => !v)} className="text-xs font-medium text-gray-700 hover:underline">
            Rediger
          </button>
        ) : null}

        {isOwner && onDeleteComment ? (
          <button type="button" onClick={() => onDeleteComment(comment.id)} className="text-xs font-medium text-red-700 hover:underline">
            Slett
          </button>
        ) : null}
      </div>

      {onReportComment ? (
        <div className="mt-2">
          <ReportButton label="Rapporter kommentar" onSubmit={(payload) => onReportComment(comment.id, payload)} />
        </div>
      ) : null}

      {showReply && onReply ? (
        <form onSubmit={submitReply} className="mt-2 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
          <textarea
            value={replyContent}
            onChange={(event) => setReplyContent(event.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            rows={2}
            placeholder="Skriv svar"
          />
          {replyErr ? <p className="text-xs text-red-600">{replyErr}</p> : null}
          <Button size="sm" type="submit">Send svar</Button>
        </form>
      ) : null}
    </article>
  );
}

export function CommentList({ comments, currentUserId, onReply, onEditComment, onDeleteComment, onReportComment }: CommentListProps) {
  const topComments = useMemo(() => comments.filter((c) => !c.parent_comment_id), [comments]);
  const repliesByParent = useMemo(() => {
    const map = new Map<string, ForumComment[]>();
    comments
      .filter((c) => c.parent_comment_id)
      .forEach((reply) => {
        const key = reply.parent_comment_id as string;
        const existing = map.get(key) ?? [];
        existing.push(reply);
        map.set(key, existing);
      });
    return map;
  }, [comments]);

  if (comments.length === 0) {
    return <p className="text-sm text-gray-700">Ingen kommentarer ennå.</p>;
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
              isReply
            />
          ))}
        </div>
      ))}
    </div>
  );
}
