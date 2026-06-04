import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import { fetchWeatherSummary } from '@/lib/weather';
import { getForestProperties, buildSpeciesHabitatPreferences } from '@/lib/forest';
import { computeCellPrediction } from '@/lib/prediction/cell-score';
import type { SpeciesContext } from '@/lib/utils/species-scoring';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';

/**
 * "Soppbilder på kartet" — for each species in season, find the single best
 * spot in the visible area and return its photo + location, so the map can drop
 * a round mushroom photo (Snapchat-style) on each species' prime ground.
 *
 * Efficient: forest (the expensive NIBIO lookup) is fetched ONCE per grid cell
 * and reused across every species — only the cheap in-memory per-species
 * multiplier differs. Cells without real forest are skipped (honest).
 *
 * Premium-gated + rate-limited (many forest lookups).
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

const DEFAULT_N = 6;
const MAX_N = 7;
const MAX_SPECIES = 8;
const FOREST_CONCURRENCY = 16;
const FOREST_TIMEOUT_MS = 2500;

function num(value: string | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

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
  const n = Math.max(3, Math.min(MAX_N, Math.round(Number(url.searchParams.get('n'))) || DEFAULT_N));

  if (![minLat, minLng, maxLat, maxLng].every(Number.isFinite) || maxLat <= minLat || maxLng <= minLng) {
    return NextResponse.json({ error: 'Ugyldige koordinater' }, { status: 400 });
  }
  if (maxLat - minLat > 1.5 || maxLng - minLng > 3) {
    return NextResponse.json({ error: 'Zoom inn (område for stort)' }, { status: 400 });
  }

  try {
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
    }

    const rl = checkRateLimit(`prediction-species-spots:${getClientKey(request, user.id)}`, 10, 60);
    if (!rl.allowed) {
      return rateLimitResponse(rl);
    }

    const subscription = await getUserBillingSubscription(supabase, user.id);
    const billing = getBillingCapabilities(subscription);
    if (!billing.paid) {
      return NextResponse.json({ error: 'Soppbilder på kartet krever Premium eller Sesongpass', upsell: true }, { status: 403 });
    }

    const month = new Date().getMonth() + 1;

    const { data: speciesRows } = await supabase
      .from('mushroom_species')
      .select(
        'id,norwegian_name,latin_name,genus,season_start,season_end,peak_season_start,peak_season_end,habitat,mycorrhizal_partners,primary_image_url'
      )
      .not('primary_image_url', 'is', null);

    const candidates = (speciesRows ?? [])
      .filter(
        (s) =>
          s.season_start != null &&
          s.season_end != null &&
          inSeason(month, s.season_start as number, s.season_end as number)
      )
      .slice(0, MAX_SPECIES);

    if (candidates.length === 0) {
      return NextResponse.json({ spots: [], message: 'Ingen arter med bilde er i sesong nå.' });
    }

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const weather = await fetchWeatherSummary({ lat: centerLat, lon: centerLng });
    if (!weather) {
      return NextResponse.json({ error: 'Værdata ikke tilgjengelig for området' }, { status: 502 });
    }

    const latSpan = (maxLat - minLat) / n;
    const lngSpan = (maxLng - minLng) / n;
    const cellCenters: { lat: number; lng: number }[] = [];
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        cellCenters.push({ lat: minLat + latSpan * (row + 0.5), lng: minLng + lngSpan * (col + 0.5) });
      }
    }

    // Fetch forest ONCE per cell (the expensive part); reuse across all species.
    const forested = await mapWithConcurrency(cellCenters, FOREST_CONCURRENCY, async (cell) => {
      const forest = await withTimeout(getForestProperties({ lat: cell.lat, lon: cell.lng }), FOREST_TIMEOUT_MS);
      if (!forest) return null;
      return { lat: cell.lat, lng: cell.lng, forest };
    });
    const cells = forested.filter((c): c is NonNullable<typeof c> => c !== null);

    if (cells.length === 0) {
      return NextResponse.json({ spots: [], message: 'Fant lite skogdata her — prøv et område med mer skog.' });
    }

    const weatherInput = {
      temperature: weather.temperatureC,
      humidity: weather.humidityPct,
      rain3dMm: weather.rain3dMm
    };

    const spots: {
      speciesId: number;
      norwegianName: string;
      latinName: string;
      imageUrl: string;
      lat: number;
      lng: number;
      score: number;
    }[] = [];

    for (const sp of candidates) {
      const ctx: SpeciesContext = {
        latinName: (sp.latin_name as string | null) ?? null,
        genus: (sp.genus as string | null) ?? null,
        seasonStart: sp.season_start as number,
        seasonEnd: sp.season_end as number,
        peakSeasonStart: (sp.peak_season_start as number | null) ?? null,
        peakSeasonEnd: (sp.peak_season_end as number | null) ?? null
      };
      const speciesHabitat = buildSpeciesHabitatPreferences({
        mycorrhizalPartners: (sp.mycorrhizal_partners as string[] | null) ?? null,
        habitat: (sp.habitat as string[] | null) ?? null
      });

      let best: { lat: number; lng: number; score: number } | null = null;
      for (const cell of cells) {
        const prediction = computeCellPrediction({
          lat: cell.lat,
          lon: cell.lng,
          month,
          weather: weatherInput,
          forest: cell.forest,
          species: ctx,
          speciesHabitat,
          recent30d: 0,
          recent365d: 0
        });
        if (!best || prediction.score > best.score) {
          best = { lat: cell.lat, lng: cell.lng, score: prediction.score };
        }
      }

      if (best && best.score > 0) {
        spots.push({
          speciesId: sp.id as number,
          norwegianName: (sp.norwegian_name as string | null) ?? '',
          latinName: (sp.latin_name as string | null) ?? '',
          imageUrl: sp.primary_image_url as string,
          lat: Number(best.lat.toFixed(5)),
          lng: Number(best.lng.toFixed(5)),
          score: best.score
        });
      }
    }

    // Best species first.
    spots.sort((a, b) => b.score - a.score);

    log.info('prediction.species_spots.success', {
      candidates: candidates.length,
      spots: spots.length,
      cells: cells.length,
      weatherSource: weather.source
    });

    return NextResponse.json({ spots, weatherSource: weather.source });
  } catch (error) {
    log.error('prediction.species_spots.failed', error);
    return NextResponse.json(
      { error: 'Kunne ikke hente soppbilder', details: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
