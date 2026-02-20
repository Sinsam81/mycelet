import Link from 'next/link';
import { MessageCircle, Heart } from 'lucide-react';
import { ForumPost } from '@/types/forum';
import { forumBadgeClass, getForumBadge } from '@/lib/utils/forumBadge';

const categoryLabel: Record<ForumPost['category'], string> = {
  find: 'Funn',
  question: 'Spørsmål',
  tip: 'Tips',
  discussion: 'Diskusjon'
};

const categoryClass: Record<ForumPost['category'], string> = {
  find: 'bg-emerald-100 text-emerald-800',
  question: 'bg-blue-100 text-blue-800',
  tip: 'bg-amber-100 text-amber-800',
  discussion: 'bg-gray-100 text-gray-800'
};

interface PostCardProps {
  post: ForumPost;
}

export function PostCard({ post }: PostCardProps) {
  const author = post.profiles?.display_name || post.profiles?.username || 'Ukjent bruker';
  const badge = getForumBadge(post.profiles);
  const image = post.images?.[0]?.url;
  const findingSpecies = post.finding?.mushroom_species?.norwegian_name || post.finding?.species_name_override || 'Ukjent art';

  return (
    <Link href={`/forum/${post.id}`} className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900">{author}</p>
          {badge ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${forumBadgeClass(badge.tone)}`}>{badge.label}</span> : null}
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${categoryClass[post.category]}`}>
          {categoryLabel[post.category]}
        </span>
      </div>

      <h3 className="mt-2 line-clamp-2 font-semibold text-gray-900">{post.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-gray-700">{post.content}</p>
      {post.finding ? (
        <p className="mt-1 text-xs text-gray-600">
          Koblet funn: {findingSpecies}
          {post.finding.is_zone_finding ? ` • Sone: ${post.finding.zone_label ?? 'Ukjent sone'}` : ''}
        </p>
      ) : null}

      {image ? <img src={image} alt={post.title} className="mt-3 h-32 w-full rounded-lg object-cover" /> : null}

      <div className="mt-3 flex items-center gap-4 text-sm text-gray-600">
        <span className="inline-flex items-center gap-1"><Heart className="h-4 w-4" /> {post.likes_count}</span>
        <span className="inline-flex items-center gap-1"><MessageCircle className="h-4 w-4" /> {post.comments_count}</span>
      </div>
    </Link>
  );
}
