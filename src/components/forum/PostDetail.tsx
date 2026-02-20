'use client';

import { FormEvent, useState } from 'react';
import { Heart, MessageCircle, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ReportButton } from '@/components/forum/ReportButton';
import { SharePostButton } from '@/components/forum/SharePostButton';
import { ForumPostDetail, ReportReason } from '@/types/forum';
import { forumBadgeClass, getForumBadge } from '@/lib/utils/forumBadge';

interface PostDetailProps {
  post: ForumPostDetail;
  onToggleLike: () => void;
  onReport?: (payload: { reason: ReportReason; description?: string }) => Promise<void>;
  onEdit?: (payload: { title: string; content: string; category: 'find' | 'question' | 'tip' | 'discussion' }) => Promise<void>;
  onDelete?: () => Promise<void>;
  likeLoading?: boolean;
}

const categoryLabel: Record<ForumPostDetail['category'], string> = {
  find: 'Funn',
  question: 'Spørsmål',
  tip: 'Tips',
  discussion: 'Diskusjon'
};

export function PostDetail({ post, onToggleLike, onReport, onEdit, onDelete, likeLoading }: PostDetailProps) {
  const author = post.profiles?.display_name || post.profiles?.username || 'Ukjent bruker';
  const badge = getForumBadge(post.profiles);
  const findingName = post.finding?.mushroom_species?.norwegian_name || post.finding?.species_name_override || null;
  const zoneLabel = post.finding?.is_zone_finding ? post.finding?.zone_label : null;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [category, setCategory] = useState(post.category);
  const [editError, setEditError] = useState<string | null>(null);

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEditError(null);
    if (!onEdit) return;

    try {
      await onEdit({ title: title.trim(), content: content.trim(), category });
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Kunne ikke oppdatere innlegg.');
    }
  };

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900">{author}</p>
          {badge ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${forumBadgeClass(badge.tone)}`}>{badge.label}</span> : null}
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">{categoryLabel[post.category]}</span>
      </div>

      {editing ? (
        <form className="mt-3 space-y-2" onSubmit={submitEdit}>
          <input className="w-full rounded-lg border border-gray-300 px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className="w-full rounded-lg border border-gray-300 px-3 py-2" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            <option value="find">Funn</option>
            <option value="question">Spørsmål</option>
            <option value="tip">Tips</option>
            <option value="discussion">Diskusjon</option>
          </select>
          <textarea className="w-full rounded-lg border border-gray-300 px-3 py-2" rows={4} value={content} onChange={(e) => setContent(e.target.value)} />
          {editError ? <p className="text-sm text-red-600">{editError}</p> : null}
          <div className="flex gap-2">
            <Button size="sm" type="button" variant="outline" onClick={() => setEditing(false)}>
              Avbryt
            </Button>
            <Button size="sm" type="submit">
              Lagre
            </Button>
          </div>
        </form>
      ) : (
        <>
          <h1 className="mt-2 text-xl font-semibold text-gray-900">{post.title}</h1>
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{post.content}</p>
          {post.finding ? (
            <p className="mt-2 text-xs text-gray-600">
              Koblet funn:{' '}
              {post.finding.mushroom_species?.norwegian_name || post.finding.species_name_override || 'Ukjent art'}
              {post.finding.is_zone_finding ? ` • Sone: ${post.finding.zone_label ?? 'Ukjent sone'}` : ''}
            </p>
          ) : null}
        </>
      )}

      {post.images.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {post.images.map((image, idx) => (
            <img key={`${image.url}-${idx}`} src={image.url} alt={image.caption ?? post.title} className="h-40 w-full rounded-lg object-cover" />
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-3 text-sm text-gray-600">
        <Button
          type="button"
          variant={post.isLiked ? 'primary' : 'outline'}
          size="sm"
          onClick={onToggleLike}
          loading={likeLoading}
          icon={<Heart className="h-4 w-4" />}
        >
          {post.likes_count}
        </Button>
        <span className="inline-flex items-center gap-1"><MessageCircle className="h-4 w-4" /> {post.comments_count}</span>
        <SharePostButton postId={post.id} title={post.title} findingName={findingName} zoneLabel={zoneLabel} />
      </div>

      {post.isOwner ? (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)} icon={<Pencil className="h-4 w-4" />}>
            Rediger
          </Button>
          <Button size="sm" variant="danger" onClick={onDelete} icon={<Trash2 className="h-4 w-4" />}>
            Slett
          </Button>
        </div>
      ) : null}

      {onReport ? (
        <div className="mt-3">
          <ReportButton label="Rapporter innlegg" onSubmit={onReport} />
        </div>
      ) : null}
    </article>
  );
}
