import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import { fetchWeatherSummary } from '@/lib/weather';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import {
  computeAdvancedEnvironmentScore,
  computeAdvancedFactors,
  computeEnvironmentScore,
  computeHistoricalScore,
  computeSeasonalScore,
  computeTotalScore,
  scoreToCondition
} from '@/lib/utils/prediction';
import { computeSpeciesAdjustment, type SpeciesContext } from '@/lib/utils/species-scoring';
import { createRequestLogger } from '@/lib/log/request';

interface FindingRow {
  id: string;
  species_id: number | null;
  display_lat: number | null;
  display_lng: number | null;
  found_at: string;
}

interface PredictionTileRow {
  id: string;
  center_lat: number;
  center_lng: number;
  score: number;
  confidence: number | null;
  components: {
    vegetation?: number;
    moisture?: number;
    terrain?: number;
    history?: number;
    [key: string]: number | undefined;
  } | null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function toFreeFactor(value: number) {
  return Math.round(value / 5) * 5;
}

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  const radiusKm = Number(url.searchParams.get('radiusKm') ?? '15');
  const speciesIdParam = url.searchParams.get('speciesId');
  const speciesId = speciesIdParam ? Number(speciesIdParam) : null;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    log.warn('prediction.bad_coordinates', { lat, lon });
    return NextResponse.json({ error: 'Ugyldige koordinater' }, { status: 400 });
  }

  log.info('prediction.start', { lat, lon, radiusKm, speciesId });

  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLng = lon - lonDelta;
  const maxLng = lon + lonDelta;

  try {
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    // Rate limit BEFORE the external weather + RPC calls. /api/prediction
    // is reachable while logged out (returns generic data) — IP-based
    // bucket for anonymous traffic, user-id bucket once authenticated.
    // 60/min is generous for a user panning a map; stops abuse loops.
    const rateLimit = checkRateLimit(`prediction:${getClientKey(request, user?.id ?? null)}`, 60, 60);
    if (!rateLimit.allowed) {
      log.warn('prediction.rate_limited', { retryAfterSeconds: rateLimit.retryAfterSeconds });
      return rateLimitResponse(rateLimit);
    }

    const subscription = user ? await getUserBillingSubscription(supabase, user.id) : null;
    const billing = getBillingCapabilities(subscription);
    const premiumPrediction = billing.paid;
    const tileDate = new Date().toISOString().slice(0, 10);

    // Fetch tiles, current weather, and (if a species is requested) species
    // details all in parallel. The tile-path uses weather as informational only
    // (score is precomputed and species-filtered by the RPC), while the
    // fallback path needs weather for score computation AND species details
    // for per-species adjustment.
    const [tileRes, weather, speciesRes] = await Promise.all([
      supabase.rpc('get_prediction_tiles_in_bounds', {
        min_lat: minLat,
        min_lng: minLng,
        max_lat: maxLat,
        max_lng: maxLng,
        p_tile_date: tileDate,
        p_species_id: speciesId
      }),
      fetchWeatherSummary({ lat, lon }),
      speciesId
        ? supabase
            .from('mushroom_species')
            .select(
              'id,norwegian_name,latin_name,genus,season_start,season_end,peak_season_start,peak_season_end,habitat,mycorrhizal_partners'
            )
            .eq('id', speciesId)
            .maybeSingle()
        : Promise.resolve(null)
    ]);

    const speciesContext: SpeciesContext | null = speciesRes?.data
      ? {
          genus: (speciesRes.data.genus as string | null) ?? null,
          seasonStart: speciesRes.data.season_start as number,
          seasonEnd: speciesRes.data.season_end as number,
          peakSeasonStart: (speciesRes.data.peak_season_start as number | null) ?? null,
          peakSeasonEnd: (speciesRes.data.peak_season_end as number | null) ?? null
        }
      : null;

    // Richer summary returned to the client (used by PredictionExplanation
    // to render "hvorfor er dette markert?" lines without a second fetch).
    const speciesSummary = speciesRes?.data
      ? {
          id: speciesRes.data.id as number,
          norwegianName: (speciesRes.data.norwegian_name as string | null) ?? '',
          latinName: (speciesRes.data.latin_name as string | null) ?? '',
          genus: (speciesRes.data.genus as string | null) ?? null,
          seasonStart: speciesRes.data.season_start as number,
          seasonEnd: speciesRes.data.season_end as number,
          peakSeasonStart: (speciesRes.data.peak_season_start as number | null) ?? null,
          peakSeasonEnd: (speciesRes.data.peak_season_end as number | null) ?? null,
          habitat: (speciesRes.data.habitat as string[] | null) ?? null,
          mycorrhizalPartners: (speciesRes.data.mycorrhizal_partners as string[] | null) ?? null
        }
      : null;

    if (tileRes.error) {
      log.error('prediction.tile_rpc_failed', tileRes.error);
      return NextResponse.json({ error: tileRes.error.message }, { status: 500 });
    }

    const tiles = (tileRes.data ?? []) as PredictionTileRow[];
    log.debug('prediction.fetched', {
      tileCount: tiles.length,
      hasWeather: weather !== null,
      hasSpecies: speciesContext !== null
    });
    if (tiles.length > 0) {
      const weightedTotals = tiles.reduce(
        (acc, tile) => {
          const confidenceWeight = Math.max(0.2, (tile.confidence ?? 50) / 100);
          acc.weightSum += confidenceWeight;
          acc.scoreSum += tile.score * confidenceWeight;

          const vegetation = Number(tile.components?.vegetation ?? 0);
          const moisture = Number(tile.components?.moisture ?? 0);
          const terrain = Number(tile.components?.terrain ?? 0);
          const history = Number(tile.components?.history ?? 0);

          acc.vegetationSum += vegetation * confidenceWeight;
          acc.moistureSum += moisture * confidenceWeight;
          acc.terrainSum += terrain * confidenceWeight;
          acc.historySum += history * confidenceWeight;
          return acc;
        },
        { scoreSum: 0, vegetationSum: 0, moistureSum: 0, terrainSum: 0, historySum: 0, weightSum: 0 }
      );

      const weightSum = weightedTotals.weightSum || 1;
      const score = Math.round(weightedTotals.scoreSum / weightSum);
      const condition = scoreToCondition(score);
      const seasonal = computeSeasonalScore(new Date().getMonth() + 1);
      const vegetation = Math.round(weightedTotals.vegetationSum / weightSum);
      const moisture = Math.round(weightedTotals.moistureSum / weightSum);
      const terrain = Math.round(weightedTotals.terrainSum / weightSum);
      const soil = clamp(terrain * 0.65 + vegetation * 0.35, 0, 100);
      const weatherTrend = moisture;
      const environment = clamp(
        vegetation * 0.33 + moisture * 0.3 + terrain * 0.17 + soil * 0.1 + weatherTrend * 0.1,
        0,
        100
      );
      const historical = Math.round(weightedTotals.historySum / weightSum);

      const modelFactors = premiumPrediction
        ? { vegetation, moisture, terrain, soil, weatherTrend }
        : {
            vegetation: toFreeFactor(vegetation),
            moisture: toFreeFactor(moisture),
            terrain: toFreeFactor(terrain),
            soil: toFreeFactor(soil),
            weatherTrend: toFreeFactor(weatherTrend)
          };

      const hotspotsFull = tiles
        .map((tile) => ({
          lat: Number(tile.center_lat.toFixed(5)),
          lng: Number(tile.center_lng.toFixed(5)),
          count: 1,
          score: tile.score
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
      const hotspots = premiumPrediction
        ? hotspotsFull
        : hotspotsFull.slice(0, 3).map((spot) => ({
            ...spot,
            lat: Number(spot.lat.toFixed(2)),
            lng: Number(spot.lng.toFixed(2)),
            score: Math.round(spot.score / 5) * 5
          }));

      log.info('prediction.success', {
        source: 'prediction_tiles',
        score,
        condition,
        tileCount: tiles.length,
        weatherSource: weather?.source ?? 'unavailable'
      });

      return NextResponse.json({
        source: 'prediction_tiles',
        access: premiumPrediction ? 'premium_full' : 'free_limited',
        upsellMessage: premiumPrediction ? undefined : 'Gratis viser forenklet heatmap. Oppgrader for full detalj.',
        score,
        condition,
        model: {
          version: 'v2_tiles_weighted',
          factors: modelFactors
        },
        components: {
          environment,
          historical,
          seasonal,
          vegetation: modelFactors.vegetation,
          moisture: modelFactors.moisture,
          terrain: modelFactors.terrain,
          soil: modelFactors.soil,
          weatherTrend: modelFactors.weatherTrend
        },
        weather: weather
          ? {
              temperature: Math.round(weather.temperatureC),
              humidity: Math.round(weather.humidityPct),
              rain3dMm: Math.round(weather.rain3dMm * 10) / 10,
              rain7dMm: weather.rain7dMm != null ? Math.round(weather.rain7dMm * 10) / 10 : null,
              rain14dMm: weather.rain14dMm != null ? Math.round(weather.rain14dMm * 10) / 10 : null,
              minTemp7dC: weather.minTemp7dC,
              maxTemp7dC: weather.maxTemp7dC
            }
          : { temperature: 0, humidity: 0, rain3dMm: 0 },
        counts: {
          findingsInArea: tiles.length,
          recent30d: 0,
          recent365d: 0
        },
        hotspots,
        species: speciesSummary ?? undefined
      });
    }

    // Fallback path requires weather to compute scores (tile-path can do without).
    if (!weather) {
      log.warn('prediction.no_weather_for_fallback', {
        region: lat > 0 ? 'NO/SE/other' : 'unknown'
      });
      return NextResponse.json(
        { error: 'Værdata ikke tilgjengelig for disse koordinatene (mangler API-nøkkel eller stasjonsdata)' },
        { status: 502 }
      );
    }

    const findingsRes = await supabase.rpc('get_findings_in_bounds', {
      min_lat: minLat,
      min_lng: minLng,
      max_lat: maxLat,
      max_lng: maxLng,
      species_filter: speciesId,
      month_filter: null
    });

    const currentTemp = weather.temperatureC;
    const currentHumidity = weather.humidityPct;
    const rain3dMm = weather.rain3dMm;

    const legacyEnvironment = computeEnvironmentScore({
      temperature: currentTemp,
      humidity: currentHumidity,
      rain3dMm
    });

    if (findingsRes.error) {
      log.error('prediction.findings_rpc_failed', findingsRes.error);
      return NextResponse.json({ error: findingsRes.error.message }, { status: 500 });
    }

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const findings = (findingsRes.data ?? []) as FindingRow[];
    const recent30d = findings.filter((f) => now - new Date(f.found_at).getTime() <= 30 * dayMs).length;
    const recent365d = findings.filter((f) => now - new Date(f.found_at).getTime() <= 365 * dayMs).length;

    const historical = computeHistoricalScore(recent30d, recent365d);
    const seasonal = computeSeasonalScore(new Date().getMonth() + 1);
    const advancedFactors = computeAdvancedFactors({
      latitude: lat,
      longitude: lon,
      month: new Date().getMonth() + 1,
      weather: {
        temperature: currentTemp,
        humidity: currentHumidity,
        rain3dMm
      }
    });
    const advancedEnvironment100 = computeAdvancedEnvironmentScore(advancedFactors);
    const environment = clamp(legacyEnvironment * 0.6 + (advancedEnvironment100 / 2) * 0.4, 0, 50);

    const baseScore = computeTotalScore({ environment, historical, seasonal });

    // Per-species adjustment in [0.05, 1.3] when a specific species is
    // requested. Out-of-season → near zero; in-season + good weather → up
    // to 1.3x boost in peak. Tile-path doesn't need this — its scores are
    // already species-aware via the RPC.
    let speciesFit: number | null = null;
    if (speciesContext) {
      speciesFit = computeSpeciesAdjustment(
        speciesContext,
        { temperature: currentTemp, humidity: currentHumidity, rain3dMm },
        new Date().getMonth() + 1
      );
    }

    const score = speciesFit !== null ? clamp(baseScore * speciesFit, 0, 100) : baseScore;
    const condition = scoreToCondition(score);

    const hotspotsMap = new Map<string, { lat: number; lng: number; count: number }>();

    for (const finding of findings) {
      if (finding.display_lat == null || finding.display_lng == null) continue;
      const keyLat = Number(finding.display_lat.toFixed(2));
      const keyLng = Number(finding.display_lng.toFixed(2));
      const key = `${keyLat},${keyLng}`;
      const existing = hotspotsMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        hotspotsMap.set(key, { lat: keyLat, lng: keyLng, count: 1 });
      }
    }

    const hotspotsFull = Array.from(hotspotsMap.values())
      .map((spot) => ({
        ...spot,
        score: Math.min(100, Math.round(score * 0.6 + spot.count * 8))
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    const hotspots = premiumPrediction
      ? hotspotsFull
      : hotspotsFull.slice(0, 3).map((spot) => ({
          ...spot,
          lat: Number(spot.lat.toFixed(2)),
          lng: Number(spot.lng.toFixed(2)),
          score: Math.round(spot.score / 5) * 5
        }));
    const modelFactors = premiumPrediction
      ? advancedFactors
      : {
          vegetation: toFreeFactor(advancedFactors.vegetation),
          moisture: toFreeFactor(advancedFactors.moisture),
          terrain: toFreeFactor(advancedFactors.terrain),
          soil: toFreeFactor(advancedFactors.soil),
          weatherTrend: toFreeFactor(advancedFactors.weatherTrend)
        };

    log.info('prediction.success', {
      source: 'computed_fallback',
      score,
      baseScore,
      speciesFit,
      condition,
      weatherSource: weather.source,
      findingsInArea: findings.length
    });

    return NextResponse.json({
      source: 'computed_fallback',
      access: premiumPrediction ? 'premium_full' : 'free_limited',
      upsellMessage: premiumPrediction ? undefined : 'Gratis viser forenklet heatmap. Oppgrader for full detalj.',
      score,
      baseScore,
      speciesFit,
      condition,
      model: {
        version: speciesFit !== null ? 'v2_computed_proxy_with_species' : 'v2_computed_proxy',
        factors: modelFactors
      },
      components: {
        environment,
        historical,
        seasonal,
        vegetation: modelFactors.vegetation,
        moisture: modelFactors.moisture,
        terrain: modelFactors.terrain,
        soil: modelFactors.soil,
        weatherTrend: modelFactors.weatherTrend
      },
      weather: {
        temperature: Math.round(currentTemp),
        humidity: Math.round(currentHumidity),
        rain3dMm: Math.round(rain3dMm * 10) / 10,
        rain7dMm: weather.rain7dMm != null ? Math.round(weather.rain7dMm * 10) / 10 : null,
        rain14dMm: weather.rain14dMm != null ? Math.round(weather.rain14dMm * 10) / 10 : null,
        minTemp7dC: weather.minTemp7dC,
        maxTemp7dC: weather.maxTemp7dC
      },
      counts: {
        findingsInArea: findings.length,
        recent30d,
        recent365d
      },
      hotspots,
      species: speciesSummary ?? undefined
    });
  } catch (error) {
    log.error('prediction.unexpected_failure', error);
    return NextResponse.json(
      {
        error: 'Prediksjon feilet',
        details: error instanceof Error ? error.message : 'unknown'
      },
      { status: 500 }
    );
  }
}
