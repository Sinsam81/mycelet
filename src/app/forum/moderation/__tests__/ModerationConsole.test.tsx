// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import nb from '../../../../../messages/nb.json';
import sv from '../../../../../messages/sv.json';
import type { ModerationReportItem, ModerationTarget } from '@/lib/moderation/moderering';

/**
 * Konsollen er det eneste stedet en melding kan følges opp. To hull lå her:
 *
 *  - en funnrapport viste brukernavn, art og dato, men ikke hvilket funn det
 *    gjaldt eller hvordan det vises for andre — og kortet selv sier at funnet
 *    må fjernes «manuelt i databasen»;
 *  - «Marker som løst» var borte, så en rapport som førte til at noe ble gjort
 *    uten skjuling (alltid tilfellet for funn) bare kunne «avvises».
 */

vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/components/layout/PageWrapper', () => ({ PageWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

let rapporter: ModerationReportItem[] = [];
const utfor = vi.fn(async (_payload: { reportId: string; action: string }) => undefined);
vi.mock('@/lib/hooks/useForum', () => ({
  useModerationReports: () => ({ data: { reports: rapporter, pending: { antall: rapporter.length, eldsteTimer: 2, over24t: false } }, isLoading: false, error: null }),
  useModerationAction: () => ({ mutateAsync: utfor })
}));

const { ModerationConsole } = await import('../ModerationConsole');

const FUNN_ID = '0b6f3c1e-7a2d-4f55-9c1b-2e4d8a9f0c11';

function maal(over: Partial<ModerationTarget>): ModerationTarget {
  return {
    type: 'finding',
    id: FUNN_ID,
    missing: false,
    postId: null,
    threadVisible: false,
    title: null,
    excerpt: null,
    images: [],
    isHidden: false,
    canHide: false,
    authorUsername: 'finner',
    species: { norwegian_name: 'Kantarell', swedish_name: 'Kantarell' },
    speciesOverride: null,
    foundAt: '2026-08-20T08:00:00Z',
    shownAs: 'public',
    zoneLabel: null,
    ...over
  };
}

function rapport(over: Partial<ModerationReportItem> & { target: ModerationTarget }): ModerationReportItem {
  return { id: 'r1', reason: 'privacy', description: null, status: 'pending', createdAt: '2026-09-01T10:00:00Z', ...over };
}

function tegn(sprak: 'nb' | 'sv' = 'nb') {
  return render(
    <NextIntlClientProvider locale={sprak} messages={(sprak === 'nb' ? nb : sv) as never} timeZone="Europe/Oslo">
      <ModerationConsole />
    </NextIntlClientProvider>
  );
}

const kort = () => screen.getByRole('article');

afterEach(() => {
  cleanup();
  utfor.mockClear();
});

describe('en funnrapport i konsollen', () => {
  it('viser hvilket funn det gjelder — id-en som finner raden i databasen', () => {
    rapporter = [rapport({ target: maal({}) })];
    tegn();
    const id = within(kort()).getByText(FUNN_ID);
    // Ett trykk skal markere hele id-en, så den kan kopieres fra mobilen.
    expect(id.className).toContain('select-all');
    expect(within(kort()).getByText(nb.ForumModeration.findingShownPublic)).toBeTruthy();
  });

  it('viser sonen for et sonefunn, og at et privat funn ikke vises for andre', () => {
    rapporter = [rapport({ target: maal({ shownAs: 'zone', zoneLabel: 'Nordmarka sør' }) })];
    tegn();
    expect(kort().textContent).toContain(nb.ForumModeration.findingShownZone);
    expect(kort().textContent).toContain('Sone: Nordmarka sør');
    cleanup();

    rapporter = [rapport({ target: maal({ shownAs: 'private' }) })];
    tegn();
    expect(within(kort()).getByText(nb.ForumModeration.findingShownPrivate)).toBeTruthy();
    cleanup();

    rapporter = [rapport({ target: maal({ shownAs: 'approximate' }) })];
    tegn();
    expect(within(kort()).getByText(nb.ForumModeration.findingShownApproximate)).toBeTruthy();
  });

  it('viser id-en også når eieren har slettet funnet', () => {
    rapporter = [rapport({ target: maal({ missing: true, shownAs: null, authorUsername: null, species: null, foundAt: null }) })];
    tegn();
    expect(within(kort()).getByText(nb.ForumModeration.contentMissing)).toBeTruthy();
    expect(within(kort()).getByText(FUNN_ID)).toBeTruthy();
  });

  it('kan markeres som løst, ikke bare avvises', async () => {
    rapporter = [rapport({ target: maal({}) })];
    tegn();
    // Funn kan ikke skjules herfra.
    expect(within(kort()).queryByText(nb.ForumModeration.hide)).toBeNull();
    fireEvent.click(within(kort()).getByText(nb.ForumModeration.markResolved));
    await waitFor(() => expect(utfor).toHaveBeenCalledWith({ reportId: 'r1', action: 'resolve' }));
  });

  it('har svenske tekster', () => {
    rapporter = [rapport({ target: maal({ shownAs: 'zone', zoneLabel: 'Tiveden' }) })];
    tegn('sv');
    expect(kort().textContent).toContain(sv.ForumModeration.findingShownZone);
    expect(kort().textContent).toContain('Zon: Tiveden');
    expect(within(kort()).getByText(sv.ForumModeration.markResolved)).toBeTruthy();
    expect(kort().textContent).toContain(sv.ForumModeration.findingId);
  });
});

describe('åpne og avsluttede rapporter', () => {
  const innlegg = maal({ type: 'post', id: 'p1', postId: 'p1', threadVisible: true, title: 'Tittel', canHide: true, shownAs: null, species: null, foundAt: null });

  it('en gjennomgått rapport er fortsatt åpen: den kan løses eller avvises', () => {
    rapporter = [rapport({ status: 'reviewed', target: innlegg })];
    tegn();
    expect(within(kort()).getByText(nb.ForumModeration.markResolved)).toBeTruthy();
    expect(within(kort()).getByText(nb.ForumModeration.dismiss)).toBeTruthy();
    // Den er alt gjennomgått.
    expect(within(kort()).queryByText(nb.ForumModeration.markReviewed)).toBeNull();
    // Innlegg viser ingen funn-id.
    expect(within(kort()).queryByText(nb.ForumModeration.findingId, { exact: false })).toBeNull();
  });

  it.each(['resolved', 'dismissed'] as const)('en rapport som er %s har ingen statusknapper', (status) => {
    rapporter = [rapport({ status, target: innlegg })];
    tegn();
    expect(within(kort()).queryByText(nb.ForumModeration.markResolved)).toBeNull();
    expect(within(kort()).queryByText(nb.ForumModeration.dismiss)).toBeNull();
    expect(within(kort()).queryByText(nb.ForumModeration.markReviewed)).toBeNull();
  });
});
