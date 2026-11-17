// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Forumlista viste lenken «Moderasjon» til alle, selv om bare moderatorer kan
 * bruke siden, og en tom liste hadde bare «Ingen innlegg her ennå».
 *
 * Lenken vises nå bare for moderatorer og admin. Utloggede gjør ingen
 * forespørsel for å finne det ut (økta leses lokalt).
 */

const mock = vi.hoisted(() => ({
  bruker: null as string | null,
  rolle: null as string | null,
  feil: false,
  rolleoppslag: [] as unknown[]
}));

vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/components/layout/PageWrapper', () => ({ PageWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/forum/CategoryFilter', () => ({ CategoryFilter: () => null }));
vi.mock('@/components/forum/PostCard', () => ({ PostCard: () => null }));
vi.mock('@/lib/hooks/useForum', () => ({
  useForumPostsInfinite: () => ({
    data: { pages: [{ items: [] }] },
    isLoading: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn()
  })
}));
vi.mock('@/lib/supabase/client', () => {
  const kanal: Record<string, unknown> = {};
  kanal.on = () => kanal;
  kanal.subscribe = () => kanal;
  return {
    createClient: () => ({
      auth: { getSession: async () => ({ data: { session: mock.bruker ? { user: { id: mock.bruker } } : null } }) },
      channel: () => kanal,
      removeChannel: async () => undefined,
      from: (tabell: string) => {
        const filtre: Array<[string, unknown]> = [];
        const q = {
          select: () => q,
          eq: (k: string, v: unknown) => {
            filtre.push([k, v]);
            return q;
          },
          maybeSingle: async () => {
            mock.rolleoppslag.push({ tabell, filtre });
            if (mock.feil) return { data: null, error: { message: 'nede' } };
            return { data: mock.rolle ? { role: mock.rolle } : null, error: null };
          }
        };
        return q;
      }
    })
  };
});

class IngenObservator {
  observe() {}
  disconnect() {}
}
globalThis.IntersectionObserver = IngenObservator as unknown as typeof IntersectionObserver;

const { default: ForumPage } = await import('../page');

function vis(locale: 'nb' | 'sv' = 'nb') {
  const klient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={klient}>
      <NextIntlClientProvider locale={locale} messages={locale === 'sv' ? sv : nb} timeZone="Europe/Oslo">
        <ForumPage />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mock.bruker = null;
  mock.rolle = null;
  mock.feil = false;
  mock.rolleoppslag = [];
});
afterEach(cleanup);

describe('lenken til moderasjonen', () => {
  it('utlogget: ingen lenke, og ingen forespørsel for å finne det ut', async () => {
    vis();
    await screen.findByText(nb.Forum.myReports);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(nb.Forum.moderation)).toBeNull();
    expect(mock.rolleoppslag).toHaveLength(0);
  });

  it('innlogget uten rolle: ingen lenke', async () => {
    mock.bruker = 'leser-1';
    vis();
    await waitFor(() => expect(mock.rolleoppslag).toHaveLength(1));
    expect(mock.rolleoppslag[0]).toEqual({ tabell: 'moderator_roles', filtre: [['user_id', 'leser-1']] });
    expect(screen.queryByText(nb.Forum.moderation)).toBeNull();
  });

  it.each(['moderator', 'admin'])('%s: lenken vises', async (rolle) => {
    mock.bruker = 'mod-1';
    mock.rolle = rolle;
    vis();
    expect(await screen.findByText(nb.Forum.moderation)).toBeTruthy();
  });

  it('et oppslag som feiler leses som «nei»', async () => {
    mock.bruker = 'mod-1';
    mock.rolle = 'admin';
    mock.feil = true;
    vis();
    await waitFor(() => expect(mock.rolleoppslag).toHaveLength(1));
    expect(screen.queryByText(nb.Forum.moderation)).toBeNull();
  });
});

describe('tom liste', () => {
  it.each(['nb', 'sv'] as const)('%s: én hjelpsom setning og lenken til å starte en tråd', async (locale) => {
    vis(locale);
    const k = locale === 'sv' ? sv : nb;
    expect(await screen.findByText(k.Forum.emptyStateHint)).toBeTruthy();
    expect(screen.getByText(k.Forum.beFirst)).toBeTruthy();
  });
});
