export type ForumSort = 'newest' | 'popular' | 'unanswered';
export type ForumCategory = 'find' | 'question' | 'tip' | 'discussion' | null;
export type ReportReason = 'spam' | 'inappropriate' | 'misinformation' | 'dangerous_advice' | 'harassment' | 'other';

export interface ForumImage {
  url: string;
  thumbnail_url?: string;
  caption?: string;
}

export interface ForumProfile {
  username?: string;
  avatar_url?: string | null;
  display_name?: string | null;
  verified_foragers?:
    | {
        role: 'trusted_forager' | 'expert' | 'community_verifier' | 'moderator';
        badge_label?: string | null;
      }
    | Array<{
        role: 'trusted_forager' | 'expert' | 'community_verifier' | 'moderator';
        badge_label?: string | null;
      }>
    | null;
}

export interface ForumPost {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: 'find' | 'question' | 'tip' | 'discussion';
  images: ForumImage[];
  likes_count: number;
  comments_count: number;
  created_at: string;
  profiles?: ForumProfile | null;
  finding?: {
    id: string;
    species_id?: number | null;
    species_name_override?: string | null;
    is_zone_finding?: boolean | null;
    zone_label?: string | null;
    zone_precision_km?: number | null;
    mushroom_species?: {
      norwegian_name?: string | null;
    } | null;
  } | null;
}

export interface ForumPostDetail extends ForumPost {
  isLiked: boolean;
  isOwner: boolean;
}

export interface ForumComment {
  id: string;
  post_id: string;
  user_id: string;
  parent_comment_id: string | null;
  content: string;
  created_at: string;
  profiles?: ForumProfile | null;
}

export interface ForumReport {
  id: string;
  reason: ReportReason;
  description: string | null;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  created_at: string;
  post_id: string | null;
  comment_id: string | null;
  finding_id: string | null;
}

export interface UserFindingOption {
  id: string;
  species_id: number | null;
  species_name_override: string | null;
  found_at: string;
  is_zone_finding?: boolean | null;
  zone_label?: string | null;
  zone_precision_km?: number | null;
  mushroom_species?: {
    norwegian_name?: string | null;
  } | null;
}
