import { ForumProfile } from '@/types/forum';

type BadgeTone = 'trusted' | 'expert' | 'community' | 'moderator';

export interface ForumBadge {
  label: string;
  tone: BadgeTone;
}

/**
 * Fallback-etikettene lå tidligere som norske strengliteraler her inne, altså
 * utenfor next-intl: en svensk bruker ville sett «Ekspert» ved siden av en
 * kommentar. Nå tar funksjonen etikettene inn fra kallstedet, som har
 * useTranslations. Se useForumBadge().
 */
export interface ForumBadgeLabels {
  expert: string;
  community: string;
  moderator: string;
  trusted: string;
}

function toOneVerifiedForager(profile?: ForumProfile | null) {
  const value = profile?.verified_foragers;
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export function getForumBadge(
  profile: ForumProfile | null | undefined,
  labels: ForumBadgeLabels
): ForumBadge | null {
  const verified = toOneVerifiedForager(profile);
  if (!verified) return null;

  // badge_label er admin-satt fritekst per person og vinner alltid — den er
  // skrevet av et menneske og skal ikke overstyres av katalogen.
  if (verified.role === 'expert') {
    return { label: verified.badge_label ?? labels.expert, tone: 'expert' };
  }

  if (verified.role === 'community_verifier') {
    return { label: verified.badge_label ?? labels.community, tone: 'community' };
  }

  if (verified.role === 'moderator') {
    return { label: verified.badge_label ?? labels.moderator, tone: 'moderator' };
  }

  return { label: verified.badge_label ?? labels.trusted, tone: 'trusted' };
}

export function forumBadgeClass(tone: BadgeTone) {
  if (tone === 'expert') return 'bg-blue-100 text-blue-800';
  if (tone === 'community') return 'bg-emerald-100 text-emerald-800';
  if (tone === 'moderator') return 'bg-amber-100 text-amber-800';
  return 'bg-gray-100 text-gray-800';
}
