// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, type ReactNode } from 'react';
import nb from '../../../../../messages/nb.json';
import { ForumPostNotFoundError } from '@/lib/moderation/forum-errors';

/**
 * Trådsiden skilte ikke «innlegget er borte» fra en henting som feilet. Den
 * skjulte innlegget, kommentarene og kommentarfeltet på ENHVER feil, og
 * TanStack setter `error` også når en oppfriskning i bakgrunnen feiler: en
 * leser på dårlig dekning mistet tråden og et halvskrevet svar.
 *
 * Og blokkering av trådens forfatter virket bare fra knappen på selve
 * innlegget. Fra et av forfatterens egne svar i tråden ble leseren stående i
 * en tråd RLS nettopp hadde skjult.
 */

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/components/layout/PageWrapper', () => ({ PageWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

let innloggetSom: string | null = 'leser-1';
vi.mock('@/lib/supabase/client', () => {
  const kanal: Record<string, unknown> = {};
  kanal.on = () => kanal;
  kanal.subscribe = () => kanal;
  return {
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: innloggetSom ? { id: innloggetSom } : null } }) },
      channel: () => kanal,
      removeChannel: async () => undefined
    })
  };
});

const blokker = vi.fn(async (_userId: string) => undefined);
vi.mock('@/lib/hooks/useBlocks', () => ({ useBlockUser: () => ({ mutateAsync: blokker, isPending: false }) }));

const INNLEGG = {
  id: 'p1',
  user_id: 'forfatter-1',
  title: 'Er dette steinsopp?',
  content: 'Fant den under gran i går.',
  category: 'question' as const,
  images: [],
  likes_count: 2,
  comments_count: 2,
  created_at: '2026-09-01T10:00:00Z',
  profiles: { username: 'soppvenn' },
  finding: null,
  isLiked: false,
  isOwner: false
};

const KOMMENTARER = [
  { id: 'c1', post_id: 'p1', user_id: 'forfatter-1', parent_comment_id: null, content: 'Takk for svar, alle sammen.', created_at: '2026-09-01T11:00:00Z', profiles: { username: 'soppvenn' } },
  { id: 'c2', post_id: 'p1', user_id: 'annen-2', parent_comment_id: null, content: 'Se på rørene under hatten.', created_at: '2026-09-01T12:00:00Z', profiles: { username: 'rørsopp' } }
];

let postSvar: { data: typeof INNLEGG | undefined; isLoading: boolean; error: unknown } = { data: INNLEGG, isLoading: false, error: null };
const mutasjon = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => undefined), isPending: false });

vi.mock('@/lib/hooks/useForum', () => ({
  useForumPost: () => postSvar,
  useCommentsInfinite: () => ({
    data: { pages: [{ items: KOMMENTARER, nextOffset: null }] },
    isLoading: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false
  }),
  useCreateComment: mutasjon,
  useDeleteComment: mutasjon,
  useDeletePost: mutasjon,
  useReportContent: mutasjon,
  useToggleLike: mutasjon,
  useUpdateComment: mutasjon,
  useUpdatePost: mutasjon
}));

const { default: ForumPostDetailPage } = await import('../page');

const params = Promise.resolve({ id: 'p1' });

function tre() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="nb" messages={nb as never} timeZone="Europe/Oslo">
        <Suspense fallback={null}>
          <ForumPostDetailPage params={params} />
        </Suspense>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

/** Siden leser `params` med `use()` og suspenderer første gang — derfor `await act`. */
async function tegn(): Promise<RenderResult> {
  let resultat: RenderResult | undefined;
  await act(async () => {
    resultat = render(tre());
  });
  return resultat as RenderResult;
}

const kommentarfelt = () => screen.findByPlaceholderText(nb.CommentInput.placeholder) as Promise<HTMLTextAreaElement>;
const kommentarkort = (tekst: string) => screen.getByText(tekst).closest('article') as HTMLElement;

async function blokkerFra(kort: HTMLElement) {
  fireEvent.click(await within(kort).findByText(nb.BlockUser.block));
  fireEvent.click(within(kort).getByText(nb.BlockUser.confirmYes));
}

beforeEach(() => {
  innloggetSom = 'leser-1';
  postSvar = { data: INNLEGG, isLoading: false, error: null };
});

afterEach(() => {
  cleanup();
  push.mockReset();
  replace.mockReset();
  blokker.mockClear();
});

describe('trådsiden når hentingen av innlegget feiler', () => {
  it('en oppfriskning som feiler river ikke ned tråden eller et halvskrevet svar', async () => {
    const { rerender } = await tegn();
    const felt = await kommentarfelt();
    fireEvent.change(felt, { target: { value: 'Jeg tror det er en rødskrubb, fordi' } });

    // Det TanStack gir når en henting i bakgrunnen feiler: feilen settes, og
    // innlegget den hadde blir stående.
    postSvar = { data: INNLEGG, isLoading: false, error: new TypeError('Failed to fetch') };
    rerender(tre());

    expect(screen.getByText(nb.ForumThread.postError)).toBeTruthy();
    expect(screen.queryByText(nb.ForumThread.postGone)).toBeNull();
    expect(screen.getByText(INNLEGG.title)).toBeTruthy();
    expect(screen.getByText(KOMMENTARER[1].content)).toBeTruthy();
    // Samme felt, ikke et nytt: utkastet er der fortsatt.
    expect((await kommentarfelt()).value).toBe('Jeg tror det er en rødskrubb, fordi');
    expect(await kommentarfelt()).toBe(felt);
  });

  it('et innlegg som er borte skjules — med en nøytral tekst, ikke en feilmelding', async () => {
    const { rerender } = await tegn();
    await kommentarfelt();

    // Slettet, skjult av en moderator, eller forfatteren er blokkert. TanStack
    // har fortsatt det gamle innlegget i `data`.
    postSvar = { data: INNLEGG, isLoading: false, error: new ForumPostNotFoundError() };
    rerender(tre());

    expect(screen.getByText(nb.ForumThread.postGone)).toBeTruthy();
    expect(screen.queryByText(nb.ForumThread.postError)).toBeNull();
    expect(screen.queryByText(INNLEGG.title)).toBeNull();
    expect(screen.queryByText(KOMMENTARER[1].content)).toBeNull();
    expect(screen.queryByPlaceholderText(nb.CommentInput.placeholder)).toBeNull();
  });

  it('et innlegg som aldri lot seg hente (ukjent id) får samme nøytrale tekst', async () => {
    postSvar = { data: undefined, isLoading: false, error: new ForumPostNotFoundError() };
    await tegn();
    expect(await screen.findByText(nb.ForumThread.postGone)).toBeTruthy();
    expect(screen.queryByText(nb.ForumThread.postError)).toBeNull();
    expect(screen.queryByText(nb.ForumThread.comments)).toBeNull();
  });
});

describe('blokkering fra en kommentar', () => {
  it('blokkeres trådens forfatter fra et av svarene hennes, forlater leseren tråden', async () => {
    await tegn();
    await kommentarfelt();

    await blokkerFra(kommentarkort(KOMMENTARER[0].content));

    await waitFor(() => expect(blokker).toHaveBeenCalledWith('forfatter-1'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/forum'));
  });

  it('blokkeres en annen som har svart, blir leseren i tråden', async () => {
    await tegn();
    await kommentarfelt();

    await blokkerFra(kommentarkort(KOMMENTARER[1].content));

    await waitFor(() => expect(blokker).toHaveBeenCalledWith('annen-2'));
    // Gi et eventuelt replace-kall tid til å komme før vi sier at det uteble.
    await waitFor(() => expect(within(kommentarkort(KOMMENTARER[1].content)).queryByText(nb.BlockUser.confirmYes)).toBeNull());
    expect(replace).not.toHaveBeenCalled();
  });
});
