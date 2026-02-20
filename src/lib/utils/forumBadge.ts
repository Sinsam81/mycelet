import { ForumProfile } from '@/types/forum';

type BadgeTone = 'trusted' | 'expert' | 'community' | 'moderator';

export interface ForumBadge {
  label: string;
  tone: BadgeTone;
}

function toOneVerifiedForager(profile?: ForumProfile | null) {
  const value = profile?.verified_foragers;
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export function getForumBadge(profile?: ForumProfile | null): ForumBadge | null {
  const verified = toOneVerifiedForager(profile);
  if (!verified) return null;

  if (verified.role === 'expert') {
    return {
      label: verified.badge_label ?? 'Ekspert',
      tone: 'expert'
    };
  }

  if (verified.role === 'community_verifier') {
    return {
      label: verified.badge_label ?? 'Fellesskapsverifisert',
      tone: 'community'
    };
  }

  if (verified.role === 'moderator') {
    return {
      label: verified.badge_label ?? 'Moderator',
      tone: 'moderator'
    };
  }

  return {
    label: verified.badge_label ?? 'Verifisert plukker',
    tone: 'trusted'
  };
}

export function forumBadgeClass(tone: BadgeTone) {
  if (tone === 'expert') return 'bg-blue-100 text-blue-800';
  if (tone === 'community') return 'bg-emerald-100 text-emerald-800';
  if (tone === 'moderator') return 'bg-amber-100 text-amber-800';
  return 'bg-gray-100 text-gray-800';
}

