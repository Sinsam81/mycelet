type Visibility = 'public' | 'approximate' | 'private';

export interface FindingRequest {
  latitude: number;
  longitude: number;
  speciesId: number | null;
  speciesNameOverride: string | null;
  notes: string | null;
  visibility: Visibility;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  isZoneFinding: boolean;
  zoneLabel: string | null;
  zonePrecisionKm: number;
  isNegativeObservation: boolean;
  aiUsed: boolean;
  aiTopSuggestion: string | null;
  aiConfidence: number | null;
  aiRawResponse: unknown | null;
  userConfirmedSpecies: boolean;
}

type ParseResult =
  | { success: true; data: FindingRequest }
  | { success: false; error: string };

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length <= maxLength ? trimmed : undefined;
}

function optionalPositiveInteger(value: unknown): number | null | undefined {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function optionalHttpsUrl(value: unknown): string | null | undefined {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2_048) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function parseFindingRequest(value: unknown): ParseResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { success: false, error: 'Ugyldig funn' };
  }
  const input = value as Record<string, unknown>;

  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { success: false, error: 'Ugyldig breddegrad' };
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { success: false, error: 'Ugyldig lengdegrad' };
  }

  const visibility = input.visibility;
  if (visibility !== 'public' && visibility !== 'approximate' && visibility !== 'private') {
    return { success: false, error: 'Ugyldig synlighet' };
  }

  const speciesId = optionalPositiveInteger(input.speciesId);
  const speciesNameOverride = optionalText(input.speciesNameOverride, 200);
  const notes = optionalText(input.notes, 2_000);
  const imageUrl = optionalHttpsUrl(input.imageUrl);
  const thumbnailUrl = optionalHttpsUrl(input.thumbnailUrl);
  const zoneLabel = optionalText(input.zoneLabel, 120);
  const aiTopSuggestion = optionalText(input.aiTopSuggestion, 200);
  if ([speciesId, speciesNameOverride, notes, imageUrl, thumbnailUrl, zoneLabel, aiTopSuggestion].includes(undefined)) {
    return { success: false, error: 'Et eller flere felt er ugyldige' };
  }

  const isZoneFinding = input.isZoneFinding === true;
  const isNegativeObservation = input.isNegativeObservation === true;
  const zonePrecisionRaw = input.zonePrecisionKm == null ? 5 : Number(input.zonePrecisionKm);
  if (!Number.isInteger(zonePrecisionRaw) || zonePrecisionRaw < 1 || zonePrecisionRaw > 50) {
    return { success: false, error: 'Ugyldig sonepresisjon' };
  }
  if (isZoneFinding && !zoneLabel) {
    return { success: false, error: 'Sonenavn mangler' };
  }
  if (isZoneFinding && visibility !== 'approximate') {
    return { success: false, error: 'Sonefunn må være omtrentlige' };
  }

  const aiUsed = input.aiUsed === true;
  const confidenceRaw = input.aiConfidence == null ? null : Number(input.aiConfidence);
  if (confidenceRaw != null && (!Number.isFinite(confidenceRaw) || confidenceRaw < 0 || confidenceRaw > 1)) {
    return { success: false, error: 'Ugyldig AI-konfidens' };
  }

  let aiRawResponse: unknown | null = input.aiRawResponse ?? null;
  try {
    if (aiRawResponse != null && JSON.stringify(aiRawResponse).length > 25_000) {
      return { success: false, error: 'AI-responsen er for stor' };
    }
  } catch {
    aiRawResponse = null;
  }

  return {
    success: true,
    data: {
      latitude,
      longitude,
      speciesId: speciesId ?? null,
      speciesNameOverride: speciesNameOverride ?? null,
      notes: notes ?? null,
      visibility,
      // A negative observation has nothing to photograph and must never leak a
      // stale positive image URL when a user flips the form toggle.
      imageUrl: isNegativeObservation ? null : (imageUrl ?? null),
      thumbnailUrl: isNegativeObservation ? null : (thumbnailUrl ?? null),
      isZoneFinding,
      zoneLabel: isZoneFinding ? (zoneLabel ?? null) : null,
      zonePrecisionKm: zonePrecisionRaw,
      isNegativeObservation,
      aiUsed,
      aiTopSuggestion: aiUsed ? (aiTopSuggestion ?? null) : null,
      aiConfidence: aiUsed ? confidenceRaw : null,
      aiRawResponse: aiUsed ? aiRawResponse : null,
      userConfirmedSpecies: input.userConfirmedSpecies === true
    }
  };
}
