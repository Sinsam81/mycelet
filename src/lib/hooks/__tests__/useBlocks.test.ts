import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { BLOCK_INVALIDATION_KEYS, blokkerBruker, invalidateAfterBlockChange } from '../useBlocks';

/**
 * Blokkering «virket ikke» på skjermen: feeden og tråden bruker
 * useForumPostsInfinite / useCommentsInfinite, mens bare de vanlige nøklene ble
 * ugyldiggjort. TanStack sammenligner nøkler element for element, så
 * ['forum-posts'] treffer ikke ['forum-posts-infinite', …].
 */
describe('invalidateAfterBlockChange', () => {
  it('lista har begge formene av feed- og kommentarnøklene', () => {
    const keys = BLOCK_INVALIDATION_KEYS.map(([key]) => key);
    expect(keys).toEqual(
      expect.arrayContaining(['blocked-users', 'forum-posts', 'forum-posts-infinite', 'forum-post', 'forum-comments', 'forum-comments-infinite'])
    );
  });

  it('ugyldiggjør spørringene som faktisk står på skjermen', () => {
    const queryClient = new QueryClient();
    const paaSkjermen = [
      ['forum-posts-infinite', 'newest', null],
      ['forum-comments-infinite', 'post-1'],
      ['forum-post', 'post-1'],
      ['blocked-users']
    ];
    const urelatert = ['my-findings-options'];
    for (const key of [...paaSkjermen, urelatert]) queryClient.setQueryData(key, { ok: true });

    invalidateAfterBlockChange(queryClient);

    for (const key of paaSkjermen) {
      expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
    expect(queryClient.getQueryState(urelatert)?.isInvalidated).toBe(false);
  });
});

/**
 * blocked_users har ingen UPDATE-policy (migrasjon 032 og 058). En vanlig
 * upsert på en rad som alt finnes går DO UPDATE-veien og avvises av RLS, så
 * et nytt trykk på «Blokker» sa «Kunne ikke blokkere» om noen som var blokkert.
 */
describe('blokkerBruker', () => {
  function klient(brukerId: string | null) {
    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upsert }));
    const supabase = {
      auth: { getUser: async () => ({ data: { user: brukerId ? { id: brukerId } : null } }) },
      from
    };
    return { supabase: supabase as unknown as Parameters<typeof blokkerBruker>[0], upsert, from };
  }

  it('skriver med ON CONFLICT DO NOTHING, aldri DO UPDATE', async () => {
    const { supabase, upsert, from } = klient('meg');
    await blokkerBruker(supabase, 'den-andre');
    expect(from).toHaveBeenCalledWith('blocked_users');
    expect(upsert).toHaveBeenCalledWith(
      { blocker_id: 'meg', blocked_id: 'den-andre' },
      { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true }
    );
  });

  it('utlogget eller seg selv: ingen skriving', async () => {
    const utlogget = klient(null);
    await expect(blokkerBruker(utlogget.supabase, 'x')).rejects.toThrow('not_authenticated');
    expect(utlogget.upsert).not.toHaveBeenCalled();

    const selv = klient('meg');
    await expect(blokkerBruker(selv.supabase, 'meg')).rejects.toThrow('cannot_block_self');
    expect(selv.upsert).not.toHaveBeenCalled();
  });

  it('en ekte feil fra databasen kastes videre', async () => {
    const { supabase, upsert } = klient('meg');
    upsert.mockResolvedValueOnce({ error: { message: 'nede' } } as never);
    await expect(blokkerBruker(supabase, 'den-andre')).rejects.toMatchObject({ message: 'nede' });
  });
});
