'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Navigation, Trash2 } from 'lucide-react';
import { createRoot, Root } from 'react-dom/client';
import { createClient } from '@/lib/supabase/client';
import { useGeolocation } from '@/lib/hooks/useGeolocation';
import { usePrediction } from '@/lib/hooks/usePrediction';
import { useBillingStatus } from '@/lib/hooks/useBilling';
import { PredictionHotspot, PredictionResponse, PredictionTile } from '@/types/prediction';
import { AddFindingSheet } from './AddFindingSheet';
import { FindingPopup } from './FindingPopup';
import { HotspotPanel } from './HotspotPanel';
import { MapFilters, MapFilterState } from './MapFilters';
import { MapFinding } from '@/types/finding';
import { OfflineArea, cacheMapTilesForArea, readOfflineAreas, removeOfflineAreaById, saveOfflineAreas } from '@/lib/utils/offlineMap';
import { buildExplanation } from '@/lib/utils/prediction-explanation';
import { PredictionExplanation } from '@/components/prediction/PredictionExplanation';

type LeafletType = typeof import('leaflet');

const initialFilters: MapFilterState = {
  speciesId: null,
  period: 'month',
  onlyMine: false
};

export function MushroomMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const clusterRef = useRef<any>(null);
  const heatLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const popupRootsRef = useRef<Root[]>([]);
  const loadFindingsRef = useRef<() => Promise<void>>(async () => {});
  const loadPredictionTilesRef = useRef<() => Promise<void>>(async () => {});

  const supabase = useRef(createClient()).current;
  const { latitude, longitude, loading: geoLoading, error: geoError } = useGeolocation();

  const [filters, setFilters] = useState<MapFilterState>(initialFilters);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [predictionCoords, setPredictionCoords] = useState<{ lat: number | null; lon: number | null }>({
    lat: null,
    lon: null
  });
  const [tileHotspots, setTileHotspots] = useState<PredictionHotspot[]>([]);
  const [offlineAreas, setOfflineAreas] = useState<OfflineArea[]>([]);
  const [offlineName, setOfflineName] = useState('');
  const [offlineStatus, setOfflineStatus] = useState<string | null>(null);
  const [offlineBusy, setOfflineBusy] = useState(false);

  const billing = useBillingStatus(true);
  const hasOfflineAccess = billing.data?.capabilities.paid ?? false;
  const showOfflineUpsell = !billing.isLoading && !hasOfflineAccess;

  const prediction = usePrediction({
    lat: predictionCoords.lat,
    lon: predictionCoords.lon,
    speciesId: filters.speciesId
  });

  const cleanupPopupRoots = () => {
    popupRootsRef.current.forEach((root) => root.unmount());
    popupRootsRef.current = [];
  };

  const getHeatColor = (score: number) => {
    if (score >= 80) return '#b91c1c';
    if (score >= 60) return '#ea580c';
    if (score >= 40) return '#eab308';
    return '#65a30d';
  };

  const updateHeatLayer = useCallback(async (data: PredictionResponse | undefined) => {
    const map = mapRef.current;
    const heatLayer = heatLayerRef.current;
    if (!map || !heatLayer) return;

    const leaflet = (await import('leaflet')).default;
    heatLayer.clearLayers();

    for (const spot of data?.hotspots ?? []) {
      const radiusMeters = Math.max(120, Math.min(450, 90 + spot.score * 3));
      const circle = leaflet.circle([spot.lat, spot.lng], {
        radius: radiusMeters,
        color: getHeatColor(spot.score),
        fillColor: getHeatColor(spot.score),
        fillOpacity: 0.2,
        weight: 1
      });

      circle.bindTooltip(`Hotspot ${spot.score}%`, { direction: 'top' });
      heatLayer.addLayer(circle);
    }
  }, []);

  const loadPredictionTiles = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    const bounds = map.getBounds();
    const { data, error } = await supabase.rpc('get_prediction_tiles_in_bounds', {
      min_lat: bounds.getSouth(),
      min_lng: bounds.getWest(),
      max_lat: bounds.getNorth(),
      max_lng: bounds.getEast(),
      p_species_id: filters.speciesId
    });

    if (error) {
      setTileHotspots([]);
      return;
    }

    const tiles = (data ?? []) as PredictionTile[];
    const mapped: PredictionHotspot[] = tiles.slice(0, 80).map((tile) => ({
      lat: tile.center_lat,
      lng: tile.center_lng,
      count: 1,
      score: tile.score
    }));
    setTileHotspots(mapped);
  }, [filters.speciesId, supabase]);

  const focusSavedArea = useCallback((area: OfflineArea) => {
    const map = mapRef.current;
    if (!map) return;

    map.setView([area.centerLat, area.centerLng], area.zoom);
  }, []);

  const deleteSavedArea = useCallback((areaId: string) => {
    const next = removeOfflineAreaById(areaId);
    setOfflineAreas(next);
  }, []);

  const saveCurrentAreaOffline = useCallback(async () => {
    setOfflineStatus(null);

    if (!hasOfflineAccess) {
      setOfflineStatus('Offline-kart er tilgjengelig i Premium eller Sesongpass.');
      return;
    }

    const map = mapRef.current;
    if (!map) {
      setOfflineStatus('Kartet er ikke klart ennå.');
      return;
    }

    const bounds = map.getBounds();
    const center = map.getCenter();
    const zoom = map.getZoom();
    const now = new Date();
    const generatedName = `Område ${now.toLocaleDateString('nb-NO')} ${now.toLocaleTimeString('nb-NO', {
      hour: '2-digit',
      minute: '2-digit'
    })}`;

    const area: OfflineArea = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`,
      name: offlineName.trim() || generatedName,
      centerLat: Number(center.lat.toFixed(6)),
      centerLng: Number(center.lng.toFixed(6)),
      zoom,
      bounds: {
        south: Number(bounds.getSouth().toFixed(6)),
        west: Number(bounds.getWest().toFixed(6)),
        north: Number(bounds.getNorth().toFixed(6)),
        east: Number(bounds.getEast().toFixed(6))
      },
      cachedTiles: 0,
      failedTiles: 0,
      createdAt: now.toISOString()
    };

    setOfflineBusy(true);

    try {
      const zoomLevels = Array.from(new Set([Math.max(8, zoom - 1), zoom, Math.min(18, zoom + 1)]));
      const cacheResult = await cacheMapTilesForArea(area.bounds, zoomLevels);
      const areaWithTiles: OfflineArea = {
        ...area,
        cachedTiles: cacheResult.cached,
        failedTiles: cacheResult.failed
      };

      const next = [areaWithTiles, ...offlineAreas.filter((item) => item.id !== areaWithTiles.id)].slice(0, 8);
      saveOfflineAreas(next);
      setOfflineAreas(next);
      setOfflineName('');

      if (cacheResult.cached === 0 && cacheResult.failed > 0) {
        setOfflineStatus('Kunne ikke cache kartfliser i nettleseren. Området ble lagret, men uten offline-fliser.');
      } else {
        setOfflineStatus(`Område lagret. ${cacheResult.cached} kartfliser klare offline.`);
      }
    } catch {
      setOfflineStatus('Feil under lagring av offline-område.');
    } finally {
      setOfflineBusy(false);
    }
  }, [hasOfflineAccess, offlineAreas, offlineName]);

  const passPeriodFilter = (foundAt: string, period: MapFilterState['period']) => {
    if (period === 'all') return true;
    const now = new Date();
    const foundDate = new Date(foundAt);

    if (period === 'month') {
      return foundDate.getMonth() === now.getMonth() && foundDate.getFullYear() === now.getFullYear();
    }

    if (period === '3months') {
      const threshold = new Date();
      threshold.setMonth(threshold.getMonth() - 3);
      return foundDate >= threshold;
    }

    return foundDate.getFullYear() === now.getFullYear();
  };

  const createMarkerIcon = (leaflet: LeafletType, edibility: MapFinding['edibility']) => {
    const backgroundColor =
      edibility === 'edible' ? '#059669' : edibility === 'toxic' || edibility === 'deadly' ? '#dc2626' : '#6b7280';

    return leaflet.divIcon({
      className: 'custom-marker',
      html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9999px;border:2px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,0.25);color:#fff;background:${backgroundColor};font-size:14px;">🍄</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });
  };

  const loadFindings = useCallback(async () => {
    const map = mapRef.current;
    const clusters = clusterRef.current;
    if (!map || !clusters) return;

    const bounds = map.getBounds();
    const monthFilter = filters.period === 'month' ? new Date().getMonth() + 1 : null;

    const { data, error } = await supabase.rpc('get_findings_in_bounds', {
      min_lat: bounds.getSouth(),
      min_lng: bounds.getWest(),
      max_lat: bounds.getNorth(),
      max_lng: bounds.getEast(),
      species_filter: filters.speciesId,
      month_filter: monthFilter
    });

    if (error) {
      return;
    }

    const findings = (data ?? []) as MapFinding[];
    const filtered = findings.filter((finding) => {
      if (filters.onlyMine && finding.user_id !== currentUserId) return false;
      return passPeriodFilter(finding.found_at, filters.period);
    });

    cleanupPopupRoots();
    clusters.clearLayers();

    const leaflet = (await import('leaflet')).default;

    for (const finding of filtered) {
      if (!finding.display_lat || !finding.display_lng) continue;

      const marker = leaflet.marker([finding.display_lat, finding.display_lng], {
        icon: createMarkerIcon(leaflet, finding.edibility)
      });

      const popupContainer = document.createElement('div');
      const popupRoot = createRoot(popupContainer);
      popupRoot.render(<FindingPopup finding={finding} />);
      popupRootsRef.current.push(popupRoot);

      marker.bindPopup(popupContainer, {
        closeButton: true,
        maxWidth: 320,
        minWidth: 240
      });

      clusters.addLayer(marker);
    }
  }, [currentUserId, filters, supabase]);

  useEffect(() => {
    loadFindingsRef.current = loadFindings;
  }, [loadFindings]);

  useEffect(() => {
    loadPredictionTilesRef.current = loadPredictionTiles;
  }, [loadPredictionTiles]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (!containerRef.current || mapRef.current || !mounted) return;

      const { default: L } = await import('leaflet');
      await import('leaflet.markercluster');

      delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: '/images/ui/marker-icon-2x.png',
        iconUrl: '/images/ui/marker-icon.png',
        shadowUrl: '/images/ui/marker-shadow.png'
      });

      const map = L.map(containerRef.current, {
        center: [latitude ?? 59.91, longitude ?? 10.75],
        zoom: 11,
        zoomControl: false
      });

      L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png', {
        attribution: '&copy; Kartverket',
        maxZoom: 18
      }).addTo(map);

      L.control.zoom({ position: 'topright' }).addTo(map);

      const clusters = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        iconCreateFunction: (cluster) => {
          const count = cluster.getChildCount();
          const size = count < 10 ? 'small' : count < 50 ? 'medium' : 'large';
          return L.divIcon({
            html: `<div class="cluster-${size}">${count}</div>`,
            className: 'marker-cluster',
            iconSize: L.point(40, 40)
          });
        }
      });

      map.addLayer(clusters);
      const heatLayer = L.layerGroup();
      map.addLayer(heatLayer);
      mapRef.current = map;
      clusterRef.current = clusters;
      heatLayerRef.current = heatLayer;

      const onMoveEnd = () => {
        const center = map.getCenter();
        setPredictionCoords({
          lat: Number(center.lat.toFixed(6)),
          lon: Number(center.lng.toFixed(6))
        });
        void loadFindingsRef.current();
        void loadPredictionTilesRef.current();
      };

      map.on('moveend', onMoveEnd);
      onMoveEnd();
      await loadFindingsRef.current();
      await loadPredictionTilesRef.current();
    };

    void init();

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
      }
      cleanupPopupRoots();
      mapRef.current = null;
      clusterRef.current = null;
      heatLayerRef.current = null;
    };
  }, [latitude, longitude]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, [supabase]);

  useEffect(() => {
    setOfflineAreas(readOfflineAreas());
  }, []);

  useEffect(() => {
    if (latitude && longitude && mapRef.current) {
      mapRef.current.setView([latitude, longitude], 13);
    }
  }, [latitude, longitude]);

  useEffect(() => {
    if (latitude != null && longitude != null) {
      setPredictionCoords({ lat: latitude, lon: longitude });
    }
  }, [latitude, longitude]);

  useEffect(() => {
    void loadFindings();
  }, [loadFindings]);

  useEffect(() => {
    void loadPredictionTiles();
  }, [loadPredictionTiles]);

  const panelData = useMemo<PredictionResponse | undefined>(() => {
    if (!prediction.data && tileHotspots.length === 0) return undefined;
    if (!prediction.data && tileHotspots.length > 0) {
      const avgScore = Math.round(tileHotspots.reduce((sum, item) => sum + item.score, 0) / tileHotspots.length);
      return {
        score: avgScore,
        condition: avgScore >= 70 ? 'excellent' : avgScore >= 50 ? 'good' : avgScore >= 30 ? 'moderate' : 'poor',
        components: {
          environment: 0,
          historical: 0,
          seasonal: 0
        },
        weather: {
          temperature: 0,
          humidity: 0,
          rain3dMm: 0
        },
        counts: {
          findingsInArea: tileHotspots.length,
          recent30d: 0,
          recent365d: 0
        },
        hotspots: tileHotspots
      };
    }
    if (tileHotspots.length === 0) return prediction.data;

    // Unreachable in practice — earlier branches handle !prediction.data —
    // but TypeScript can't narrow across multiple early-return branches, so
    // an explicit guard is needed for the spread below.
    if (!prediction.data) return undefined;

    return {
      ...prediction.data,
      hotspots: tileHotspots
    };
  }, [prediction.data, tileHotspots]);

  useEffect(() => {
    const overlayData = panelData ?? prediction.data;
    void updateHeatLayer(overlayData);
  }, [panelData, prediction.data, updateHeatLayer]);

  // Build prediction-explanation lines when the user has selected a species
  // (so /api/prediction's response contains a `species` summary). For the
  // generic no-species view the heatmap is enough; we don't pop a panel up
  // for "is it mushroom weather?".
  const explanationLines = useMemo(() => {
    const data = prediction.data;
    if (!data?.species) return null;
    return buildExplanation({
      weather: {
        temperatureC: data.weather.temperature,
        humidityPct: data.weather.humidity,
        rain3dMm: data.weather.rain3dMm,
        rain7dMm: data.weather.rain7dMm ?? null,
        rain14dMm: data.weather.rain14dMm ?? null,
        minTemp7dC: data.weather.minTemp7dC ?? null,
        maxTemp7dC: data.weather.maxTemp7dC ?? null
      },
      species: data.species,
      month: new Date().getMonth() + 1
    });
  }, [prediction.data]);

  return (
    <div className="relative h-[calc(100vh-8.5rem)] overflow-hidden rounded-xl border border-gray-200">
      <div ref={containerRef} className="h-full w-full" />

      <MapFilters filters={filters} onChange={setFilters} />

      {explanationLines && explanationLines.length > 0 && prediction.data?.species ? (
        <aside className="absolute left-3 top-28 z-[1000] w-72 max-h-[calc(100%-9rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <header className="mb-2">
            <h3 className="text-sm font-semibold text-gray-900">{prediction.data.species.norwegianName}</h3>
            <p className="text-xs italic text-gray-600">{prediction.data.species.latinName}</p>
            <p className="mt-1 text-xs text-gray-700">
              Sannsynlighet:{' '}
              <span className="font-semibold text-gray-900">{prediction.data.score}/100</span>{' '}
              <span className="text-gray-500">({prediction.data.condition})</span>
            </p>
          </header>
          <PredictionExplanation explanations={explanationLines} inline />
          <p className="mt-3 text-[11px] italic text-gray-500">
            Områder som matcher habitatet og værvinduet — ikke en garanti for at det er sopp der.
          </p>
        </aside>
      ) : null}

      <div className="absolute right-3 top-28 z-[1000] w-72 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900">Offline-kart</p>
          {billing.isLoading ? <span className="text-[11px] text-gray-500">Sjekker plan...</span> : null}
        </div>

        {showOfflineUpsell ? (
          <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-2">
            <p className="text-xs text-amber-800">Lagring av kartområder offline krever Premium eller Sesongpass.</p>
            <Link href="/pricing" className="text-xs font-medium text-amber-900 underline">
              Oppgrader plan
            </Link>
          </div>
        ) : null}

        <label className="mt-2 block text-xs font-medium text-gray-700">
          Områdenavn
          <input
            value={offlineName}
            onChange={(event) => setOfflineName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            placeholder="f.eks. Nordmarka øst"
          />
        </label>

        <button
          type="button"
          onClick={() => void saveCurrentAreaOffline()}
          disabled={billing.isLoading || !hasOfflineAccess || offlineBusy}
          className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-forest-800 px-2 py-2 text-xs font-medium text-white hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {offlineBusy ? 'Lagrer...' : 'Lagre kartområde'}
        </button>

        {offlineStatus ? <p className="mt-2 text-[11px] text-gray-700">{offlineStatus}</p> : null}

        <div className="mt-2 max-h-36 space-y-1 overflow-auto">
          {offlineAreas.map((area) => (
            <div key={area.id} className="rounded-lg border border-gray-200 bg-white p-2">
              <p className="truncate text-xs font-medium text-gray-900">{area.name}</p>
              <p className="text-[11px] text-gray-600">
                {area.cachedTiles} fliser • zoom {area.zoom}
              </p>
              <div className="mt-1 flex gap-1">
                <button
                  type="button"
                  onClick={() => focusSavedArea(area)}
                  className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-800 hover:bg-gray-50"
                >
                  <Navigation className="h-3 w-3" />
                  Gå til
                </button>
                <button
                  type="button"
                  onClick={() => deleteSavedArea(area.id)}
                  className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-[11px] text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-3 w-3" />
                  Slett
                </button>
              </div>
            </div>
          ))}
          {offlineAreas.length === 0 ? <p className="text-[11px] text-gray-600">Ingen lagrede områder ennå.</p> : null}
        </div>
      </div>

      <button
        onClick={() => setShowAddSheet(true)}
        className="absolute bottom-4 right-4 z-[1000] h-14 w-14 rounded-full bg-forest-800 text-3xl text-white shadow-xl transition-colors hover:bg-forest-700"
        aria-label="Legg til funn"
      >
        +
      </button>

      {showAddSheet ? (
        <AddFindingSheet
          latitude={latitude}
          longitude={longitude}
          onClose={() => setShowAddSheet(false)}
          onSaved={() => {
            setShowAddSheet(false);
            void loadFindings();
          }}
        />
      ) : null}

      <HotspotPanel
        speciesId={filters.speciesId}
        data={panelData}
        isLoading={(prediction.isLoading || prediction.isFetching) && tileHotspots.length === 0}
        error={prediction.isError && tileHotspots.length === 0}
      />

      {geoLoading ? <div className="absolute bottom-4 left-4 z-[1000] rounded-lg bg-white px-3 py-2 text-xs">Henter GPS...</div> : null}
      {geoError ? <div className="absolute bottom-4 left-4 z-[1000] rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{geoError}</div> : null}
    </div>
  );
}
