import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchWeatherSummary } from '@/lib/weather';
import { getForestProperties } from '@/lib/forest';
import {
  bestEffortFieldContext,
  buildWeatherSnapshot,
  deriveHabitatTags
} from '@/lib/findings/field-context';
import { parseFindingRequest } from '@/lib/findings/request';
import { roundForProviderLookup } from '@/lib/privacy/provider-precision';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { ensureProfile } from '@/lib/auth/ensure-profile';
import { sikreSonefunn, sonevaktGjelder, SONEVAKT_KOLONNER, type SonevaktKlient } from '@/lib/findings/sonevakt';
import { JITTERVAKT_TILTAK } from '@/lib/findings/jittervakt';
import { funnBeskjedTekst } from '@/lib/findings/feil';
import { funnFeilSvar, lesSprak } from './svar';

export const runtime = 'nodejs';
export const maxDuration = 15;

/** Postgres: foreign_key_violation. Her: findings.user_id → profiles.id. */
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * Owner-scoped finding insert with best-effort field instrumentation.
 * The browser uploads any image first, then this route snapshots weather and
 * public forest attributes while inserting through the user's RLS session.
 */
export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  try {
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return funnFeilSvar('unauthenticated', 401);

    const rateLimit = checkRateLimit(`findings:${getClientKey(request, user.id)}`, 20, 60);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

    const parsed = parseFindingRequest(await request.json().catch(() => null));
    if (!parsed.success) {
      // Koden er stabil, teksten følger leserens språk — se src/lib/findings/feil.ts.
      return funnFeilSvar(parsed.code, 400);
    }

    const finding = parsed.data;
    const capturedAt = new Date().toISOString();
    // Det EKSAKTE punktet lagres hos oss, men forlater oss aldri i full
    // oppløsning: vær- og skogoppslagene er områdeoppslag, og gir samme svar
    // på 3 desimaler. Se src/lib/privacy/provider-precision.ts.
    const lookupPoint = roundForProviderLookup(finding.latitude, finding.longitude);
    const { weather, forest } = await bestEffortFieldContext(
      fetchWeatherSummary(lookupPoint),
      getForestProperties(lookupPoint)
    );

    const insertFinding = () =>
      supabase
        .from('findings')
        .insert({
          user_id: user.id,
          species_id: finding.speciesId,
          species_name_override: finding.speciesNameOverride,
          latitude: finding.latitude,
          longitude: finding.longitude,
          notes: finding.notes,
          visibility: finding.visibility,
          image_url: finding.imageUrl,
          thumbnail_url: finding.thumbnailUrl,
          is_zone_finding: finding.isZoneFinding,
          zone_label: finding.zoneLabel,
          zone_precision_km: finding.zonePrecisionKm,
          is_negative_observation: finding.isNegativeObservation,
          habitat_tags: deriveHabitatTags(forest),
          weather_at_observation: buildWeatherSnapshot(weather, capturedAt),
          ai_used: finding.aiUsed,
          ai_top_suggestion: finding.aiTopSuggestion,
          ai_confidence: finding.aiConfidence,
          ai_raw_response: finding.aiRawResponse,
          user_confirmed_species: finding.userConfirmedSpecies
        })
        // Punktet triggeren stemplet, leses tilbake i samme kall — sonevakta
        // under trenger det for sone-funn (se src/lib/findings/sonevakt.ts).
        .select(SONEVAKT_KOLONNER)
        .single();

    let { data, error } = await insertFinding();

    // Siste skanse. findings.user_id peker på profiles.id, så en konto uten
    // profilrad får 23503 her og brukeren ser bare «Kunne ikke lagre funnet» —
    // uansett hvor mange ganger hen prøver. Nettleseren reparerer normalt dette
    // selv (se profile-self-heal.ts), men den koden kan ha feilet, vært
    // offline, eller kallet kan komme fra en klient som aldri lastet den.
    // Reparer og prøv én gang til, i stedet for å miste funnet.
    if (error?.code === FOREIGN_KEY_VIOLATION) {
      log.warn('findings.missing_profile_repair', { userId: user.id });
      const { error: repairError } = await ensureProfile(supabase, user);
      if (repairError) {
        log.error('findings.profile_repair_failed', {
          code: repairError.code,
          message: repairError.message
        });
      } else {
        ({ data, error } = await insertFinding());
      }
    }

    if (error || !data) {
      log.error('findings.insert_failed', { code: error?.code, message: error?.message });
      return funnFeilSvar('save_failed', 500);
    }

    const instrumentation = {
      weatherCaptured: weather !== null,
      habitatCaptured: forest !== null
    };

    // Sonevakta. Står den gamle triggeren (075 er ikke limt inn), røper sone-
    // punktet funnets eksakte breddegrad — da gjøres funnet privat med en gang,
    // eller slettes om det ikke går. Aldri for private funn eller vanlige funn.
    if (sonevaktGjelder(finding)) {
      const vakt = await sikreSonefunn(supabase as unknown as SonevaktKlient, {
        id: data.id,
        userId: user.id,
        rad: data
      });
      if (vakt.utfall !== 'stemmer') {
        // Én advarsel, uten koordinater: det er nettopp dem vi skjuler.
        log.warn('findings.zone_stamp_unsafe', { grunn: vakt.grunn, utfall: vakt.utfall, tiltak: JITTERVAKT_TILTAK });
      }
      if (vakt.utfall === 'gjort_privat') {
        const locale = await lesSprak();
        log.info('findings.saved', { ...instrumentation, negative: finding.isNegativeObservation, zoneMadePrivate: true });
        return NextResponse.json({
          ok: true,
          id: data.id,
          instrumentation,
          notice: { code: 'zone_saved_private', message: funnBeskjedTekst('zone_saved_private', locale) }
        });
      }
      if (vakt.utfall === 'slettet') {
        log.error('findings.zone_private_failed', { privatFeil: vakt.privatFeil, slettet: true });
        return funnFeilSvar('zone_not_saved', 500);
      }
      if (vakt.utfall === 'sto_igjen') {
        // Verken privat eller sletting gikk. Raden kan stå med et røpende
        // punkt; id-en er med så driften kan rydde den for hånd.
        log.error('findings.zone_private_failed', {
          findingId: data.id,
          privatFeil: vakt.privatFeil,
          slettFeil: vakt.slettFeil,
          slettet: false,
          tiltak: JITTERVAKT_TILTAK
        });
        return funnFeilSvar('save_failed', 500);
      }
    }

    log.info('findings.saved', {
      negative: finding.isNegativeObservation,
      ...instrumentation
    });
    return NextResponse.json({
      ok: true,
      id: data.id,
      instrumentation
    });
  } catch (error) {
    log.error('findings.failed', error);
    return funnFeilSvar('save_failed', 500);
  }
}
