'use client';

import { useMutation } from '@tanstack/react-query';
import { IdentifyResultPayload } from '@/types/identify';

/** Feil fra /api/identify, med rutens `code` bevart. */
export class IdentifyError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'IdentifyError';
    this.code = code;
  }
}
import { trackEvent } from '@/lib/analytics';

interface IdentifyRequest {
  /** Inntil tre bilder av SAMME sopp (hatt, underside, stilk), i visningsrekkefølge. */
  imagesBase64: string[];
  originalImageDataUrls: string[];
  latitude?: number;
  longitude?: number;
}

export function useIdentify() {
  return useMutation({
    mutationFn: async (payload: IdentifyRequest): Promise<IdentifyResultPayload> => {
      trackEvent('identify_started', {
        has_location: payload.latitude !== undefined && payload.longitude !== undefined,
        image_count: payload.imagesBase64.length
      });

      const response = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: payload.imagesBase64,
          latitude: payload.latitude,
          longitude: payload.longitude
        })
      });

      // Plattformnivå-feil (f.eks. Vercels 413 når kroppen passerer 4,5 MB)
      // svarer med HTML, ikke rutens JSON-form — en ubetinget .json() ville
      // kastet SyntaxError og vist rå browser-engelsk for brukeren.
      let data: (Partial<IdentifyResultPayload> & { error?: string; code?: string }) | null = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (!response.ok || data == null) {
        trackEvent('identify_failed', { status: response.status, code: data?.code ?? 'ukjent' });
        // Koden må overleve kastet. Uten den måtte klienten gjenkjenne
        // tilstanden på selve feilteksten — og en oversatt tekst matcher ikke
        // en norsk delstreng, så AI-deaktivert-panelet ville forsvunnet for
        // svenske brukere i det serveren begynte å svare på deres språk.
        throw new IdentifyError(data?.error ?? 'Identifikasjon feilet', data?.code);
      }

      trackEvent('identify_completed', {
        suggestion_count: Array.isArray(data.suggestions) ? data.suggestions.length : 0,
        is_plant: Boolean(data.isPlant)
      });

      return {
        // Første bilde er hero-/funnfotoet; hele lista vises som stripe på
        // resultatsiden så brukeren SER hva som ble analysert.
        originalImageDataUrl: payload.originalImageDataUrls[0],
        originalImageDataUrls: payload.originalImageDataUrls,
        location: {
          latitude: payload.latitude ?? null,
          longitude: payload.longitude ?? null
        },
        suggestions: data.suggestions ?? [],
        isPlant: Boolean(data.isPlant),
        // Serveren setter dette når et oppslag av spiselighet eller
        // forvekslingsarter feilet. Da MÅ resultatsiden si fra — uten flagget
        // ser «vi klarte ikke sjekke» ut nøyaktig som «ingen fare funnet».
        safetyDataIncomplete: Boolean(data.safetyDataIncomplete)
      };
    }
  });
}
