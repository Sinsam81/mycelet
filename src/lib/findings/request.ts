import type { FunnFeilKode } from './feil';

export type Visibility = 'public' | 'approximate' | 'private';

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

/**
 * `code` er en stabil feilkode, ikke en tekst. Ruta oversetter den med
 * funnFeilTekst — se feil.ts for hvorfor teksten ikke bor her.
 */
type ParseFailure = { success: false; code: FunnFeilKode; field?: string };

type ParseResult = { success: true; data: FindingRequest } | ParseFailure;

const SPECIES_NAME_MAX = 200;
const NOTES_MAX = 2_000;
const ZONE_LABEL_MAX = 120;
const ZONE_PRECISION_MIN_KM = 1;
const ZONE_PRECISION_MAX_KM = 50;

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length <= maxLength ? trimmed : undefined;
}

/**
 * Number() gjør `true` til 1 og `[5]` til 5. En art eller en sonepresisjon er
 * et tall eller en tallstreng — alt annet er en feil hos avsenderen, og skal
 * ikke bli til «art nr. 1» i det stille.
 */
function numeric(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

function optionalPositiveInteger(value: unknown): number | null | undefined {
  if (value == null || value === '') return null;
  const parsed = numeric(value);
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

function isVisibility(value: unknown): value is Visibility {
  return value === 'public' || value === 'approximate' || value === 'private';
}

function isZonePrecision(value: number): boolean {
  return Number.isInteger(value) && value >= ZONE_PRECISION_MIN_KM && value <= ZONE_PRECISION_MAX_KM;
}

export function parseFindingRequest(value: unknown): ParseResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { success: false, code: 'invalid_body' };
  }
  const input = value as Record<string, unknown>;

  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { success: false, code: 'invalid_latitude' };
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { success: false, code: 'invalid_longitude' };
  }

  const visibility = input.visibility;
  if (!isVisibility(visibility)) {
    return { success: false, code: 'invalid_visibility' };
  }

  const speciesId = optionalPositiveInteger(input.speciesId);
  const speciesNameOverride = optionalText(input.speciesNameOverride, SPECIES_NAME_MAX);
  const notes = optionalText(input.notes, NOTES_MAX);
  const imageUrl = optionalHttpsUrl(input.imageUrl);
  const thumbnailUrl = optionalHttpsUrl(input.thumbnailUrl);
  const zoneLabel = optionalText(input.zoneLabel, ZONE_LABEL_MAX);
  const aiTopSuggestion = optionalText(input.aiTopSuggestion, 200);
  if ([speciesId, speciesNameOverride, notes, imageUrl, thumbnailUrl, zoneLabel, aiTopSuggestion].includes(undefined)) {
    return { success: false, code: 'invalid_fields' };
  }

  const isZoneFinding = input.isZoneFinding === true;
  const isNegativeObservation = input.isNegativeObservation === true;
  const zonePrecisionRaw = input.zonePrecisionKm == null ? 5 : numeric(input.zonePrecisionKm);
  if (!isZonePrecision(zonePrecisionRaw)) {
    return { success: false, code: 'invalid_zone_precision' };
  }
  if (isZoneFinding && !zoneLabel) {
    return { success: false, code: 'zone_label_missing' };
  }
  if (isZoneFinding && visibility !== 'approximate') {
    return { success: false, code: 'zone_requires_approximate' };
  }

  const aiUsed = input.aiUsed === true;
  const confidenceRaw = input.aiConfidence == null ? null : Number(input.aiConfidence);
  if (confidenceRaw != null && (!Number.isFinite(confidenceRaw) || confidenceRaw < 0 || confidenceRaw > 1)) {
    return { success: false, code: 'invalid_ai_confidence' };
  }

  let aiRawResponse: unknown | null = input.aiRawResponse ?? null;
  try {
    if (aiRawResponse != null && JSON.stringify(aiRawResponse).length > 25_000) {
      return { success: false, code: 'ai_response_too_large' };
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

/**
 * Det eieren kan endre på et funn som allerede er lagret.
 *
 * Et felt som mangler i patchen, røres ikke. Delingen er ÉN enhet og ikke fire
 * løse felt: `deling` finnes bare når `visibility` er oppgitt, og beskriver da
 * hele målet — et utelatt `isZoneFinding` betyr «ikke sone», som ved lagring
 * av et nytt funn. Slik kan ingen forespørsel havne halvveis mellom to nivåer.
 */
export interface FindingPatch {
  deling?: {
    visibility: Visibility;
    isZoneFinding: boolean;
    /** Alltid satt når isZoneFinding er sann, ellers null. */
    zoneLabel: string | null;
    /**
     * undefined = rutestørrelsen raden står med — den eneste som er lov. En
     * annen verdi avvises av planleggeren (delingsendring.ts, «SONERUTA»).
     * Aldri satt når isZoneFinding er usann.
     */
    zonePrecisionKm?: number;
  };
  speciesId?: number | null;
  speciesNameOverride?: string | null;
  notes?: string | null;
}

type PatchResult = { success: true; data: FindingPatch } | ParseFailure;

const SHARING_KEYS = ['visibility', 'isZoneFinding', 'zoneLabel', 'zonePrecisionKm'] as const;
const PATCH_KEYS: ReadonlySet<string> = new Set([...SHARING_KEYS, 'speciesId', 'speciesNameOverride', 'notes']);

/**
 * Posisjonsfelt får sin egen feilkode, så klienten kan si HVORFOR i stedet for
 * «ukjent felt». De er listet for meldingens skyld — sperren er hvitelista
 * over, ikke denne lista.
 */
const POSITION_KEYS: ReadonlySet<string> = new Set([
  'latitude',
  'longitude',
  'lat',
  'lng',
  'lon',
  'display_latitude',
  'display_longitude',
  'displayLatitude',
  'displayLongitude'
]);

/**
 * Validerer en PATCH mot /api/findings/:id.
 *
 * HVITELISTE, ikke svarteliste. Alt som ikke står i PATCH_KEYS avvises —
 * også felt som i dag er harmløse — fordi ruta ellers ville godtatt det neste
 * feltet noen la til i findings uten at noen tok stilling til det. Særlig:
 *
 *  · latitude/longitude kan ALDRI endres her. En flyttet posisjon stempler
 *    display_* på nytt (migrasjon 042), og et funn som «flyttes» fram og
 *    tilbake ville gitt et nytt jitter-punkt hver gang.
 *  · display_*, bilde-URL-er, found_at og ai_* er ikke brukerens å endre i
 *    etterkant: de er henholdsvis maskeringen, en fil i Storage, tidspunktet
 *    vær- og habitatøyeblikksbildet hører til, og AI-kvotens regnskap.
 *
 * Reglene for sone er de samme som ved lagring: sone ⇒ 'approximate', og en
 * sone må ha et navn.
 */
export function parseFindingPatch(value: unknown): PatchResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { success: false, code: 'invalid_body' };
  }
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);

  for (const key of keys) {
    if (PATCH_KEYS.has(key)) continue;
    return { success: false, code: POSITION_KEYS.has(key) ? 'position_not_editable' : 'unknown_field', field: key };
  }
  if (keys.length === 0) return { success: false, code: 'empty_patch' };

  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);
  const data: FindingPatch = {};

  if (has('visibility')) {
    const visibility = input.visibility;
    if (!isVisibility(visibility)) return { success: false, code: 'invalid_visibility', field: 'visibility' };

    const zoneRaw = input.isZoneFinding;
    if (zoneRaw != null && typeof zoneRaw !== 'boolean') {
      return { success: false, code: 'invalid_fields', field: 'isZoneFinding' };
    }
    const isZoneFinding = zoneRaw === true;

    const zoneLabel = optionalText(input.zoneLabel, ZONE_LABEL_MAX);
    if (zoneLabel === undefined) return { success: false, code: 'invalid_fields', field: 'zoneLabel' };

    // Valideres også når funnet ikke skal være sone: en klient som sender
    // tull her har en feil, og den skal ikke gå stille gjennom.
    let zonePrecisionKm: number | undefined;
    if (input.zonePrecisionKm != null) {
      zonePrecisionKm = numeric(input.zonePrecisionKm);
      if (!isZonePrecision(zonePrecisionKm)) {
        return { success: false, code: 'invalid_zone_precision', field: 'zonePrecisionKm' };
      }
    }

    if (isZoneFinding && visibility !== 'approximate') {
      return { success: false, code: 'zone_requires_approximate', field: 'visibility' };
    }
    if (isZoneFinding && !zoneLabel) {
      return { success: false, code: 'zone_label_missing', field: 'zoneLabel' };
    }

    data.deling = isZoneFinding
      ? { visibility, isZoneFinding: true, zoneLabel, ...(zonePrecisionKm === undefined ? {} : { zonePrecisionKm }) }
      : // Uten sone skrives verken navn eller presisjon. Presisjonen er en av
        // de fem kolonnene triggeren i 042 vokter: å skrive «5» på et
        // omtrentlig funn som står med 3 ville trukket et nytt jitter-punkt.
        { visibility, isZoneFinding: false, zoneLabel: null };
  } else if (SHARING_KEYS.some((key) => has(key))) {
    // Soneinnstillinger uten synlighet sier ikke hvilket nivå som er målet.
    return { success: false, code: 'visibility_required', field: 'visibility' };
  }

  if (has('speciesId')) {
    const speciesId = optionalPositiveInteger(input.speciesId);
    if (speciesId === undefined) return { success: false, code: 'invalid_fields', field: 'speciesId' };
    data.speciesId = speciesId;
  }
  if (has('speciesNameOverride')) {
    const speciesNameOverride = optionalText(input.speciesNameOverride, SPECIES_NAME_MAX);
    if (speciesNameOverride === undefined) {
      return { success: false, code: 'invalid_fields', field: 'speciesNameOverride' };
    }
    data.speciesNameOverride = speciesNameOverride;
  }
  if (has('notes')) {
    const notes = optionalText(input.notes, NOTES_MAX);
    if (notes === undefined) return { success: false, code: 'invalid_fields', field: 'notes' };
    data.notes = notes;
  }

  return { success: true, data };
}
