import { ensureProfile, type EnsureProfileResult, type MinimalUser, type ProfileUpsertClient } from './ensure-profile';

/**
 * Reparerer manglende profilrader for ENHVER innlogget økt — ikke bare i det
 * øyeblikket noen trykker «Logg inn».
 *
 * Hvorfor dette trengs i tillegg til ensureProfile:
 *
 * ensureProfile ble opprinnelig kalt tre steder — registrering, auth-callbacken
 * og signIn(). Alle tre er OVERGANGER. En bruker som allerede er logget inn går
 * aldri gjennom noen av dem igjen: Supabase leser økten fra localStorage ved
 * sidelast og fornyer tokenet av seg selv, så signIn() kalles aldri på nytt.
 * Ble kontoen din rammet før reparasjonen fantes, ble du derfor stående uten
 * profil på ubestemt tid — appen «gjorde ingenting» hver gang du prøvde å lagre
 * et funn, poste i forumet eller kommentere, fordi alle de tabellene har
 * fremmednøkkel mot profiles. Det rammet ekte, betalende brukere.
 *
 * Tre hull til, som alle lukkes av å henge seg på øktene i stedet for
 * overgangene:
 *   - auth-callbacken returnerer tidlig når URL-en ikke har ?code=
 *   - passordreset (/auth/reset) oppretter en økt uten å gå via signIn()
 *   - en økt som fornyes i bakgrunnen er ingen «innlogging» i det hele tatt
 *
 * Reparasjonen er idempotent (upsert med ignoreDuplicates på id), så det er
 * trygt å kjøre den for hver økt. Dedupen under er bare for å slippe et
 * unødvendig nettverkskall per token-fornyelse.
 */

type SessionLike = { user: MinimalUser } | null;

export interface AuthStateClient extends ProfileUpsertClient {
  auth: {
    getSession(): PromiseLike<{ data: { session: SessionLike } }>;
    onAuthStateChange(callback: (event: string, session: SessionLike) => void): {
      data: { subscription: { unsubscribe(): void } };
    };
  };
}

/**
 * Ett forsøk per bruker per sidelast. Vi lagrer selve løftet, ikke et flagg,
 * slik at to samtidige kall (getSession og SIGNED_IN kommer nesten samtidig)
 * deler ett nettverkskall i stedet for å kappes.
 */
const attempts = new Map<string, Promise<EnsureProfileResult>>();

/** Kun for tester — produksjonskoden skal aldri trenge å tømme cachen. */
export function resetProfileSelfHealCache(): void {
  attempts.clear();
}

/**
 * Kaller ensureProfile én gang per bruker. Mislykkes den, glemmes forsøket,
 * slik at neste økthendelse får prøve på nytt — en nettverksfeil skal ikke
 * låse brukeren ute resten av sidelasten.
 */
export function ensureProfileOnce(
  supabase: ProfileUpsertClient,
  user: MinimalUser
): Promise<EnsureProfileResult> {
  const pending = attempts.get(user.id);
  if (pending) return pending;

  const attempt = (async () => {
    try {
      const result = await ensureProfile(supabase, user);
      if (result.error) attempts.delete(user.id);
      return result;
    } catch (error) {
      attempts.delete(user.id);
      throw error;
    }
  })();

  attempts.set(user.id, attempt);
  return attempt;
}

/**
 * Henger seg på auth-tilstanden og reparerer profilen for enhver økt som
 * dukker opp — gjenopprettet fra localStorage, fornyet token, OAuth,
 * passordreset eller vanlig innlogging. Returnerer en avmeldingsfunksjon.
 */
export function startProfileSelfHeal(supabase: AuthStateClient): () => void {
  let active = true;

  const heal = (session: SessionLike) => {
    if (!active || !session?.user) return;
    void ensureProfileOnce(supabase, session.user)
      .then((result) => {
        if (result.error) {
          // Brukeren skal ikke miste økten sin fordi en reparasjon feilet,
          // men det må være synlig at den feilet.
          console.warn('ensureProfile failed for signed-in session', result.error.message);
        }
      })
      .catch((error) => {
        console.warn('ensureProfile threw for signed-in session', error);
      });
  };

  // Den viktigste linjen i fila: dekker brukeren som ALLEREDE er logget inn og
  // aldri kommer til å kalle signIn() igjen.
  void supabase.auth.getSession().then(({ data }) => heal(data.session));

  const {
    data: { subscription }
  } = supabase.auth.onAuthStateChange((_event, session) => {
    // supabase-js holder en intern lås mens denne callbacken kjører; kaller vi
    // klienten synkront herfra kan det låse seg. setTimeout(0) slipper låsen
    // først. Dette er en dokumentert felle i supabase-js.
    setTimeout(() => heal(session), 0);
  });

  return () => {
    active = false;
    subscription.unsubscribe();
  };
}
