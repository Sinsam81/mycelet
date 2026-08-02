import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchRpcPaged } from '@/lib/supabase/paged-rpc';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import { fetchWeatherSamplesForBounds, nearestWeatherSample, weatherSourceSummary } from '@/lib/weather/samples';
import { getForestProperties, buildSpeciesHabitatPreferences } from '@/lib/forest';
import { computeCellPrediction } from '@/lib/prediction/cell-score';
import { dayOfYearOf } from '@/lib/prediction/phenology';
import { weightedOccurrenceDensity, countWithinKm, OCCURRENCE_FETCH_LIMIT } from '@/lib/prediction/occurrences';
import { buildAreaReport, summariseNeighbourhood } from '@/lib/prediction/area-report';
import { getElevation } from '@/lib/terrain';
import { computeHabitatScore } from '@/lib/forest';
import { buildSpotSummary } from '@/lib/utils/prediction-explanation';
import type { SpeciesContext } from '@/lib/utils/species-scoring';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { getUserLocale } from '@/i18n/locale';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import { isRecommendableSpecies } from '@/lib/prediction/recommendable';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

// Surfaced verbatim as toasts on the map, so they follow the reader's language.
const COPY: Record<
  Locale,
  {
    premiumRequired: string;
    noWeather: string;
    speciesFallback: string;
    badCoordinates: string;
    zoomIn: string;
    notAuthenticated: string;
    failed: string;
  }
> = {
  nb: {
    premiumRequired: 'Detaljert heatmap krever Premium eller Sesongpass',
    noWeather: 'Værdata ikke tilgjengelig for området',
    speciesFallback: 'Sopp',
    badCoordinates: 'Ugyldige koordinater',
    zoomIn: 'Zoom inn for å lage heatmap (område for stort)',
    notAuthenticated: 'Ikke innlogget',
    failed: 'Kunne ikke lage heatmap'
  },
  sv: {
    premiumRequired: 'Detaljerad heatmap kräver Premium eller Säsongspass',
    noWeather: 'Väderdata är inte tillgängliga för området',
    speciesFallback: 'Svamp',
    badCoordinates: 'Ogiltiga koordinater',
    zoomIn: 'Zooma in för att skapa heatmap (området är för stort)',
    notAuthenticated: 'Inte inloggad',
    failed: 'Kunde inte skapa heatmap'
  }
};

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
/** Én breddegrad i km. Brukes bare til å si hvor stor rute en nål står for. */
const KM_PER_DEGREE_LAT = 111.32;
/** Radius områderapporten teller registrerte funn innenfor. */
const FINDINGS_RADIUS_KM = 0.5;

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
  // Kartet viser feilstrengene rått som toast (MushroomMap.tsx), så språket må
  // hentes FØR valideringen — ellers får en svensk bruker norsk feiltekst.
  const locale = await getUserLocale();
  const copy = COPY[locale] ?? COPY[DEFAULT_LOCALE];
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
    return NextResponse.json({ error: copy.badCoordinates }, { status: 400 });
  }
  // Guard against absurd areas — a country-sized box would make cells meaningless.
  if (maxLat - minLat > 1.5 || maxLng - minLng > 3) {
    return NextResponse.json({ error: copy.zoomIn }, { status: 400 });
  }

  try {
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: copy.notAuthenticated }, { status: 401 });
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
        { error: copy.premiumRequired, upsell: true },
        { status: 403 }
      );
    }
    const effectiveN = paid ? n : Math.min(n, 5);
    const effectiveTop = top ? (paid ? top : Math.min(top, 3)) : null;

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const month = new Date().getMonth() + 1;
    const dayOfYear = dayOfYearOf(new Date());

    const bounds = { minLat, minLng, maxLat, maxLng };
    const [weatherSamples, speciesRes, occRes] = await Promise.all([
      fetchWeatherSamplesForBounds(bounds),
      speciesId
        ? supabase
            .from('mushroom_species')
            .select('id,norwegian_name,swedish_name,latin_name,genus,season_start,season_end,peak_season_start,peak_season_end,habitat,mycorrhizal_partners')
            .eq('id', speciesId)
            .maybeSingle()
        : Promise.resolve(null),
      // Pagineres forbi PostgREST-taket på 1000 rader — ellers får cellene i
      // rutenettet nærhets-boost fra et vilkårlig (og artsskjevt) utvalg av
      // observasjonene, uten at noe sier fra. Se src/lib/supabase/paged-rpc.ts.
      fetchRpcPaged<{ latitude: number; longitude: number; species_id: number | null }>(
        supabase,
        'get_occurrences_in_bounds',
        {
          min_lat: minLat,
          min_lng: minLng,
          max_lat: maxLat,
          max_lng: maxLng,
          p_species_id: speciesId,
          p_limit: OCCURRENCE_FETCH_LIMIT
        },
        { limit: OCCURRENCE_FETCH_LIMIT }
      )
    ]);
    const occurrences = occRes.rows;
    if (occRes.truncated) {
      log.warn('prediction_grid.occurrences_truncated', {
        limit: OCCURRENCE_FETCH_LIMIT,
        minLat,
        minLng,
        maxLat,
        maxLng
      });
    }
    const centerWeather = nearestWeatherSample(weatherSamples, centerLat, centerLng)?.weather ?? null;
    const weatherSource = weatherSourceSummary(weatherSamples);

    if (!centerWeather) {
      return NextResponse.json({ error: copy.noWeather }, { status: 502 });
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
      // Svelget feil ga tom artsliste og dermed «lovende steder» uten et eneste
      // artsnavn — for en betalende kunde, uten at noe ble logget. Feilen skal
      // i det minste stå i loggen; svaret får stå (stedene er fortsatt ekte).
      const { data: rows, error: rowsErr } = await supabase
        .from('mushroom_species')
        .select(
          'id,norwegian_name,swedish_name,latin_name,genus,season_start,season_end,peak_season_start,peak_season_end,habitat,mycorrhizal_partners,edibility'
        );
      if (rowsErr) log.error('prediction.grid.species_query_failed', rowsErr);
      topSpeciesCandidates = (rows ?? [])
        .filter(
          (s) =>
            s.season_start != null &&
            s.season_end != null &&
            inSeason(month, s.season_start as number, s.season_end as number) &&
            // Only species you may actually pick get named as a reason to walk
            // somewhere. See src/lib/prediction/recommendable.ts.
            isRecommendableSpecies(s.edibility as string | null)
        )
        .map((s) => ({
          name:
            getSpeciesDisplayName(s as { norwegian_name: string | null; swedish_name: string | null }, locale) ||
            copy.speciesFallback,
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

    const weatherInput = (weather: NonNullable<typeof centerWeather>) => ({
      temperature: weather.temperatureC,
      humidity: weather.humidityPct,
      rain3dMm: weather.rain3dMm,
      soilMoistureIndex: weather.soilMoistureIndex
    });

    const scored = await mapWithConcurrency(cellCenters, FOREST_CONCURRENCY, async (cell) => {
      const [forest, elev] = await Promise.all([
        withTimeout(getForestProperties({ lat: cell.lat, lon: cell.lng }), FOREST_TIMEOUT_MS),
        getElevation({ lat: cell.lat, lon: cell.lng })
      ]);
      // No real forest signal → skip (never invent a gradient).
      if (!forest) return null;
      const cellWeather = nearestWeatherSample(weatherSamples, cell.lat, cell.lng)?.weather;
      if (!cellWeather) return null;
      const nearby = weightedOccurrenceDensity(occurrences, cell.lat, cell.lng);
      const prediction = computeCellPrediction({
        lat: cell.lat,
        lon: cell.lng,
        month,
        dayOfYear,
        weather: weatherInput(cellWeather),
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
        weather: cellWeather,
        nearbyOccurrences: nearby,
        elevation: elev?.elevationM ?? null
      };
    });

    type ScoredCell = NonNullable<(typeof scored)[number]>;
    const allCells = scored.filter((c): c is ScoredCell => c !== null);

    const whyWeather = (weather: NonNullable<typeof centerWeather>) => ({
      temperatureC: weather.temperatureC,
      humidityPct: weather.humidityPct,
      humidityEstimated: weather.humidityEstimated,
      rain3dMm: weather.rain3dMm,
      rain7dMm: weather.rain7dMm,
      rain14dMm: weather.rain14dMm,
      minTemp7dC: weather.minTemp7dC,
      maxTemp7dC: weather.maxTemp7dC
    });
    const whySpecies = speciesRes?.data
      ? {
          norwegianName: (speciesRes.data.norwegian_name as string | null) ?? '',
          swedishName: (speciesRes.data.swedish_name as string | null) ?? null,
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

    // Rutestørrelsen i km — områderapporten sier den høyt, fordi nåla står for
    // en RUTE, ikke for et tre. På et 5×5-nett over Nesodden er ruta rundt 3 km bred.
    const cellHeightKm = latSpan * KM_PER_DEGREE_LAT;
    const cellWidthKm = latSpan > 0 ? lngSpan * KM_PER_DEGREE_LAT * Math.cos((centerLat * Math.PI) / 180) : 0;

    /**
     * Radiusen vi kan telle registrerte funn innenfor UTEN å underrapportere:
     * observasjonene er hentet for boksen, så en radius større enn halve ruta
     * ville strekke seg utenfor det vi har hentet for cellene ytterst. Da
     * droppes linja heller enn å oppgi et for lavt tall. Samme hvis
     * observasjonsspørringen ble kuttet av radtaket.
     */
    const findingsRadiusKm =
      !occRes.truncated && Math.min(cellWidthKm, cellHeightKm) / 2 >= FINDINGS_RADIUS_KM
        ? FINDINGS_RADIUS_KM
        : null;

    // Sesongstatusen for arten brukeren filtrerte på, regnet ut av de samme
    // sesongkolonnene rutenettet allerede scorer med.
    const reportSeasonSelected =
      speciesRes?.data && speciesRes.data.season_start != null && speciesRes.data.season_end != null
        ? {
            name:
              getSpeciesDisplayName(
                speciesRes.data as { norwegian_name: string | null; swedish_name: string | null },
                locale
              ) || copy.speciesFallback,
            inSeason: inSeason(month, speciesRes.data.season_start as number, speciesRes.data.season_end as number),
            inPeak:
              speciesRes.data.peak_season_start != null &&
              speciesRes.data.peak_season_end != null &&
              inSeason(
                month,
                speciesRes.data.peak_season_start as number,
                speciesRes.data.peak_season_end as number
              )
          }
        : null;

    // `top` mode returns the most promising N cells with a persuasive "why" per spot
    // (for "5 lovende steder nær meg"); the default returns lean cells for the heatmap.
    let cells: Record<string, unknown>[];
    if (effectiveTop) {
      const topCells = [...allCells].sort((a, b) => b.score - a.score).slice(0, effectiveTop);
      // Nabolaget rapporten sammenligner med: alle rutene i det samme søket som
      // faktisk fikk skogdata. Det er det eneste «rundt her» vi har målt — og
      // når ruta ikke skiller seg fra det, skal rapporten si nettopp det.
      const neighbourhood = summariseNeighbourhood(
        allCells.map((cell) => ({
          score: cell.score,
          forestType: cell.forestType,
          productivity: cell.productivity
        })),
        { cellSizeKm: { widthKm: cellWidthKm, heightKm: cellHeightKm } }
      );
      cells = topCells.map((c) => {
        // Free tier: coordinates and score only — the persuasive "why" and the
        // per-spot species list are the premium half of the feature.
        if (!paid) {
          return { lat: c.lat, lng: c.lng, score: c.score, forestType: c.forestType, productivity: c.productivity };
        }
        const habitat = speciesHabitat ? computeHabitatScore(c.forest, speciesHabitat, locale) : null;
        const summary = buildSpotSummary({
          weather: whyWeather(c.weather),
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
          score: c.score,
          locale
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
                weather: weatherInput(c.weather),
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
        // Områderapporten: en kort, lesbar tekst om OMRÅDET i stedet for en
        // trang boks med score og et par stikkord. Bygges her fordi feltene
        // den trenger (volum, kilde, nedbør, markfukt, funn i nærheten,
        // nabolaget) bare finnes på serveren — og fordi teksten er prosa, og
        // dermed må ha leserens språk tredd inn eksplisitt.
        const report = buildAreaReport({
          score: c.score,
          forest: {
            forestType: c.forest.forestType,
            productivity: c.forest.productivity,
            volumePerHa: c.forest.volumePerHa,
            source: c.forest.source,
            // Rutenettet slår opp skogen i selve punktet nåla står i (SR16 og
            // CORINE er punktoppslag), så avstanden er null. Feltet sendes
            // likevel med: uten det kunne ikke rapporten si HVOR målingen er
            // gjort, og «granskog» ville igjen vært en påstand uten sted.
            distanceKm: 0
          },
          weather: {
            temperatureC: c.weather.temperatureC,
            humidityPct: c.weather.humidityPct,
            humidityEstimated: c.weather.humidityEstimated,
            rain3dMm: c.weather.rain3dMm,
            rain7dMm: c.weather.rain7dMm,
            rain14dMm: c.weather.rain14dMm,
            soilMoistureIndex: c.weather.soilMoistureIndex
          },
          season: reportSeasonSelected ? { selected: reportSeasonSelected } : { topSpecies },
          nearbyFindings:
            findingsRadiusKm != null
              ? { count: countWithinKm(occurrences, c.lat, c.lng, findingsRadiusKm), radiusKm: findingsRadiusKm }
              : null,
          habitatReasons: habitat ? habitat.reasons : [],
          neighbourhood,
          locale
        });
        return {
          lat: c.lat,
          lng: c.lng,
          score: c.score,
          forestType: c.forestType,
          productivity: c.productivity,
          verdict: summary.verdict,
          reasons: summary.reasons,
          topSpecies,
          report
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
      weatherSource,
      weatherSamples: weatherSamples.length,
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
      weatherSource,
      weatherSamples: weatherSamples.length
    });
  } catch (error) {
    log.error('prediction.grid.failed', error);
    return NextResponse.json({ error: copy.failed }, { status: 500 });
  }
}
