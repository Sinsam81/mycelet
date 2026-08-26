import { describe, it, expect, vi } from 'vitest';
import { deleteUserStorageObjects, USER_IMAGE_BUCKETS, type StorageApi } from '../delete-user-objects';

/** Bygger en Storage-etterligning med gitt innhold per bøtte. */
function fakeStorage(contents: Record<string, string[]>, opts: { failOn?: string; failRemove?: string } = {}) {
  const state: Record<string, string[]> = Object.fromEntries(
    Object.entries(contents).map(([k, v]) => [k, [...v]])
  );
  const removeCalls: { bucket: string; paths: string[] }[] = [];

  const storage: StorageApi = {
    from(bucket: string) {
      return {
        async list(path: string, options?: { limit?: number; offset?: number }) {
          if (opts.failOn === bucket) return { data: null, error: { message: 'list blew up' } };
          const all = (state[bucket] ?? []).filter((n) => n.startsWith(`${path}/`) || !n.includes('/'));
          const offset = options?.offset ?? 0;
          const limit = options?.limit ?? 100;
          return {
            data: all.slice(offset, offset + limit).map((name) => ({ name })),
            error: null
          };
        },
        async remove(paths: string[]) {
          if (opts.failRemove === bucket) return { error: { message: 'remove blew up' } };
          removeCalls.push({ bucket, paths });
          const names = paths.map((p) => p.split('/').slice(1).join('/'));
          state[bucket] = (state[bucket] ?? []).filter((n) => !names.includes(n));
          return { error: null };
        }
      };
    }
  };

  return { storage, state, removeCalls };
}

describe('deleteUserStorageObjects', () => {
  it('fjerner alt i brukerens mappe i begge bøttene', async () => {
    const { storage, state, removeCalls } = fakeStorage({
      'finding-images': ['a.jpg', 'b.jpg'],
      'forum-images': ['c.jpg']
    });

    const result = await deleteUserStorageObjects(storage, 'bruker-1');

    expect(result.removed).toBe(3);
    expect(result.failures).toEqual([]);
    expect(state['finding-images']).toEqual([]);
    expect(state['forum-images']).toEqual([]);
    // Stiene må ha bruker-prefikset, ellers treffer slettingen feil fil.
    expect(removeCalls.flatMap((c) => c.paths)).toEqual(['bruker-1/a.jpg', 'bruker-1/b.jpg', 'bruker-1/c.jpg']);
  });

  it('dekker alle bøttene brukeren har lastet opp til', () => {
    expect([...USER_IMAGE_BUCKETS]).toEqual(['finding-images', 'forum-images', 'identify-history']);
  });

  it('tar med den PRIVATE historikkbøtta', () => {
    // identify-history (migrasjon 055) er privat, i motsetning til de to andre.
    // Det gjør den ikke mindre slettepliktig: tjenesterollen ser bort fra RLS,
    // og en art. 17-sletting som lar brukerens egne bilder bli liggende er
    // ingen sletting. Den er lett å glemme nettopp fordi den ikke er offentlig.
    expect([...USER_IMAGE_BUCKETS]).toContain('identify-history');
  });

  it('er idempotent — andre kjøring finner ingenting', async () => {
    const { storage } = fakeStorage({ 'finding-images': ['a.jpg'], 'forum-images': [] });

    const first = await deleteUserStorageObjects(storage, 'bruker-1');
    const second = await deleteUserStorageObjects(storage, 'bruker-1');

    expect(first.removed).toBe(1);
    expect(second.removed).toBe(0);
    expect(second.failures).toEqual([]);
  });

  it('tom mappe er ikke en feil', async () => {
    const { storage } = fakeStorage({ 'finding-images': [], 'forum-images': [] });
    const result = await deleteUserStorageObjects(storage, 'bruker-1');
    expect(result).toEqual({ removed: 0, failures: [] });
  });

  it('rapporterer feil i én bøtte, men rydder likevel den andre', async () => {
    const { storage, state } = fakeStorage(
      { 'finding-images': ['a.jpg'], 'forum-images': ['c.jpg'] },
      { failOn: 'finding-images' }
    );

    const result = await deleteUserStorageObjects(storage, 'bruker-1');

    expect(result.failures).toEqual([{ bucket: 'finding-images', message: 'list blew up' }]);
    // Den andre bøtta ble likevel tømt — en delvis rydding er bedre enn ingen.
    expect(result.removed).toBe(1);
    expect(state['forum-images']).toEqual([]);
  });

  it('rapporterer feil under selve slettingen', async () => {
    const { storage } = fakeStorage({ 'finding-images': ['a.jpg'], 'forum-images': [] }, { failRemove: 'finding-images' });
    const result = await deleteUserStorageObjects(storage, 'bruker-1');
    expect(result.removed).toBe(0);
    expect(result.failures).toEqual([{ bucket: 'finding-images', message: 'remove blew up' }]);
  });

  it('tåler at storage-klienten kaster', async () => {
    const storage: StorageApi = {
      from() {
        throw new Error('ingen service role key');
      }
    };
    const result = await deleteUserStorageObjects(storage, 'bruker-1');
    expect(result.removed).toBe(0);
    expect(result.failures).toHaveLength(USER_IMAGE_BUCKETS.length);
    expect(result.failures[0].message).toBe('ingen service role key');
  });

  it('paginerer gjennom mer enn én side', async () => {
    // 2500 filer → tre runder på 1000.
    const many = Array.from({ length: 2500 }, (_, i) => `bilde-${i}.jpg`);
    const { storage, state } = fakeStorage({ 'finding-images': many, 'forum-images': [] });

    const result = await deleteUserStorageObjects(storage, 'bruker-1');

    expect(result.removed).toBe(2500);
    expect(state['finding-images']).toEqual([]);
  });

  it('rører ikke andre brukeres filer', async () => {
    const { storage, removeCalls } = fakeStorage({ 'finding-images': ['a.jpg'], 'forum-images': [] });
    await deleteUserStorageObjects(storage, 'bruker-1');
    for (const path of removeCalls.flatMap((c) => c.paths)) {
      expect(path.startsWith('bruker-1/')).toBe(true);
    }
  });

  it('lar kalleren styre hvilke bøtter som ryddes', async () => {
    const { storage } = fakeStorage({ 'finding-images': ['a.jpg'], 'forum-images': ['c.jpg'] });
    const spy = vi.spyOn(storage, 'from');
    await deleteUserStorageObjects(storage, 'bruker-1', ['forum-images']);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('forum-images');
  });
});
