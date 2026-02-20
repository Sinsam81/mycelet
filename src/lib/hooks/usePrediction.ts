'use client';

import { useQuery } from '@tanstack/react-query';
import { PredictionResponse } from '@/types/prediction';

interface PredictionParams {
  lat: number | null;
  lon: number | null;
  radiusKm?: number;
  speciesId?: number | null;
}

export function usePrediction({ lat, lon, radiusKm = 15, speciesId }: PredictionParams) {
  return useQuery<PredictionResponse>({
    queryKey: ['prediction', lat, lon, radiusKm, speciesId],
    enabled: lat != null && lon != null,
    queryFn: async () => {
      const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lon),
        radiusKm: String(radiusKm)
      });

      if (speciesId != null) {
        params.set('speciesId', String(speciesId));
      }

      const response = await fetch(`/api/prediction?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? 'Kunne ikke hente prediksjon');
      }

      return data as PredictionResponse;
    },
    staleTime: 1000 * 60 * 10
  });
}
