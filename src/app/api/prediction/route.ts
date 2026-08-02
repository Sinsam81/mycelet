import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchRpcPaged } from '@/lib/supabase/paged-rpc';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import { fetchWeatherSummary } from '@/lib/weather';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { computeSeasonalScore, scoreToCondition } from '@/lib/utils/prediction';
import type { SpeciesContext } from '@/lib/utils/species-scoring';
import { getForestProperties, buildSpeciesHabitatPreferences } from '@/lib/forest';
import { computeCellPrediction } from '@/lib/prediction/cell-score';
import { bestTilePerCell } from '@/lib/prediction/collapse-tiles';
import { nearestForestTile } from '@/lib/prediction/nearest-forest-tile';
import { dayOfYearOf } from '@/lib/prediction/phenology';
import { weightedOccurrenceDensity, OCCURRENCE_FETCH_LIMIT } from '@/lib/prediction/occurrences';
import { getElevation } from '@/lib/terrain';
import { createRequestLogger } from '@/lib/log/request';
import { getUserLocale } from '@/i18n/locale';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

// The client renders these verbatim (it prefers the server string over its own
// translated fallback), so they follow the reader's language.
const COPY: Record<Locale, { upsell: string; noWeather: string }> = {
  nb: {
    upsell: 'Gratis viser forenklet heatmap. Oppgrader for full detalj.',
    noWeather: 'Værdata ikke tilgjengelig for disse koordinatene (mangler API-nøkkel eller stasjonsdata)'
  },
  sv: {
    upsell: 'Gratisversionen visar en förenklad heatmap. Uppgradera för full detalj.',
    noWeather: 'Väderdata är inte tillgängliga för dessa koordinater (saknar API-nyckel eller stationsdata)'
  }
};

// This route calls two slow, no-SLA external providers (weather + NIBIO forest)
// in series. Pin the runtime and give it real headroom so a slow provider ends
// in a clean JSON error rather than the plan-default (~10-15s) bare 504.
export const runtime = 'nodejs';
export const maxDuration = 30;

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
  /** Rasteret har én rad per art per rute — se bestTilePerCell. */
  species_id: number | null;
  confidence: number | null;
  components: {
    vegetation?: number;
    moisture?: number;
    terrain?: number;
    soil?: number;
    weatherTrend?: number;
    history?: number;
    environment?: number;
    seasonal?: number;
    forest?: { forestType: string; productivity: number | null; volumePerHa: number | null; source: string } | null;
    habitat?: { score: number; reasons: string[] } | null;
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
  // Clamp: an unbounded/NaN radius would build a country-sized (or NaN) bounding
  // box that the RPCs then scan. 1-50 km covers every legitimate use.
  const radiusKm = Math.min(50, Math.max(1, Number(url.searchParams.get('radiusKm')) || 15));
  const speciesIdParam = url.searchParams.get('speciesId');
  const speciesId = speciesIdParam ? Number(speciesIdParam) : null;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    log.warn('prediction.bad_coordinates', { lat, lon });
    return NextResponse.json({ error: 'Ugyldige koordinater' }, { status: 400 });
  }

  // Coarse (~1 km) on purpose — server logs must not hold a position trail.
  log.info('prediction.start', { lat: Number(lat.toFixed(2)), lon: Number(lon.toFixed(2)), radiusKm, speciesId });

  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLng = lon - lonDelta;
  const maxLng = lon + lonDelta;

  try {
    // Explanation text is generated server-side, so it follows the reader's language.
    const locale = await getUserLocale();
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
    // Flisene hentes med tjenestenøkkelen, ikke med kallerens sesjon.
    //
    // Hvorfor: `get_prediction_tiles_in_bounds` er SECURITY DEFINER (migrasjon
    // 003) og returnerer nøyaktig det samme uansett hvem som spør — den er ikke
    // RLS-avhengig. Men fordi ruta er tilgjengelig utlogget, måtte `anon` ha
    // EXECUTE på den. Og anon-nøkkelen er offentlig, så hvem som helst kunne
    // kalle den direkte mot PostgREST og laste ned hele det forhåndsberegnede
    // rasteret — det migrasjon 015 uttrykkelig prøvde å hindre.
    //
    // Med tjenestenøkkelen her trenger ikke `anon` rettigheten lenger, og
    // migrasjon 033 tar den bort. `authenticated` beholder den: kartet kaller
    // RPC-en direkte fra nettleseren for å slippe et rundturskall per panorering.
    //
    // Feiler admin-klienten (manglende nøkkel i miljøet), faller vi tilbake på
    // sesjonsklienten. Da virker alt som før — dette skal ikke kunne ta ned
    // prediksjonen.
    const tileClient = (() => {
      try {
        return createAdminClient();
      } catch {
        log.warn('prediction.tiles.admin_client_unavailable');
        return supabase;
      }
    })();

    const [tileRes, weather, speciesRes] = await Promise.all([
      tileClient.rpc('get_prediction_tiles_in_bounds', {
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
              'id,norwegian_name,swedish_name,latin_name,genus,season_start,season_end,peak_season_start,peak_season_end,habitat,mycorrhizal_partners'
            )
            .eq('id', speciesId)
            .maybeSingle()
        : Promise.resolve(null)
    ]);

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

    // Richer summary returned to the client (used by PredictionExplanation
    // to render "hvorfor er dette markert?" lines without a second fetch).
    const speciesSummary = speciesRes?.data
      ? {
          id: speciesRes.data.id as number,
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
      // Rasteret har én flis PER ART per rute. Uten artsfilter gir RPC-en derfor
      // sju rader på samme koordinat, og et snitt over dem er et snitt på tvers
      // av arter — kantarell 60 og vanlig morkel 2 ble til 19 «svake forhold»
      // midt i kantarellsesongen. Kollaps til beste art per rute FØR alt annet,
      // så snittet igjen er et snitt over steder. Med ?speciesId satt filtrerer
      // RPC-en allerede, og dette er en no-op. Se collapse-tiles.ts.
      const cells = bestTilePerCell(tiles);
      const weightedTotals = cells.reduce(
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
      // Skogen/habitatet som vises i forklaringen: flisa med skogdata som
      // ligger NÆRMEST punktet det ble spurt om — ikke den høyest scorende i
      // hele boksen, som før. Den gamle regelen plukket den beste skogen
      // innenfor ±15 km og kalte den «her»: i Oslo sentrum ble det en ekte
      // NIBIO-måling fra en flis 15,5 km unna. Avstanden følger med ut i
      // svaret, så teksten kan si hvor langt unna dataene faktisk er hentet.
      // Se src/lib/prediction/nearest-forest-tile.ts.
      const nearestForest = nearestForestTile(cells, lat, lon);
      const forestTile: PredictionTileRow | null = nearestForest?.tile ?? null;
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

      const hotspotsFull = cells
        .map((tile) => ({
          lat: Number(tile.center_lat.toFixed(5)),
          lng: Number(tile.center_lng.toFixed(5)),
          count: 1,
          score: tile.score,
          // Hvilken art tallet gjelder. Uten dette er «60/100» på et sted uten
          // mening — det er 60 for kantarell, ikke for sopp som sådan.
          speciesId: tile.species_id ?? null
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

      // Hvilken art som drar tallet. Uten artsfilter er «57/100» ellers et tall
      // uten spørsmål: det er 57 for kantarell akkurat nå, ikke for sopp
      // generelt. Panelet setter navnet ved siden av tallet.
      //
      // Slås opp bare når kalleren IKKE ba om en art — da bærer `species`
      // allerede navnet — og bare når kollapsen faktisk valgte mellom flere.
      let leadingSpecies: { id: number; norwegianName: string; swedishName: string | null } | null = null;
      const leadingId = speciesId == null ? (hotspotsFull[0]?.speciesId ?? null) : null;
      if (leadingId != null) {
        const { data: leadRow, error: leadErr } = await supabase
          .from('mushroom_species')
          .select('id,norwegian_name,swedish_name')
          .eq('id', leadingId)
          .maybeSingle();
        // Feiler oppslaget viser panelet tallet uten navn, som før. Det skal
        // ikke kunne ta ned prediksjonen.
        if (leadErr) log.warn('prediction.leading_species_lookup_failed', { message: leadErr.message });
        if (leadRow) {
          leadingSpecies = {
            id: leadRow.id as number,
            norwegianName: (leadRow.norwegian_name as string | null) ?? '',
            swedishName: (leadRow.swedish_name as string | null) ?? null
          };
        }
      }

      log.info('prediction.success', {
        source: 'prediction_tiles',
        score,
        condition,
        tileCount: tiles.length,
        cellCount: cells.length,
        leadingSpeciesId: leadingSpecies?.id ?? null,
        // Hvor langt unna skogdataene i svaret er hentet. Grov nok til å ikke
        // være et posisjonsspor, presis nok til å se om rasteret er for tynt
        // et sted (da vokser avstanden, og teksten sier det høyt).
        forestDistanceKm: nearestForest ? Number(nearestForest.distanceKm.toFixed(1)) : null,
        weatherSource: weather?.source ?? 'unavailable'
      });

      return NextResponse.json({
        source: 'prediction_tiles',
        access: premiumPrediction ? 'premium_full' : 'free_limited',
        upsellMessage: premiumPrediction ? undefined : (COPY[locale] ?? COPY[DEFAULT_LOCALE]).upsell,
        score,
        condition,
        weatherSource: weather?.source ?? null,
        model: {
          version: 'v4_tiles_honest_occurrence',
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
          // Antall STEDER i boksen, ikke antall rader. Før kollapsen var dette
          // artsantallet ganget med stedsantallet — «14 steder» på Nesodden,
          // der det i virkeligheten er to ruter med sju arter hver.
          findingsInArea: cells.length,
          recent30d: 0,
          recent365d: 0
        },
        // `distanceKm` er hvor langt unna skogdataene faktisk er målt. Uten
        // den leste panelet en flis flere kilometer unna som «skog her».
        // Null betyr «målt i punktet» (fallback-veien slår opp SR16/CORINE
        // direkte) — der, og bare der, er «her» sant.
        forest: nearestForest?.tile.components?.forest
          ? { ...nearestForest.tile.components.forest, distanceKm: Number(nearestForest.distanceKm.toFixed(2)) }
          : null,
        habitat: forestTile?.components?.habitat ?? undefined,
        hotspots,
        leadingSpecies: leadingSpecies ?? undefined,
        species: speciesSummary ?? undefined
      });
    }

    // Fallback path requires weather to compute scores (tile-path can do without).
    if (!weather) {
      log.warn('prediction.no_weather_for_fallback', {
        region: lat > 0 ? 'NO/SE/other' : 'unknown'
      });
      return NextResponse.json(
        { error: (COPY[locale] ?? COPY[DEFAULT_LOCALE]).noWeather },
        { status: 502 }
      );
    }

    const [findingsRes, forest, occRes, elevationData] = await Promise.all([
      supabase.rpc('get_findings_in_bounds', {
        min_lat: minLat,
        min_lng: minLng,
        max_lat: maxLat,
        max_lng: maxLng,
        species_filter: speciesId,
        month_filter: null
      }),
      // Real forest/soil signal: NIBIO SR16 (NO), CORINE forest type (SE), null elsewhere.
      // Timeout-guarded like grid/species-spots: SR16's own 8s timeout could
      // otherwise stall the whole point prediction. Forest is best-effort here
      // (null → v4_computed_neutral_fallback), so a 3s cap degrades gracefully.
      withTimeout(getForestProperties({ lat, lon }), 3000),
      // Real prior finds (GBIF) near the point → "observasjoner nær her" boost.
      // Pagineres forbi PostgREST-taket på 1000 rader; uten det er punktene vi
      // regner tetthet fra et vilkårlig utvalg. Se src/lib/supabase/paged-rpc.ts.
      fetchRpcPaged<{ latitude: number; longitude: number }>(
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
      ),
      // Real terrain elevation (Kartverket) → replaces the pseudo-noise proxy.
      getElevation({ lat, lon })
    ]);
    if (occRes.truncated) {
      log.warn('prediction.occurrences_truncated', {
        limit: OCCURRENCE_FETCH_LIMIT,
        minLat,
        minLng,
        maxLat,
        maxLng
      });
    }
    const nearbyOccurrences = weightedOccurrenceDensity(occRes.rows, lat, lon);

    const currentTemp = weather.temperatureC;
    const currentHumidity = weather.humidityPct;
    const rain3dMm = weather.rain3dMm;
    const month = new Date().getMonth() + 1;

    if (findingsRes.error) {
      log.error('prediction.findings_rpc_failed', findingsRes.error);
      return NextResponse.json({ error: findingsRes.error.message }, { status: 500 });
    }

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const findings = (findingsRes.data ?? []) as FindingRow[];
    const recent30d = findings.filter((f) => now - new Date(f.found_at).getTime() <= 30 * dayMs).length;
    const recent365d = findings.filter((f) => now - new Date(f.found_at).getTime() <= 365 * dayMs).length;

    // Shared scoring — the exact same pipeline the tile generator uses.
    const cell = computeCellPrediction({
      lat,
      lon,
      month,
      dayOfYear: dayOfYearOf(new Date()),
      weather: { temperature: currentTemp, humidity: currentHumidity, rain3dMm, soilMoistureIndex: weather.soilMoistureIndex },
      forest,
      species: speciesContext,
      speciesHabitat: speciesSummary
        ? buildSpeciesHabitatPreferences({
            mycorrhizalPartners: speciesSummary.mycorrhizalPartners,
            habitat: speciesSummary.habitat
          })
        : null,
      recent30d,
      recent365d,
      nearbyOccurrences,
      elevation: elevationData?.elevationM ?? null,
      locale
    });

    const { score, baseScore, speciesFit, habitatFit, habitat: habitatScore, factors: advancedFactors } = cell;
    const { environment, historical, seasonal } = cell.components;
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
      habitatFit,
      forestSource: forest?.source ?? 'none',
      forestType: forest?.forestType ?? null,
      condition,
      weatherSource: weather.source,
      findingsInArea: findings.length
    });

    return NextResponse.json({
      source: 'computed_fallback',
      access: premiumPrediction ? 'premium_full' : 'free_limited',
      upsellMessage: premiumPrediction ? undefined : (COPY[locale] ?? COPY[DEFAULT_LOCALE]).upsell,
      score,
      baseScore,
      speciesFit,
      habitatFit,
      condition,
      weatherSource: weather.source,
      nearbyOccurrences,
      model: {
        version: forest ? 'v4_computed_habitat' : 'v4_computed_neutral_fallback',
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
      forest: forest
        ? {
            forestType: forest.forestType,
            productivity: forest.productivity,
            volumePerHa: forest.volumePerHa,
            source: forest.source,
            // Slått opp live for nøyaktig dette punktet (getForestProperties
            // over), ikke hentet fra en flis i nærheten. Derfor null: ingen
            // avstand å opplyse om, og «Skog her» er sant.
            distanceKm: null
          }
        : null,
      habitat: habitatScore ? { score: habitatScore.score, reasons: habitatScore.reasons } : undefined,
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
