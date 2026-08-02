import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  startProfileSelfHeal,
  ensureProfileOnce,
  resetProfileSelfHealCache,
  type AuthStateClient
} from '../profile-self-heal';

/**
 * Kjernepåstanden: en innlogget bruker uten profilrad SKAL få en.
 *
 * Før denne fiksen kjørte reparasjonen bare ved registrering, i auth-callbacken
 * og inne i signIn(). Alle tre er overganger. En bruker som allerede var logget
 * inn — økten leses fra localStorage og fornyes av seg selv — traff aldri noen
 * av dem, og ble stående uten profil på ubestemt tid. 7 ekte brukere satt slik.
 */

type Profile = { id: string; username: string; display_name: string };

/** Supabase-etterligning: profiles som et Map, pluss auth-hendelser. */
function fakeSupabase(options: {
  session?: { user: { id: string; email?: string; user_metadata?: Record<string, string> } } | null;
  existingProfiles?: Profile[];
  takenUsernames?: string[];
  failWith?: { code?: string; message: string } | null;
}) {
  const rows = new Map<string, Profile>((options.existingProfiles ?? []).map((p) => [p.id, p]));
  const taken = new Set(options.takenUsernames ?? []);
  const upserts: Profile[] = [];
  let listener: ((event: string, session: unknown) => void) | null = null;
  let unsubscribed = false;
  let failWith = options.failWith ?? null;

  const client = {
    from() {
      return {
        upsert(values: Profile) {
          upserts.push(values);
          if (failWith) return Promise.resolve({ error: failWith });
          // ignoreDuplicates på id: finnes raden, gjør vi ingenting.
          if (rows.has(values.id)) return Promise.resolve({ error: null });
          if (taken.has(values.username)) {
            return Promise.resolve({
              error: { code: '23505', message: 'duplicate key value violates unique constraint' }
            });
          }
          rows.set(values.id, values);
          return Promise.resolve({ error: null });
        }
      };
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session: options.session ?? null } }),
      onAuthStateChange(callback: (event: string, session: unknown) => void) {
        listener = callback;
        return {
          data: {
            subscription: {
              unsubscribe() {
                unsubscribed = true;
              }
            }
          }
        };
      }
    }
  };

  return {
    client: client as unknown as AuthStateClient,
    rows,
    upserts,
    emit: (event: string, session: unknown) => listener?.(event, session),
    get unsubscribed() {
      return unsubscribed;
    },
    heal: () => {
      failWith = null;
    }
  };
}

/** setTimeout(0) inne i auth-callbacken + løftekjeden må få kjøre ferdig. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const brukerUtenProfil = {
  id: 'abcdef12-3456-7890-abcd-ef1234567890',
  email: 'sopp@example.com',
  user_metadata: { username: 'kantarell', display_name: 'Kari' }
};

beforeEach(() => {
  resetProfileSelfHealCache();
});

describe('startProfileSelfHeal', () => {
  it('oppretter profilrad når en bruker uten profil logger inn', async () => {
    const fake = fakeSupabase({ session: null });
    startProfileSelfHeal(fake.client);
    await flush();

    expect(fake.rows.size).toBe(0);

    fake.emit('SIGNED_IN', { user: brukerUtenProfil });
    await flush();

    expect(fake.rows.get(brukerUtenProfil.id)).toEqual({
      id: brukerUtenProfil.id,
      username: 'kantarell',
      display_name: 'Kari'
    });
  });

  it('reparerer en økt som allerede finnes ved sidelast', async () => {
    // DETTE er hullet som rammet de 7: de er logget inn fra før, så SIGNED_IN
    // kommer aldri. Uten dette kallet blir de aldri reparert.
    const fake = fakeSupabase({ session: { user: brukerUtenProfil } });
    startProfileSelfHeal(fake.client);
    await flush();

    expect(fake.rows.get(brukerUtenProfil.id)?.username).toBe('kantarell');
  });

  it('reparerer også når økten kommer fra passordreset eller token-fornyelse', async () => {
    for (const event of ['PASSWORD_RECOVERY', 'TOKEN_REFRESHED', 'INITIAL_SESSION']) {
      resetProfileSelfHealCache();
      const fake = fakeSupabase({ session: null });
      startProfileSelfHeal(fake.client);
      await flush();

      fake.emit(event, { user: brukerUtenProfil });
      await flush();

      expect(fake.rows.has(brukerUtenProfil.id)).toBe(true);
    }
  });

  it('rører ikke en profil som allerede finnes', async () => {
    const eksisterende = { id: brukerUtenProfil.id, username: 'gammelt-navn', display_name: 'Gammelt' };
    const fake = fakeSupabase({ session: { user: brukerUtenProfil }, existingProfiles: [eksisterende] });
    startProfileSelfHeal(fake.client);
    await flush();

    expect(fake.rows.get(brukerUtenProfil.id)).toEqual(eksisterende);
  });

  it('bruker suffiks når brukernavnet er opptatt av en annen', async () => {
    const fake = fakeSupabase({ session: { user: brukerUtenProfil }, takenUsernames: ['kantarell'] });
    startProfileSelfHeal(fake.client);
    await flush();

    expect(fake.rows.get(brukerUtenProfil.id)?.username).toBe('kantarell-abcdef');
  });

  it('gjør ingenting når ingen er logget inn', async () => {
    const fake = fakeSupabase({ session: null });
    startProfileSelfHeal(fake.client);
    await flush();

    fake.emit('SIGNED_OUT', null);
    await flush();

    expect(fake.upserts).toHaveLength(0);
  });

  it('slutter å reparere etter avmelding', async () => {
    const fake = fakeSupabase({ session: null });
    const stop = startProfileSelfHeal(fake.client);
    await flush();

    stop();
    fake.emit('SIGNED_IN', { user: brukerUtenProfil });
    await flush();

    expect(fake.unsubscribed).toBe(true);
    expect(fake.upserts).toHaveLength(0);
  });
});

describe('ensureProfileOnce', () => {
  it('kaller databasen én gang selv om økten dukker opp flere ganger', async () => {
    const fake = fakeSupabase({ session: { user: brukerUtenProfil } });
    startProfileSelfHeal(fake.client);
    await flush();

    fake.emit('SIGNED_IN', { user: brukerUtenProfil });
    fake.emit('TOKEN_REFRESHED', { user: brukerUtenProfil });
    await flush();

    expect(fake.upserts).toHaveLength(1);
  });

  it('prøver på nytt ved neste hendelse hvis reparasjonen feilet', async () => {
    // En nettverksfeil skal ikke låse brukeren ute resten av sidelasten.
    const fake = fakeSupabase({
      session: null,
      failWith: { code: '08006', message: 'connection failure' }
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    startProfileSelfHeal(fake.client);
    await flush();

    fake.emit('SIGNED_IN', { user: brukerUtenProfil });
    await flush();
    expect(fake.rows.has(brukerUtenProfil.id)).toBe(false);
    expect(warn).toHaveBeenCalled();

    fake.heal();
    fake.emit('TOKEN_REFRESHED', { user: brukerUtenProfil });
    await flush();
    expect(fake.rows.has(brukerUtenProfil.id)).toBe(true);

    warn.mockRestore();
  });

  it('deler forsøket med signIn(), så det blir ett kall og ikke to', async () => {
    const fake = fakeSupabase({ session: null });
    startProfileSelfHeal(fake.client);
    await flush();

    fake.emit('SIGNED_IN', { user: brukerUtenProfil });
    // signIn() venter på nøyaktig dette løftet før den redirigerer.
    const result = await ensureProfileOnce(fake.client, brukerUtenProfil);
    await flush();

    expect(result.error).toBeNull();
    expect(fake.upserts).toHaveLength(1);
  });
});
