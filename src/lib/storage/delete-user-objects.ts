/**
 * Sletter alle bilder en bruker har lastet opp.
 *
 * Bakgrunn: /api/me/delete ryddet bare i databasen. Radene forsvant, auth-
 * brukeren forsvant — men bildene lå igjen i Storage, på offentlige URL-er, i
 * ubestemt tid. En sletting etter GDPR art. 17 som etterlater brukerens egne
 * bilder tilgjengelige er ikke en sletting.
 *
 * Alle opplastinger legger filene under `${user.id}/` (se AddFindingSheet.tsx,
 * forum/new/page.tsx og identify/result/page.tsx), så brukerens mappe er hele
 * settet.
 *
 * Operasjonen er idempotent: å kjøre den to ganger på samme bruker er
 * ufarlig, og andre gang finner den ingenting. Det er med vilje — den kalles
 * fra en flerstegs sletting der brukeren kan komme til å prøve på nytt.
 */

/**
 * Bøttene brukergenererte bilder havner i.
 *
 * identify-history (migrasjon 055) er PRIVAT, i motsetning til de to andre.
 * Den må likevel med her: tjenesterollen ser bort fra RLS, og en art.
 * 17-sletting som lar brukerens egne bilder bli liggende — private eller ikke —
 * er ikke en sletting.
 */
export const USER_IMAGE_BUCKETS = ['finding-images', 'forum-images', 'identify-history'] as const;

/** Supabase paginerer list() på 100 som standard; vi ber om mer per runde. */
const PAGE_SIZE = 1000;

/** Den lille delen av Supabase sitt storage-API vi trenger — gjør dette testbart. */
export interface StorageBucketApi {
  list(
    path: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ data: { name: string }[] | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
}

export interface StorageApi {
  from(bucket: string): StorageBucketApi;
}

export interface DeleteUserObjectsResult {
  /** Antall filer som faktisk ble fjernet. */
  removed: number;
  /** Bøtter der noe gikk galt, med melding. Tom liste betyr full suksess. */
  failures: { bucket: string; message: string }[];
}

export async function deleteUserStorageObjects(
  storage: StorageApi,
  userId: string,
  buckets: readonly string[] = USER_IMAGE_BUCKETS
): Promise<DeleteUserObjectsResult> {
  let removed = 0;
  const failures: { bucket: string; message: string }[] = [];

  for (const bucket of buckets) {
    try {
      const api = storage.from(bucket);
      let offset = 0;
      // Løkka avslutter normalt når en side ikke er full, eller når mappa er
      // tom. Begge forutsetter at remove() faktisk fjerner det den fikk. Gjør
      // den ikke det — en rettighetsfeil som likevel svarer uten error — ville
      // vi lest samme side i det uendelige. I en serverless-funksjon betyr det
      // en kjøring som går til den blir drept. Taket gjør det umulig.
      let rounds = 0;
      const MAX_ROUNDS = 100; // 100 000 filer per bøtte; ingen ekte bruker er i nærheten

      // Paginer til mappa er tom. Vi lister på nytt fra samme offset etter hver
      // sletting ville vært feil — derfor sletter vi først når hele siden er
      // lest, og går videre bare hvis siden var full.
      for (;;) {
        if (++rounds > MAX_ROUNDS) {
          failures.push({
            bucket,
            message: `avbrutt etter ${MAX_ROUNDS} runder — slettingen ser ut til å ikke gjøre framgang`
          });
          break;
        }
        const { data, error } = await api.list(userId, { limit: PAGE_SIZE, offset });
        if (error) {
          failures.push({ bucket, message: error.message });
          break;
        }
        const names = data ?? [];
        if (names.length === 0) break;

        const paths = names.map((entry) => `${userId}/${entry.name}`);
        const { error: removeError } = await api.remove(paths);
        if (removeError) {
          failures.push({ bucket, message: removeError.message });
          break;
        }
        removed += paths.length;

        // Var siden ikke full, finnes det ikke mer. Var den full, står de neste
        // filene nå på offset 0 (vi slettet nettopp de forrige), så vi holder
        // offset uendret og lar løkken lese på nytt.
        if (names.length < PAGE_SIZE) break;
        offset = 0;
      }
    } catch (thrown) {
      failures.push({
        bucket,
        message: thrown instanceof Error ? thrown.message : 'unknown storage failure'
      });
    }
  }

  return { removed, failures };
}
