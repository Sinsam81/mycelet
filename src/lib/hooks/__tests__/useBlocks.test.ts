import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { BLOCK_INVALIDATION_KEYS, invalidateAfterBlockChange } from '../useBlocks';

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
