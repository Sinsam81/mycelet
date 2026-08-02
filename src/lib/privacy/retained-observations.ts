/**
 * Hva som blir liggende igjen etter en kontosletting — og hvor nøyaktig det er.
 *
 * Personvernerklæringen (Personvern.retentionNegativeDesc) lover:
 *
 *   «beholdes i anonymisert form (uten kobling til deg) som treningsdata for
 *    prediksjons-modellen — kun observasjoner med omtrentlig delingsnivå
 *    (±500 m); private observasjoner slettes alltid.»
 *
 * To ting må stemme for at den setningen skal være sann:
 *
 *   1. Bare `visibility = 'approximate'` overlever. Slettingen tok tidligere
 *      bare 'private', så også de OFFENTLIGE negative observasjonene ble
 *      liggende — og for dem er display_* lik det eksakte punktet.
 *   2. Radene som blir igjen må faktisk være grovkornet. `latitude`/
 *      `longitude` er det eksakte GPS-punktet brukeren sto på;
 *      `display_latitude`/`display_longitude` er den jitrede kopien som
 *      trigger'n `set_display_location` lager. Uten dette steget beholdt vi
 *      det eksakte punktet med tidsstempel og art.
 *
 * Skulle en rad mangle display-koordinat (skal ikke kunne skje for
 * 'approximate', men vi gjetter ikke), slettes den i stedet. Å slette for
 * mye er aldri et personvernproblem; å beholde et eksakt punkt vi har lovet
 * å grovkorne, er det.
 */

/** Delingsnivået erklæringen sier at vi beholder. */
export const RETAINED_VISIBILITY = 'approximate';

export interface RetainedObservationRow {
  id: string;
  display_latitude: number | null;
  display_longitude: number | null;
}

interface QueryError {
  message: string;
}

/**
 * Den lille delen av Supabase-klienten dette trenger. Egen type så helperen
 * kan testes uten en ekte database.
 */
export interface RetainedObservationsApi {
  from(table: 'findings'): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        eq(column: string, value: unknown): {
          eq(
            column: string,
            value: unknown
          ): Promise<{ data: RetainedObservationRow[] | null; error: QueryError | null }>;
        };
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): Promise<{ error: QueryError | null }>;
    };
    delete(): {
      in(column: string, values: string[]): Promise<{ error: QueryError | null }>;
    };
  };
}

/** Hvor mange rader vi oppdaterer samtidig. Holder responstiden nede uten å åpne hundrevis av forbindelser. */
const UPDATE_BATCH = 25;

/**
 * Skriver den grovkornede posisjonen inn som den eneste posisjonen på
 * observasjonene som overlever slettingen.
 *
 * Returnerer null ved suksess, ellers en feilmelding. Steget er idempotent —
 * andre gang er latitude allerede lik display_latitude, og oppdateringen er
 * et no-op. Det er med vilje: kallstedet ber brukeren prøve på nytt.
 */
export async function coarsenRetainedObservations(
  db: RetainedObservationsApi,
  userId: string
): Promise<string | null> {
  const { data, error } = await db
    .from('findings')
    .select('id, display_latitude, display_longitude')
    .eq('user_id', userId)
    .eq('is_negative_observation', true)
    .eq('visibility', RETAINED_VISIBILITY);

  if (error) return error.message;

  const rows = data ?? [];
  if (rows.length === 0) return null;

  const withoutDisplay = rows.filter(
    (row) => row.display_latitude == null || row.display_longitude == null
  );
  if (withoutDisplay.length > 0) {
    const { error: deleteError } = await db
      .from('findings')
      .delete()
      .in(
        'id',
        withoutDisplay.map((row) => row.id)
      );
    if (deleteError) return deleteError.message;
  }

  const toCoarsen = rows.filter(
    (row) => row.display_latitude != null && row.display_longitude != null
  );

  for (let i = 0; i < toCoarsen.length; i += UPDATE_BATCH) {
    const batch = toCoarsen.slice(i, i + UPDATE_BATCH);
    const results = await Promise.all(
      batch.map((row) =>
        db
          .from('findings')
          .update({ latitude: row.display_latitude, longitude: row.display_longitude })
          .eq('id', row.id)
      )
    );
    const failed = results.find((result) => result.error);
    if (failed?.error) return failed.error.message;
  }

  return null;
}
