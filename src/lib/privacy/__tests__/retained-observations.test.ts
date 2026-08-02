import { describe, expect, it } from 'vitest';
import {
  RETAINED_VISIBILITY,
  coarsenRetainedObservations,
  type RetainedObservationRow,
  type RetainedObservationsApi
} from '@/lib/privacy/retained-observations';

interface Recorded {
  selects: Array<Record<string, unknown>>;
  updates: Array<{ id: unknown; values: Record<string, unknown> }>;
  deletedIds: string[];
}

function fakeDb(
  rows: RetainedObservationRow[] | null,
  options: { selectError?: string; updateError?: string; deleteError?: string } = {}
): { db: RetainedObservationsApi; recorded: Recorded } {
  const recorded: Recorded = { selects: [], updates: [], deletedIds: [] };

  const db = {
    from: () => ({
      select: () => ({
        eq: (_c1: string, v1: unknown) => ({
          eq: (_c2: string, v2: unknown) => ({
            eq: async (c3: string, v3: unknown) => {
              recorded.selects.push({ user_id: v1, is_negative_observation: v2, [c3]: v3 });
              return {
                data: rows,
                error: options.selectError ? { message: options.selectError } : null
              };
            }
          })
        })
      }),
      update: (values: Record<string, unknown>) => ({
        eq: async (_column: string, id: unknown) => {
          recorded.updates.push({ id, values });
          return { error: options.updateError ? { message: options.updateError } : null };
        }
      }),
      delete: () => ({
        in: async (_column: string, ids: string[]) => {
          recorded.deletedIds.push(...ids);
          return { error: options.deleteError ? { message: options.deleteError } : null };
        }
      })
    })
  } as unknown as RetainedObservationsApi;

  return { db, recorded };
}

describe('coarsenRetainedObservations', () => {
  it('erstatter det eksakte punktet med den jitrede kopien', async () => {
    // Dette er hele poenget: erklæringen sier ±500 m, og da skal ikke
    // latitude/longitude fortsatt være GPS-punktet brukeren sto på.
    const { db, recorded } = fakeDb([
      { id: 'a', display_latitude: 59.9111, display_longitude: 10.7222 }
    ]);

    expect(await coarsenRetainedObservations(db, 'bruker-1')).toBeNull();
    expect(recorded.updates).toEqual([
      { id: 'a', values: { latitude: 59.9111, longitude: 10.7222 } }
    ]);
  });

  it('leter bare etter negative observasjoner delt på omtrentlig nivå', async () => {
    const { db, recorded } = fakeDb([]);
    await coarsenRetainedObservations(db, 'bruker-1');
    expect(recorded.selects).toEqual([
      { user_id: 'bruker-1', is_negative_observation: true, visibility: RETAINED_VISIBILITY }
    ]);
  });

  it('sletter rader som mangler grovkornet posisjon i stedet for å la det eksakte punktet stå', async () => {
    const { db, recorded } = fakeDb([
      { id: 'mangler', display_latitude: null, display_longitude: null },
      { id: 'halv', display_latitude: 60.1, display_longitude: null },
      { id: 'ok', display_latitude: 60.2, display_longitude: 11.1 }
    ]);

    expect(await coarsenRetainedObservations(db, 'bruker-1')).toBeNull();
    expect(recorded.deletedIds.sort()).toEqual(['halv', 'mangler']);
    expect(recorded.updates).toEqual([{ id: 'ok', values: { latitude: 60.2, longitude: 11.1 } }]);
  });

  it('gjør ingenting når brukeren ikke har slike observasjoner', async () => {
    const { db, recorded } = fakeDb([]);
    expect(await coarsenRetainedObservations(db, 'bruker-1')).toBeNull();
    expect(recorded.updates).toHaveLength(0);
    expect(recorded.deletedIds).toHaveLength(0);
  });

  it('takler mange rader — alle blir grovkornet, ikke bare første batch', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `rad-${i}`,
      display_latitude: 60 + i / 1000,
      display_longitude: 11 + i / 1000
    }));
    const { db, recorded } = fakeDb(many);

    expect(await coarsenRetainedObservations(db, 'bruker-1')).toBeNull();
    expect(recorded.updates).toHaveLength(60);
  });

  it('melder fra i stedet for å svelge en feilet spørring', async () => {
    const feilSelect = fakeDb(null, { selectError: 'kunne ikke lese' });
    expect(await coarsenRetainedObservations(feilSelect.db, 'x')).toBe('kunne ikke lese');

    const feilUpdate = fakeDb([{ id: 'a', display_latitude: 1, display_longitude: 2 }], {
      updateError: 'kunne ikke skrive'
    });
    expect(await coarsenRetainedObservations(feilUpdate.db, 'x')).toBe('kunne ikke skrive');

    const feilDelete = fakeDb([{ id: 'a', display_latitude: null, display_longitude: null }], {
      deleteError: 'kunne ikke slette'
    });
    expect(await coarsenRetainedObservations(feilDelete.db, 'x')).toBe('kunne ikke slette');
  });

  it('er idempotent — andre kjøring skriver samme verdi', async () => {
    // Kallstedet ber brukeren prøve på nytt etter en delvis feil, så steget
    // må tåle å kjøres om igjen.
    const rows = [{ id: 'a', display_latitude: 59.5, display_longitude: 10.5 }];
    const first = fakeDb(rows);
    const second = fakeDb(rows);
    await coarsenRetainedObservations(first.db, 'x');
    await coarsenRetainedObservations(second.db, 'x');
    expect(second.recorded.updates).toEqual(first.recorded.updates);
  });
});
