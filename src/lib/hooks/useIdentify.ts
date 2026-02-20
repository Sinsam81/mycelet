'use client';

import { useMutation } from '@tanstack/react-query';
import { IdentifyResultPayload } from '@/types/identify';

interface IdentifyRequest {
  imageBase64: string;
  originalImageDataUrl: string;
  latitude?: number;
  longitude?: number;
}

export function useIdentify() {
  return useMutation({
    mutationFn: async (payload: IdentifyRequest): Promise<IdentifyResultPayload> => {
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
        throw new Error(data?.error ?? 'Identifikasjon feilet');
      }

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
