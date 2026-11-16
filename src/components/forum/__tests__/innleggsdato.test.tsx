// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';
import { PostCard } from '@/components/forum/PostCard';
import { PostDetail } from '@/components/forum/PostDetail';
import { CommentList } from '@/components/forum/CommentList';
import type { ForumComment, ForumPost, ForumPostDetail } from '@/types/forum';

/**
 * Innleggene sa ikke når de var skrevet — kortet i lista og tråden manglet
 * dato. Og forumbildene manglet lat lasting og asynkron dekoding.
 */

vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/lib/hooks/useForumBadge', () => ({ useForumBadge: () => () => null }));
vi.mock('@/lib/hooks/useBlocks', () => ({ useBlockUser: () => ({ mutateAsync: vi.fn(), isPending: false }) }));

const INNLEGG: ForumPost = {
  id: 'p1',
  user_id: 'u1',
  title: 'Kantareller ved vannet',
  content: 'En hel kurv.',
  category: 'find',
  images: [
    { url: 'https://example.test/a.jpg' },
    { url: 'https://example.test/b.jpg' }
  ],
  likes_count: 0,
  comments_count: 0,
  created_at: '2025-08-14T22:30:00Z',
  profiles: { username: 'soppvenn' }
} as ForumPost;

function medSprak(locale: 'nb' | 'sv', barn: ReactNode) {
  return (
    <NextIntlClientProvider locale={locale} messages={locale === 'sv' ? sv : nb} timeZone="Europe/Oslo">
      {barn}
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

describe('PostCard', () => {
  it('viser når innlegget ble skrevet, med år, i norsk tid', () => {
    const { container } = render(medSprak('nb', <PostCard post={INNLEGG} />));
    const tid = container.querySelector('time');
    expect(tid?.getAttribute('dateTime')).toBe('2025-08-14T22:30:00Z');
    // 22:30 UTC er 00:30 neste dag i Oslo om sommeren.
    expect(tid?.textContent).toMatch(/^15\. aug\.? 2025$/);
  });

  it('svensk leser får svensk dato', () => {
    const { container } = render(medSprak('sv', <PostCard post={INNLEGG} />));
    expect(container.querySelector('time')?.textContent).toMatch(/^15 aug\.? 2025$/);
  });

  it('bildet lastes lat og dekodes asynkront', () => {
    render(medSprak('nb', <PostCard post={INNLEGG} />));
    const bilde = screen.getByRole('img');
    expect(bilde.getAttribute('loading')).toBe('lazy');
    expect(bilde.getAttribute('decoding')).toBe('async');
  });
});

describe('PostDetail', () => {
  const detalj = { ...INNLEGG, isLiked: false, isOwner: false } as ForumPostDetail;

  it('viser datoen i tråden', () => {
    const { container } = render(medSprak('nb', <PostDetail post={detalj} onToggleLike={() => undefined} />));
    expect(container.querySelector('time')?.textContent).toMatch(/2025/);
  });

  it('første bilde lastes straks, resten lat — alle dekodes asynkront', () => {
    render(medSprak('nb', <PostDetail post={detalj} onToggleLike={() => undefined} />));
    const [forste, andre] = screen.getAllByRole('img');
    expect(forste.getAttribute('loading')).toBe('eager');
    expect(andre.getAttribute('loading')).toBe('lazy');
    expect(forste.getAttribute('decoding')).toBe('async');
    expect(andre.getAttribute('decoding')).toBe('async');
  });
});

describe('CommentList', () => {
  it('kommentarer viser dato og klokkeslett i norsk tid', () => {
    const kommentar = {
      id: 'c1',
      post_id: 'p1',
      user_id: 'u2',
      parent_comment_id: null,
      content: 'Flott!',
      created_at: '2026-09-01T10:05:00Z',
      profiles: { username: 'leser' }
    } as ForumComment;
    const { container } = render(medSprak('nb', <CommentList comments={[kommentar]} />));
    const tid = container.querySelector('time');
    expect(tid?.getAttribute('dateTime')).toBe('2026-09-01T10:05:00Z');
    expect(tid?.textContent).toMatch(/1\. sep\.? 2026.*12[.:]05/);
  });
});
