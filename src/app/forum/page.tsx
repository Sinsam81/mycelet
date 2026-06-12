'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { CategoryFilter } from '@/components/forum/CategoryFilter';
import { PostCard } from '@/components/forum/PostCard';
import { createClient } from '@/lib/supabase/client';
import { useForumPostsInfinite } from '@/lib/hooks/useForum';
import { ForumCategory, ForumSort } from '@/types/forum';

const sortOptions: Array<{ label: string; value: ForumSort }> = [
  { label: 'Nyeste', value: 'newest' },
  { label: 'Populære', value: 'popular' },
  { label: 'Ubesvarte', value: 'unanswered' }
];

export default function ForumPage() {
  const [sort, setSort] = useState<ForumSort>('newest');
  const [category, setCategory] = useState<ForumCategory>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useForumPostsInfinite(
    sort,
    category
  );

  const posts = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '120px' }
    );

    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const channel = supabase
      .channel('forum-feed-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_posts' }, () => void refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, () => void refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => void refetch())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refetch, supabase]);

  return (
    <PageWrapper>
      <section className="space-y-4">
        <header>
          <p className="text-xs font-medium uppercase tracking-widest text-forest-700">Fellesskap</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h1 className="font-serif text-3xl font-bold tracking-tight text-forest-900">Forum</h1>
            <Link
              href="/forum/new"
              className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-forest-700"
            >
              <Plus className="h-4 w-4" /> Nytt innlegg
            </Link>
          </div>
          <p className="mt-1 text-sm text-gray-700">Del funn, still spørsmål og lær av andre sopplukkere.</p>
        </header>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {sortOptions.map((option) => {
            const active = option.value === sort;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSort(option.value)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  active ? 'bg-forest-800 text-white' : 'border border-gray-300 bg-white text-gray-800 hover:border-forest-400'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <CategoryFilter value={category} onChange={setCategory} />

        {isLoading ? <p className="text-sm text-gray-700">Laster innlegg...</p> : null}
        {error ? <p className="text-sm text-red-600">Kunne ikke hente innlegg.</p> : null}

        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>

        <div ref={sentinelRef} className="h-1" />
        {isFetchingNextPage ? <p className="text-sm text-gray-700">Laster flere...</p> : null}
        {hasNextPage ? (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            className="inline-flex rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800"
          >
            Last flere
          </button>
        ) : null}

        {!isLoading && posts.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-center shadow-card">
            <p className="text-sm text-gray-700">Ingen innlegg her ennå.</p>
            <Link href="/forum/new" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-forest-800 hover:underline">
              <Plus className="h-4 w-4" /> Bli den første til å dele
            </Link>
          </div>
        ) : null}

        <div className="flex items-center justify-center gap-4 pt-2 text-xs text-gray-500">
          <Link href="/forum/reports" className="hover:text-forest-800 hover:underline">
            Mine rapporter
          </Link>
          <Link href="/forum/moderation" className="hover:text-forest-800 hover:underline">
            Moderasjon
          </Link>
        </div>
      </section>
    </PageWrapper>
  );
}
