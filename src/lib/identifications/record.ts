import { buildHistoryImagePath } from './config';
import type { IdentifySuggestion } from '@/types/identify';

/**
 * Skriver historikkraden for én vellykket AI-identifisering.
 *
 * Kalles fra /api/identify rett etter at Kindwise har svart, ved siden av
 * kvotetellerraden i ai_identifications. De to er helt frakoblet — se
 * migrasjon 055 for hvorfor de aldri må slås sammen.
 *
 * BEST EFFORT, med vilje: Kindwise-kallet er allerede betalt og kvoteenheten
 * brukt. Feiler denne innsettingen, skal brukeren fortsatt få resultatet sitt.
 * Men den skal være SYNLIG i loggen — Supabase-klienten kaster ikke ved
 * DB-feil, den returnerer { error }, så en feilende insert ville ellers vært
 * usynlig (nøyaktig fella kvotetelleren gikk i før den ble rettet).
 */

/** Den lille delen av Supabase-klienten vi trenger — gjør dette testbart. */
export interface IdentificationInsertApi {
  from(table: string): {
    // PromiseLike, ikke Promise: Supabases spørrebygger er thenable uten å
    // være et ekte Promise.
    insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  };
}

export interface RecordIdentificationInput {
  userId: string;
  suggestions: IdentifySuggestion[];
  latitude?: number;
  longitude?: number;
  imageCount: number;
  safetyDataIncomplete: boolean;
  /** Injiseres i tester; ellers crypto.randomUUID(). */
  id?: string;
}

export interface RecordIdentificationResult {
  /** null når raden ikke ble skrevet — da skal klienten ikke laste opp noe bilde. */
  identificationId: string | null;
  imagePath: string | null;
  error: string | null;
}

export async function recordIdentification(
  db: IdentificationInsertApi,
  input: RecordIdentificationInput
): Promise<RecordIdentificationResult> {
  const top = input.suggestions[0];
  // Uten et toppforslag finnes det ingen historikk verdt navnet, og
  // top_suggestion_name er NOT NULL. Skjer i praksis bare hvis leverandøren
  // svarer med en tom liste.
  if (!top) return { identificationId: null, imagePath: null, error: null };

  // Id-en genereres HER, ikke av databasen, slik at bildestien er kjent med én
  // gang. Alternativet — insert, les id, oppdater image_path — er to
  // rundturer og en ekstra skriverettighet for ingenting.
  const id = input.id ?? crypto.randomUUID();
  const imagePath = buildHistoryImagePath(input.userId, id);

  // try/catch rundt HELE kallet, ikke bare rundt feilverdien: klienten kan
  // kaste før den rekker å returnere { error } (manglende tabell i en eldre
  // deploy, en klient som ikke er ferdig konstruert). Historikken skal aldri
  // kunne ta ned en identifisering brukeren allerede har betalt for.
  try {
    const { error } = await db.from('identifications').insert({
      id,
      user_id: input.userId,
      top_suggestion_name: top.name,
      top_species_id: top.speciesId ?? null,
      top_probability: Math.round(top.probability ?? 0),
      // Hele topp-3 slik ruta returnerte den. Lesestien beriker sikkerhets- og
      // navnefeltene på nytt (se /api/identifications/[id]), men similarImages
      // og rekkefølgen kan ikke gjenskapes, så de må bevares.
      suggestions: input.suggestions,
      safety_data_incomplete: input.safetyDataIncomplete,
      // Det EKSAKTE punktet — se migrasjon 055. Den grovkornede varianten er
      // kun det som sendes til Kindwise.
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      image_path: imagePath,
      image_count: input.imageCount
    });

    if (error) {
      return { identificationId: null, imagePath: null, error: error.message };
    }
    return { identificationId: id, imagePath, error: null };
  } catch (thrown) {
    return {
      identificationId: null,
      imagePath: null,
      error: thrown instanceof Error ? thrown.message : 'ukjent feil ved skriving av historikk'
    };
  }
}
