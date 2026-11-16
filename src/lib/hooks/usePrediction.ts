'use client';

import { useQuery } from '@tanstack/react-query';
import { PredictionResponse } from '@/types/prediction';

interface PredictionParams {
  lat: number | null;
  lon: number | null;
  radiusKm?: number;
  speciesId?: number | null;
}

/** Reserveteksten når svaret ikke bar en egen feilmelding. */
export const PREDIKSJON_FEILTEKST = 'Kunne ikke hente prediksjon';

/**
 * Henter prediksjonen for et punkt. Eksportert for å kunne testes uten React.
 *
 * Svaret tolkes ALDRI ubetinget som JSON. En feil på plattformnivå — Vercels
 * 504 når ruta bruker for lang tid, 502 fra kanten — svarer med en HTML-side,
 * ikke rutas `{ error }`. Da kastet `response.json()` en SyntaxError, og
 * feilteksten ble nettleserens egen («Unexpected token '<', "<!DOCTYPE "… is
 * not valid JSON») i stedet for den norske. Samme felle som useIdentify
 * allerede vokter mot.
 */
export async function hentPrediksjon({
  lat,
  lon,
  radiusKm,
  speciesId
}: {
  lat: number | null;
  lon: number | null;
  radiusKm: number;
  speciesId?: number | null;
}): Promise<PredictionResponse> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    radiusKm: String(radiusKm)
  });

  if (speciesId != null) {
    params.set('speciesId', String(speciesId));
  }

  const response = await fetch(`/api/prediction?${params.toString()}`);
  const data = (await response.json().catch(() => null)) as (PredictionResponse & { error?: string }) | null;

  if (!response.ok || !data) {
    throw new Error(data?.error ?? PREDIKSJON_FEILTEKST);
  }

  return data;
}

export function usePrediction({ lat, lon, radiusKm = 15, speciesId }: PredictionParams) {
  return useQuery<PredictionResponse>({
    queryKey: ['prediction', lat, lon, radiusKm, speciesId],
    enabled: lat != null && lon != null,
    queryFn: () => hentPrediksjon({ lat, lon, radiusKm, speciesId }),
    staleTime: 1000 * 60 * 10
  });
}
