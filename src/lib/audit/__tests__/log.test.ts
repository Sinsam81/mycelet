import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/** Radene som ble «skrevet» til admin_audit_log i den aktuelle testen. */
let inserted: Record<string, unknown>[] = [];
let adminAvailable = true;
let insertError: { message: string } | null = null;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (!adminAvailable) throw new Error('SUPABASE_SERVICE_ROLE_KEY mangler');
    return {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          return { error: insertError };
        }
      })
    };
  }
}));

const { logAdminAction } = await import('../log');

function requestWithClientContext() {
  return new NextRequest('https://mycelet.com/api/me/delete', {
    method: 'POST',
    headers: {
      'x-forwarded-for': '203.0.113.9, 70.41.3.18',
      'user-agent': 'Mycelet/1.0 (iPhone)'
    }
  });
}

beforeEach(() => {
  inserted = [];
  adminAvailable = true;
  insertError = null;
});

describe('revisjonsloggen', () => {
  it('lagrer ikke IP eller nettleser når brukeren sletter kontoen sin', async () => {
    // admin_audit_log kan ingen slette fra. Skriver vi IP-en til en bruker som
    // nettopp ba om å bli glemt etter art. 17, blir den stående for alltid.
    await logAdminAction({
      actorId: 'bruker-1',
      action: 'account.self_delete',
      targetUserId: 'bruker-1',
      metadata: { counts: { forumPosts: 2 } },
      request: requestWithClientContext()
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0].ip_address).toBeNull();
    expect(inserted[0].user_agent).toBeNull();
    // Sporet består: hvem, hva og hvor mye.
    expect(inserted[0].actor_id).toBe('bruker-1');
    expect(inserted[0].action).toBe('account.self_delete');
    expect(inserted[0].metadata).toEqual({ counts: { forumPosts: 2 } });
  });

  it('lagrer fortsatt IP og nettleser for administratorhandlinger', async () => {
    // Her er poenget det motsatte: en admin som endrer andres roller skal
    // kunne spores.
    await logAdminAction({
      actorId: 'admin-1',
      action: 'verified_forager.upsert',
      targetUserId: 'bruker-2',
      request: requestWithClientContext()
    });

    expect(inserted[0].ip_address).toBe('203.0.113.9');
    expect(inserted[0].user_agent).toBe('Mycelet/1.0 (iPhone)');
  });

  it('uten request lagres ingen klientkontekst', async () => {
    await logAdminAction({ actorId: 'admin-1', action: 'verified_forager.delete' });
    expect(inserted[0].ip_address).toBeNull();
    expect(inserted[0].user_agent).toBeNull();
  });

  it('kaster aldri — en feilet revisjonsskriving skal ikke velte handlingen', async () => {
    adminAvailable = false;
    await expect(logAdminAction({ actorId: 'x', action: 'account.self_delete' })).resolves.toBeUndefined();

    adminAvailable = true;
    insertError = { message: 'relation does not exist' };
    await expect(logAdminAction({ actorId: 'x', action: 'account.self_delete' })).resolves.toBeUndefined();
  });
});
