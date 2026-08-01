import { describe, it, expect, vi } from 'vitest';
import { ensureProfile, defaultUsernameFor } from '../ensure-profile';

type UpsertCall = { values: { id: string; username: string; display_name: string }; options: unknown };

/** Supabase-etterligning der `takenUsernames` allerede er i bruk av andre. */
function fakeClient(takenUsernames: string[] = [], hardFail = false) {
  const calls: UpsertCall[] = [];
  const client = {
    from() {
      return {
        upsert(values: UpsertCall['values'], options: unknown) {
          calls.push({ values, options });
          if (hardFail) {
            return Promise.resolve({ error: { code: '08006', message: 'connection failure' } });
          }
          if (takenUsernames.includes(values.username)) {
            return Promise.resolve({
              error: { code: '23505', message: 'duplicate key value violates unique constraint "profiles_username_key"' }
            });
          }
          return Promise.resolve({ error: null });
        }
      };
    }
  };
  return { client, calls };
}

const user = {
  id: 'abcdef12-3456-7890-abcd-ef1234567890',
  email: 'sopp@example.com',
  user_metadata: { username: 'kantarell', display_name: 'Kari' }
};

describe('defaultUsernameFor', () => {
  it('bruker e-postens lokaldel', () => {
    expect(defaultUsernameFor({ id: 'x', email: 'sopp@example.com' })).toBe('sopp');
  });

  it('faller tilbake på bruker-id når e-post mangler', () => {
    expect(defaultUsernameFor({ id: 'abcdef1234', email: null })).toBe('bruker-abcdef12');
  });
});

describe('ensureProfile', () => {
  it('oppretter profilen med ønsket brukernavn', async () => {
    const { client, calls } = fakeClient();
    const result = await ensureProfile(client, user);

    expect(result.error).toBeNull();
    expect(result.username).toBe('kantarell');
    expect(calls).toHaveLength(1);
    expect(calls[0].values).toEqual({
      id: user.id,
      username: 'kantarell',
      display_name: 'Kari'
    });
  });

  it('overskriver aldri en profil som allerede finnes', async () => {
    const { client, calls } = fakeClient();
    await ensureProfile(client, user);
    // ignoreDuplicates på id er det som gjør funksjonen trygg å kalle ved hver
    // eneste innlogging.
    expect(calls[0].options).toEqual({ onConflict: 'id', ignoreDuplicates: true });
  });

  it('bruker visningsnavn = brukernavn når visningsnavn mangler', async () => {
    const { client, calls } = fakeClient();
    await ensureProfile(client, { ...user, user_metadata: { username: 'kantarell' } });
    expect(calls[0].values.display_name).toBe('kantarell');
  });

  it('faller tilbake på e-post/id når metadata er tomt', async () => {
    const { client, calls } = fakeClient();
    const result = await ensureProfile(client, { id: user.id, email: 'sopp@example.com', user_metadata: null });
    expect(result.username).toBe('sopp');
    expect(calls[0].values.username).toBe('sopp');
  });

  describe('brukernavnet er opptatt', () => {
    it('prøver på nytt med et suffiks i stedet for å gi opp', async () => {
      // Dette er kjernen: uten dette ble kontoen stående uten profil for alltid.
      const { client, calls } = fakeClient(['kantarell']);
      const result = await ensureProfile(client, user);

      expect(result.error).toBeNull();
      expect(calls).toHaveLength(2);
      expect(result.username).toBe('kantarell-abcdef');
    });

    it('suffikset er utledet av bruker-id, så det er stabilt', async () => {
      const { client } = fakeClient(['kantarell']);
      const a = await ensureProfile(client, user);
      const { client: client2 } = fakeClient(['kantarell']);
      const b = await ensureProfile(client2, user);
      expect(a.username).toBe(b.username);
    });
  });

  it('rapporterer feil som ikke er brukernavnkollisjon uten å prøve på nytt', async () => {
    const { client, calls } = fakeClient([], true);
    const result = await ensureProfile(client, user);

    expect(result.error).toEqual({ code: '08006', message: 'connection failure' });
    // Et nytt forsøk med suffiks ville ikke hjulpet mot en nettverksfeil.
    expect(calls).toHaveLength(1);
  });

  it('kan kalles gjentatte ganger — det er hele poenget', async () => {
    const { client } = fakeClient();
    const spy = vi.spyOn(client, 'from');
    await ensureProfile(client, user);
    await ensureProfile(client, user);
    await ensureProfile(client, user);
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
