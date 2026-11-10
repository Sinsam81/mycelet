import type { ForumCategory, ForumSort } from '@/types/forum';

/** Det lille av spørringsbyggeren vi trenger — gjør regelen testbar uten Supabase. */
interface Sporring<Q> {
  eq(column: string, value: string | number): Q;
  order(column: string, options: { ascending: boolean }): Q;
}

/**
 * Kategori og sortering for forumfeeden — én regel for begge feed-hookene.
 *
 * «Ubesvarte» la tidligere alltid på `category = 'question'`, også når en
 * kategori var valgt. To motstridende filtre på samme kolonne gir aldri treff,
 * så «Ubesvarte» + «Funn» viste alltid «Ingen innlegg her ennå». Nå betyr
 * «Ubesvarte» ubesvarte spørsmål når ingen kategori er valgt, og ubesvarte
 * innlegg i den valgte kategorien ellers.
 */
export function brukForumFilter<Q extends Sporring<Q>>(query: Q, sort: ForumSort, category: ForumCategory): Q {
  let q = query;
  if (category) q = q.eq('category', category);

  switch (sort) {
    case 'popular':
      return q.order('likes_count', { ascending: false }).order('created_at', { ascending: false });
    case 'unanswered':
      if (!category) q = q.eq('category', 'question');
      return q.eq('comments_count', 0).order('created_at', { ascending: false });
    default:
      return q.order('created_at', { ascending: false });
  }
}
