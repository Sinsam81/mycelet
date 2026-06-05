import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import { fetchWeatherSummary } from '@/lib/weather';
import { getForestProperties, buildSpeciesHabitatPreferences } from '@/lib/forest';
import { computeCellPrediction } from '@/lib/prediction/cell-score';
import { countWithinKm } from '@/lib/prediction/occurrences';
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
    if (!billing.paid) {
      return NextResponse.json(
        { error: 'Detaljert heatmap krever Premium eller Sesongpass', upsell: true },
        { status: 403 }
      );
    }

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const month = new Date().getMonth() + 1;

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

    const latSpan = (maxLat - minLat) / n;
    const lngSpan = (maxLng - minLng) / n;
    const cellCenters: { lat: number; lng: number }[] = [];
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        cellCenters.push({
          lat: minLat + latSpan * (row + 0.5),
          lng: minLng + lngSpan * (col + 0.5)
        });
      }
    }

    const weatherInput = {
      temperature: weather.temperatureC,
      humidity: weather.humidityPct,
      rain3dMm: weather.rain3dMm
    };

    const scored = await mapWithConcurrency(cellCenters, FOREST_CONCURRENCY, async (cell) => {
      const [forest, elev] = await Promise.all([
        withTimeout(getForestProperties({ lat: cell.lat, lon: cell.lng }), FOREST_TIMEOUT_MS),
        getElevation({ lat: cell.lat, lon: cell.lng })
      ]);
      // No real forest signal → skip (never invent a gradient).
      if (!forest) return null;
      const nearby = countWithinKm(occurrences, cell.lat, cell.lng, 4);
      const prediction = computeCellPrediction({
        lat: cell.lat,
        lon: cell.lng,
        month,
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
        nearbyOccurrences: nearby
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

    // `top` mode returns the best N cells with a persuasive "why" per spot
    // (for "5 beste steder nær meg"); the default returns lean cells for the heatmap.
    let cells: Record<string, unknown>[];
    if (top) {
      const topCells = [...allCells].sort((a, b) => b.score - a.score).slice(0, top);
      cells = topCells.map((c) => {
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
        return {
          lat: c.lat,
          lng: c.lng,
          score: c.score,
          forestType: c.forestType,
          productivity: c.productivity,
          verdict: summary.verdict,
          reasons: summary.reasons
        };
      });
    } else {
      cells = allCells.map((c) => ({ lat: c.lat, lng: c.lng, score: c.score, forestType: c.forestType, productivity: c.productivity }));
    }

    log.info('prediction.grid.success', {
      n,
      top,
      total: cellCenters.length,
      withForest: allCells.length,
      returned: cells.length,
      weatherSource: weather.source,
      speciesId
    });

    return NextResponse.json({
      cells,
      top,
      n,
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
