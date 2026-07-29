'use client';

import { useMutation } from '@tanstack/react-query';
import { IdentifyResultPayload } from '@/types/identify';
import { trackEvent } from '@/lib/analytics';

interface IdentifyRequest {
  imageBase64: string;
  originalImageDataUrl: string;
  latitude?: number;
  longitude?: number;
}

export function useIdentify() {
  return useMutation({
    mutationFn: async (payload: IdentifyRequest): Promise<IdentifyResultPayload> => {
      trackEvent('identify_started', {
        has_location: payload.latitude !== undefined && payload.longitude !== undefined
      });

      const response = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: payload.imageBase64,
          latitude: payload.latitude,
          longitude: payload.longitude
        })
      });

      const data = await response.json();
      if (!response.ok) {
        trackEvent('identify_failed', { status: response.status });
        throw new Error(data?.error ?? 'Identifikasjon feilet');
      }

      trackEvent('identify_completed', {
        suggestion_count: Array.isArray(data.suggestions) ? data.suggestions.length : 0,
        is_plant: Boolean(data.isPlant)
      });

      return {
        originalImageDataUrl: payload.originalImageDataUrl,
        location: {
          latitude: payload.latitude ?? null,
          longitude: payload.longitude ?? null
        },
        suggestions: data.suggestions ?? [],
        isPlant: Boolean(data.isPlant)
      };
    }
  });
}
