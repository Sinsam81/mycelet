import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import { fetchWeatherSummary } from '@/lib/weather';
import { getForestProperties, buildSpeciesHabitatPreferences } from '@/lib/forest';
import { computeCellPrediction } from '@/lib/prediction/cell-score';
import { dayOfYearOf } from '@/lib/prediction/phenology';
import { weightedOccurrenceDensity } from '@/lib/prediction/occurrences';
import { getElevation } from '@/lib/terrain';
import { computeHabitatScore } from '@/lib/forest';
import { buildSpotSummary } from '@/lib/utils/prediction-explanation';
import type { SpeciesContext } from '@/lib/utils/species-scoring';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';

/**
 * On-demand local heatmap.
 *
 * Samples an n×n grid across the requested bounds and scores each cell with the
 * shared prediction pipeline (real NIBIO forest + current weather + season +
 * per-species fit). The spatially-varying signal in a local view is the FOREST,
 * so we only score cells where NIBIO returns real forest data — cells over
 * water/urban/no-coverage are skipped rather than filled with pseudo-noise.
 * That keeps the heatmap honest (no invented gradients).
 *
 * Expensive (many forest lookups) → premium-gated + tightly rate-limited.
 */

export const runtime = 'nodejs';
// Grid does many forest lookups; give the function headroom (Vercel clamps to
// the plan maximum).
export const maxDuration = 60;

const MAX_N = 7;
const DEFAULT_N = 5;
const FOREST_CONCURRENCY = 16;
const FOREST_TIMEOUT_MS = 2500;

function num(value: string | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/** Resolve to null if the promise doesn't settle within `ms` (or rejects). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

/** Run `fn` over items with at most `limit` in flight at once. */
async function mapWithConcurrency<I, O>(items: I[], limit: number, fn: (item: I) => Promise<O>): Promise<O[]> {
  const results: O[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function inSeason(month: number, start: number, end: number): boolean {
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end; // season wraps the year boundary
}

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const url = new URL(request.url);
  const minLat = num(url.searchParams.get('minLat'));
  const minLng = num(url.searchParams.get('minLng'));
  const maxLat = num(url.searchParams.get('maxLat'));
  const maxLng = num(url.searchParams.get('maxLng'));
  const speciesIdParam = url.searchParams.get('speciesId');
  const speciesId = speciesIdParam ? Number(speciesIdParam) : null;
  const n = Math.max(3, Math.min(MAX_N, Math.round(Number(url.searchParams.get('n'))) || DEFAULT_N));
  const topParam = Math.round(Number(url.searchParams.get('top')));
  const top = Number.isFinite(topParam) && topParam > 0 ? Math.min(20, topParam) : null;

  if (![minLat, minLng, maxLat, maxLng].every(Number.isFinite) || maxLat <= minLat || maxLng <= minLng) {
    return NextResponse.json({ error: 'Ugyldige koordinater' }, { status: 400 });
  }
  // Guard against absurd areas — a country-sized box would make cells meaningless.
  if (maxLat - minLat > 1.5 || maxLng - minLng > 3) {
    return NextResponse.json({ error: 'Zoom inn for å lage heatmap (område for stort)' }, { status: 400 });
  }

  try {
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
    }

    // Many forest lookups per call → tighter bucket than the point endpoint.
    const rl = checkRateLimit(`prediction-grid:${getClientKey(request, user.id)}`, 10, 60);
    if (!rl.allowed) {
      return rateLimitResponse(rl);
    }

    const subscription = await getUserBillingSubscription(supabase, user.id);
    const billing = getBillingCapabilities(subscription);
    const paid = billing.paid;
    // The full heatmap raster stays premium-only (it's the most expensive shape
    // and was deliberately de-scraped in migration 015). Top-spots mode gives
    // free users a teaser instead of a closed door: fewer cells sampled, top 3
    // spots, and no "why" — the upsell is seeing the value, not a 403.
    if (!paid && !top) {
      return NextResponse.json(
        { error: 'Detaljert heatmap krever Premium eller Sesongpass', upsell: true },
        { status: 403 }
      );
    }
    const effectiveN = paid ? n : Math.min(n, 5);
    const effectiveTop = top ? (paid ? top : Math.min(top, 3)) : null;

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const month = new Date().getMonth() + 1;
    const dayOfYear = dayOfYearOf(new Date());

    // Weather is ~uniform across a local view → fetch once for the center.
    const [weather, speciesRes, occRes] = await Promise.all([
      fetchWeatherSummary({ lat: centerLat, lon: centerLng }),
      speciesId
        ? supabase
            .from('mushroom_species')
            .select('id,norwegian_name,latin_name,genus,season_start,season_end,peak_season_start,peak_season_end,habitat,mycorrhizal_partners')
            .eq('id', speciesId)
            .maybeSingle()
        : Promise.resolve(null),
      supabase.rpc('get_occurrences_in_bounds', {
        min_lat: minLat,
        min_lng: minLng,
        max_lat: maxLat,
        max_lng: maxLng,
        p_species_id: speciesId,
        p_limit: 4000
      })
    ]);
    const occurrences = (occRes?.data ?? []) as { latitude: number; longitude: number; species_id: number | null }[];

    if (!weather) {
      return NextResponse.json({ error: 'Værdata ikke tilgjengelig for området' }, { status: 502 });
    }

    const speciesContext: SpeciesContext | null = speciesRes?.data
      ? {
          speciesId: speciesRes.data.id as number,
          latinName: (speciesRes.data.latin_name as string | null) ?? null,
          genus: (speciesRes.data.genus as string | null) ?? null,
          seasonStart: speciesRes.data.season_start as number,
          seasonEnd: speciesRes.data.season_end as number,
          peakSeasonStart: (speciesRes.data.peak_season_start as number | null) ?? null,
          peakSeasonEnd: (speciesRes.data.peak_season_end as number | null) ?? null
        }
      : null;
    const speciesHabitat = speciesRes?.data
      ? buildSpeciesHabitatPreferences({
          mycorrhizalPartners: (speciesRes.data.mycorrhizal_partners as string[] | null) ?? null,
          habitat: (speciesRes.data.habitat as string[] | null) ?? null
        })
      : null;

    // For the generic (no specific species) "lovende steder" view, also name the
    // most likely species at each top spot. Fetch the in-season candidates once
    // and reuse each cell's already-fetched forest for a cheap per-species score.
    let topSpeciesCandidates: {
      name: string;
      ctx: SpeciesContext;
      habitat: ReturnType<typeof buildSpeciesHabitatPreferences>;
    }[] = [];
    if (effectiveTop && paid && !speciesId) {
      const { data: rows } = await supabase
        .from('mushroom_species')
        .select(
          'id,norwegian_name,latin_name,genus,season_start,season_end,peak_season_start,peak_season_end,habitat,mycorrhizal_partners'
        );
      topSpeciesCandidates = (rows ?? [])
        .filter(
          (s) =>
            s.season_start != null &&
            s.season_end != null &&
            inSeason(month, s.season_start as number, s.season_end as number)
        )
        .map((s) => ({
          name: (s.norwegian_name as string | null) ?? 'Sopp',
          ctx: {
            speciesId: s.id as number,
            latinName: (s.latin_name as string | null) ?? null,
            genus: (s.genus as string | null) ?? null,
            seasonStart: s.season_start as number,
            seasonEnd: s.season_end as number,
            peakSeasonStart: (s.peak_season_start as number | null) ?? null,
            peakSeasonEnd: (s.peak_season_end as number | null) ?? null
          },
          habitat: buildSpeciesHabitatPreferences({
            mycorrhizalPartners: (s.mycorrhizal_partners as string[] | null) ?? null,
            habitat: (s.habitat as string[] | null) ?? null
          })
        }));
    }

    const latSpan = (maxLat - minLat) / effectiveN;
    const lngSpan = (maxLng - minLng) / effectiveN;
    const cellCenters: { lat: number; lng: number }[] = [];
    for (let row = 0; row < effectiveN; row++) {
      for (let col = 0; col < effectiveN; col++) {
        cellCenters.push({
          lat: minLat + latSpan * (row + 0.5),
          lng: minLng + lngSpan * (col + 0.5)
        });
      }
    }

    const weatherInput = {
      temperature: weather.temperatureC,
      humidity: weather.humidityPct,
      rain3dMm: weather.rain3dMm,
      soilMoistureIndex: weather.soilMoistureIndex
    };

    const scored = await mapWithConcurrency(cellCenters, FOREST_CONCURRENCY, async (cell) => {
      const [forest, elev] = await Promise.all([
        withTimeout(getForestProperties({ lat: cell.lat, lon: cell.lng }), FOREST_TIMEOUT_MS),
        getElevation({ lat: cell.lat, lon: cell.lng })
      ]);
      // No real forest signal → skip (never invent a gradient).
      if (!forest) return null;
      const nearby = weightedOccurrenceDensity(occurrences, cell.lat, cell.lng);
      const prediction = computeCellPrediction({
        lat: cell.lat,
        lon: cell.lng,
        month,
        dayOfYear,
        weather: weatherInput,
        forest,
        species: speciesContext,
        speciesHabitat,
        recent30d: 0,
        recent365d: 0,
        nearbyOccurrences: nearby,
        elevation: elev?.elevationM ?? null
      });
      return {
        lat: Number(cell.lat.toFixed(5)),
        lng: Number(cell.lng.toFixed(5)),
        score: prediction.score,
        forestType: forest.forestType,
        productivity: forest.productivity,
        forest,
        nearbyOccurrences: nearby,
        elevation: elev?.elevationM ?? null
      };
    });

    type ScoredCell = NonNullable<(typeof scored)[number]>;
    const allCells = scored.filter((c): c is ScoredCell => c !== null);

    const whyWeather = {
      temperatureC: weather.temperatureC,
      humidityPct: weather.humidityPct,
      rain3dMm: weather.rain3dMm,
      rain7dMm: weather.rain7dMm,
      rain14dMm: weather.rain14dMm,
      minTemp7dC: weather.minTemp7dC,
      maxTemp7dC: weather.maxTemp7dC
    };
    const whySpecies = speciesRes?.data
      ? {
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
      : undefined;

    // `top` mode returns the most promising N cells with a persuasive "why" per spot
    // (for "5 lovende steder nær meg"); the default returns lean cells for the heatmap.
    let cells: Record<string, unknown>[];
    if (effectiveTop) {
      const topCells = [...allCells].sort((a, b) => b.score - a.score).slice(0, effectiveTop);
      cells = topCells.map((c) => {
        // Free tier: coordinates and score only — the persuasive "why" and the
        // per-spot species list are the premium half of the feature.
        if (!paid) {
          return { lat: c.lat, lng: c.lng, score: c.score, forestType: c.forestType, productivity: c.productivity };
        }
        const habitat = speciesHabitat ? computeHabitatScore(c.forest, speciesHabitat) : null;
        const summary = buildSpotSummary({
          weather: whyWeather,
          species: whySpecies,
          forest: {
            forestType: c.forest.forestType,
            productivity: c.forest.productivity,
            volumePerHa: c.forest.volumePerHa,
            habitatScore: habitat ? habitat.score : null,
            habitatReasons: habitat ? habitat.reasons : [],
            source: c.forest.source
          },
          nearbyOccurrences: c.nearbyOccurrences,
          month,
          score: c.score
        });
        let topSpecies: string[] = [];
        if (!speciesId && topSpeciesCandidates.length > 0) {
          topSpecies = topSpeciesCandidates
            .map((cand) => ({
              name: cand.name,
              score: computeCellPrediction({
                lat: c.lat,
                lon: c.lng,
                month,
                dayOfYear,
                weather: weatherInput,
                forest: c.forest,
                species: cand.ctx,
                speciesHabitat: cand.habitat,
                recent30d: 0,
                recent365d: 0,
                nearbyOccurrences: c.nearbyOccurrences,
                elevation: c.elevation
              }).score
            }))
            .filter((s) => s.score >= 35)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map((s) => s.name);
        }
        return {
          lat: c.lat,
          lng: c.lng,
          score: c.score,
          forestType: c.forestType,
          productivity: c.productivity,
          verdict: summary.verdict,
          reasons: summary.reasons,
          topSpecies
        };
      });
    } else {
      cells = allCells.map((c) => ({ lat: c.lat, lng: c.lng, score: c.score, forestType: c.forestType, productivity: c.productivity }));
    }

    log.info('prediction.grid.success', {
      n: effectiveN,
      top: effectiveTop,
      paid,
      total: cellCenters.length,
      withForest: allCells.length,
      returned: cells.length,
      weatherSource: weather.source,
      speciesId
    });

    return NextResponse.json({
      cells,
      top: effectiveTop,
      n: effectiveN,
      access: paid ? 'premium_full' : 'free_limited',
      cellLatSpan: latSpan,
      cellLngSpan: lngSpan,
      coverage: cellCenters.length ? allCells.length / cellCenters.length : 0,
      weatherSource: weather.source
    });
  } catch (error) {
    log.error('prediction.grid.failed', error);
    return NextResponse.json(
      { error: 'Kunne ikke lage heatmap', details: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
