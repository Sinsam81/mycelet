import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { FREE_DAILY_AI_LIMIT } from '@/lib/billing/plans';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { seasonFit, rankOrder } from '@/lib/utils/identify-ranking';

const PLANTID_API_URL = 'https://mushroom.kindwise.com/api/v1/identification';

type PlantIdSuggestion = {
  name: string;
  probability: number;
  similar_images?: Array<{ url: string }>;
  details?: {
    common_names?: string[];
    taxonomy?: Record<string, string>;
    description?: { value?: string };
    edibility?: string;
  };
};

type IdentifyRequest = {
  image: string;
  latitude?: number;
  longitude?: number;
};

function isAiEnabled() {
  const apiKey = process.env.PLANTID_API_KEY;
  return Boolean(apiKey && apiKey !== 'your-api-key-here' && apiKey.length >= 20);
}

export async function GET() {
  return NextResponse.json({ enabled: isAiEnabled() });
}

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  log.info('identify.start');
  try {
    if (!isAiEnabled()) {
      log.warn('identify.ai_disabled');
      return NextResponse.json(
        { error: 'AI-identifikasjon er ikke aktivert ennå.', code: 'ai_disabled' },
        { status: 503 }
      );
    }
    const apiKey = process.env.PLANTID_API_KEY!;

    const supabase = createClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      log.info('identify.unauthenticated');
      return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
    }

    const userLog = log.child({ userId: user.id });

    // Short-term burst protection on top of the daily billing-tier limit
    // below. Stops compromised-account abuse and runaway client loops.
    const rateLimit = checkRateLimit(`identify:${getClientKey(request, user.id)}`, 20, 60);
    if (!rateLimit.allowed) {
      userLog.warn('identify.rate_limited', { retryAfterSeconds: rateLimit.retryAfterSeconds });
      return rateLimitResponse(rateLimit);
    }

    const subscription = await getUserBillingSubscription(supabase, user.id);
    const capabilities = getBillingCapabilities(subscription);

    if (!capabilities.paid) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Count actual identify CALLS in the last 24h (migration 020), not saved
      // finds — counting saves let a user identify-without-saving past the cap.
      let usageCount: number | null = null;
      try {
        const admin = createAdminClient();
        const { count, error: countError } = await admin
          .from('ai_identifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', oneDayAgo);
        if (countError) {
          // Anything other than "table missing" is a real failure.
          if (countError.code !== '42P01') {
            return NextResponse.json({ error: 'Kunne ikke validere rate limit' }, { status: 500 });
          }
        } else {
          usageCount = count ?? 0;
        }
      } catch {
        // Service-role client unavailable — fall through to the legacy count.
      }

      // Fallback (migration 020 not applied yet, or no service key): the old
      // saved-find count, so identify keeps working rather than failing.
      if (usageCount === null) {
        const { count: legacy, error: legacyError } = await supabase
          .from('findings')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('ai_used', true)
          .gte('created_at', oneDayAgo);
        if (legacyError) {
          return NextResponse.json({ error: 'Kunne ikke validere rate limit' }, { status: 500 });
        }
        usageCount = legacy ?? 0;
      }

      if (usageCount >= FREE_DAILY_AI_LIMIT) {
        userLog.info('identify.daily_quota_reached', { used: usageCount, limit: FREE_DAILY_AI_LIMIT });
        return NextResponse.json(
          {
            error: `Gratisbrukere har maks ${FREE_DAILY_AI_LIMIT} identifikasjoner per døgn. Oppgrader til Premium eller Sesongpass for ubegrenset bruk.`
          },
          { status: 429 }
        );
      }
    }

    const body = (await request.json()) as IdentifyRequest;
    if (!body.image) {
      userLog.warn('identify.missing_image');
      return NextResponse.json({ error: 'Bilde mangler' }, { status: 400 });
    }
    // The client sends a ~1500px re-encoded JPEG (well under 2 MB of base64).
    // Reject absurd payloads before paying for a Kindwise call.
    if (typeof body.image !== 'string' || body.image.length > 8_000_000) {
      userLog.warn('identify.image_too_large');
      return NextResponse.json({ error: 'Bildet er for stort' }, { status: 400 });
    }

    userLog.debug('identify.calling_plantid', {
      hasCoordinates: body.latitude != null && body.longitude != null,
      tier: capabilities.tier
    });

    const plantIdResponse = await fetch(PLANTID_API_URL, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        images: [body.image],
        similar_images: true,
        language: 'no',
        details: ['common_names', 'taxonomy', 'description', 'edibility'],
        ...(body.latitude != null && body.longitude != null
          ? {
              latitude: body.latitude,
              longitude: body.longitude
            }
          : {})
      })
    });

    if (!plantIdResponse.ok) {
      userLog.error('identify.plantid_failed', undefined, { status: plantIdResponse.status });
      return NextResponse.json({ error: 'Identifikasjon feilet. Prøv igjen.' }, { status: 502 });
    }

    // Record this successful (cost-incurring) call against the free daily cap.
    // Best-effort + free-only: a logging hiccup must not fail the identification.
    if (!capabilities.paid) {
      try {
        const admin = createAdminClient();
        await admin.from('ai_identifications').insert({ user_id: user.id });
      } catch {
        // counter unavailable / table missing — skip silently
      }
    }

    const plantIdData = await plantIdResponse.json();
    const suggestionsRaw: PlantIdSuggestion[] = plantIdData?.result?.classification?.suggestions ?? [];

    const month = new Date().getMonth() + 1;

    const suggestions = await Promise.all(
      suggestionsRaw.slice(0, 3).map(async (suggestion) => {
        const mapped = {
          name: suggestion.name,
          commonNames: suggestion.details?.common_names ?? [],
          probability: Math.round((suggestion.probability ?? 0) * 100),
          edibility: mapEdibility(suggestion.details?.edibility),
          description: suggestion.details?.description?.value ?? null,
          taxonomy: suggestion.details?.taxonomy ?? null,
          similarImages: (suggestion.similar_images ?? []).slice(0, 3).map((img) => img.url)
        } as {
          name: string;
          commonNames: string[];
          probability: number;
          edibility: string;
          description: string | null;
          taxonomy: Record<string, string> | null;
          similarImages: string[];
          speciesId?: number;
          norwegianName?: string;
          inSeason?: boolean;
          peakSeason?: boolean;
          nearbyFindings: number;
          seasonFactor: number;
          dangerousLookAlikes?: Array<{ name: string; danger: string }>;
        };
        mapped.seasonFactor = 1;
        mapped.nearbyFindings = 0;

        const { data: species } = await supabase
          .from('mushroom_species')
          .select('id,norwegian_name,edibility,season_start,season_end,peak_season_start,peak_season_end')
          .ilike('latin_name', suggestion.name)
          .maybeSingle();

        if (species) {
          mapped.speciesId = species.id;
          mapped.norwegianName = species.norwegian_name;
          mapped.edibility = species.edibility;
          const fit = seasonFit(
            month,
            species.season_start,
            species.season_end,
            species.peak_season_start,
            species.peak_season_end
          );
          mapped.inSeason = fit.inSeason;
          mapped.peakSeason = fit.peakSeason;
          mapped.seasonFactor = fit.factor;
        }

        return mapped;
      })
    );

    const speciesIds = suggestions
      .map((s) => s.speciesId)
      .filter((id): id is number => id != null);

    // SAFETY: surface high/critical look-alikes right in the result (not hidden on
    // the species page). Location-independent, so always run.
    if (speciesIds.length > 0) {
      const { data: lookAlikes } = await supabase
        .from('look_alikes')
        .select('species_id, danger_level, la:mushroom_species!look_alikes_look_alike_id_fkey(norwegian_name)')
        .in('species_id', speciesIds)
        .in('danger_level', ['high', 'critical']);
      const byId = new Map<number, Array<{ name: string; danger: string }>>();
      for (const row of lookAlikes ?? []) {
        const r = row as unknown as {
          species_id: number | null;
          danger_level: string;
          la: { norwegian_name: string } | { norwegian_name: string }[] | null;
        };
        const laObj = Array.isArray(r.la) ? r.la[0] : r.la;
        if (r.species_id == null || !laObj?.norwegian_name) continue;
        const arr = byId.get(r.species_id) ?? [];
        arr.push({ name: laObj.norwegian_name, danger: r.danger_level });
        byId.set(r.species_id, arr);
      }
      for (const s of suggestions) {
        if (s.speciesId != null && byId.has(s.speciesId)) s.dangerousLookAlikes = byId.get(s.speciesId);
      }
    }

    // Count recent nearby finds (privacy-safe display coords from public_findings),
    // then re-rank by local relevance. The re-rank can never bury a poisonous match.
    if (body.latitude != null && body.longitude != null && speciesIds.length > 0) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const delta = 0.25; // ~20-28 km box
      const { data: nearby } = await supabase
        .from('public_findings')
        .select('species_id')
        .in('species_id', speciesIds)
        .gte('found_at', since)
        .gte('display_lat', body.latitude - delta)
        .lte('display_lat', body.latitude + delta)
        .gte('display_lng', body.longitude - delta)
        .lte('display_lng', body.longitude + delta);
      const counts = new Map<number, number>();
      for (const row of nearby ?? []) {
        const sid = (row as { species_id: number | null }).species_id;
        if (sid != null) counts.set(sid, (counts.get(sid) ?? 0) + 1);
      }
      for (const s of suggestions) {
        if (s.speciesId != null) s.nearbyFindings = counts.get(s.speciesId) ?? 0;
      }
    }

    const order = rankOrder(
      suggestions.map((s) => ({
        probability: s.probability,
        edibility: s.edibility,
        seasonFactor: s.seasonFactor,
        nearbyFindings: s.nearbyFindings
      }))
    );
    const ranked = order.map((i) => {
      const s = suggestions[i];
      return {
        name: s.name,
        norwegianName: s.norwegianName,
        commonNames: s.commonNames,
        probability: s.probability,
        edibility: s.edibility,
        description: s.description,
        taxonomy: s.taxonomy,
        similarImages: s.similarImages,
        speciesId: s.speciesId,
        inSeason: s.inSeason,
        peakSeason: s.peakSeason,
        nearbyFindings: s.nearbyFindings,
        dangerousLookAlikes: s.dangerousLookAlikes
      };
    });

    userLog.info('identify.success', {
      suggestionCount: ranked.length,
      topMatch: ranked[0]?.name,
      topProbability: ranked[0]?.probability
    });

    return NextResponse.json({
      suggestions: ranked,
      isPlant: plantIdData?.result?.is_plant?.binary ?? false
    });
  } catch (error) {
    log.error('identify.unexpected_failure', error);
    return NextResponse.json(
      {
        error: 'En feil oppstod. Prøv igjen.',
        details: error instanceof Error ? error.message : 'unknown'
      },
      { status: 500 }
    );
  }
}

function mapEdibility(plantIdEdibility?: string): string {
  const mapping: Record<string, string> = {
    edible: 'edible',
    edible_with_caution: 'conditionally_edible',
    not_edible: 'inedible',
    poisonous: 'toxic',
    highly_poisonous: 'deadly'
  };

  return mapping[plantIdEdibility ?? ''] ?? 'unknown';
}
