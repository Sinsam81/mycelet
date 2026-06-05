'use client';

import Link from 'next/link';
import { NonNativeOnly } from '@/components/native/NonNativeOnly';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Download, Navigation, Trash2 } from 'lucide-react';
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

type LeafletType = typeof import('leaflet');

const FOREST_LABEL: Record<string, string> = {
  gran: 'granskog',
  furu: 'furuskog',
  bar: 'barskog',
  lauv: 'løvskog',
  blandet: 'blandingsskog',
  apent: 'åpent landskap'
};

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function bearingLabel(aLat: number, aLng: number, bLat: number, bLng: number): string {
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos((bLat * Math.PI) / 180);
  const x =
    Math.cos((aLat * Math.PI) / 180) * Math.sin((bLat * Math.PI) / 180) -
    Math.sin((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.cos(dLng);
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const dirs = ['nord', 'nordøst', 'øst', 'sørøst', 'sør', 'sørvest', 'vest', 'nordvest'];
  return dirs[Math.round(deg / 45) % 8];
}

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
  const topLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const speciesLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const popupRootsRef = useRef<Root[]>([]);
  const loadFindingsRef = useRef<() => Promise<void>>(async () => {});
  const loadPredictionTilesRef = useRef<() => Promise<void>>(async () => {});
  const occClusterRef = useRef<any>(null);
  const loadOccurrencesRef = useRef<() => Promise<void>>(async () => {});
  const showOccurrencesRef = useRef(false);
  const speciesNamesRef = useRef<Map<number, string>>(new Map());

  const supabase = useRef(createClient()).current;
  const { latitude, longitude, loading: geoLoading, error: geoError } = useGeolocation();

  const [filters, setFilters] = useState<MapFilterState>(initialFilters);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showOccurrences, setShowOccurrences] = useState(false);
  const [occCount, setOccCount] = useState(0);
  const [predictionCoords, setPredictionCoords] = useState<{ lat: number | null; lon: number | null }>({
    lat: null,
    lon: null
  });
  const [tileHotspots, setTileHotspots] = useState<PredictionHotspot[]>([]);
  const [offlineAreas, setOfflineAreas] = useState<OfflineArea[]>([]);
  const [offlineName, setOfflineName] = useState('');
  const [offlineStatus, setOfflineStatus] = useState<string | null>(null);
  const [offlineBusy, setOfflineBusy] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [topSpots, setTopSpots] = useState<{ lat: number; lng: number; score: number; forestType: string; productivity: number | null; verdict?: string; reasons?: string[] }[] | null>(null);
  const [topLoading, setTopLoading] = useState(false);
  const [topMsg, setTopMsg] = useState<string | null>(null);
  const [speciesSpots, setSpeciesSpots] = useState<{ speciesId: number; norwegianName: string; latinName: string; imageUrl: string; lat: number; lng: number; score: number; verdict?: string; reasons?: string[] }[] | null>(null);
  const [speciesLoading, setSpeciesLoading] = useState(false);
  const [speciesMsg, setSpeciesMsg] = useState<string | null>(null);

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

  // "Beste steder nær meg": numbered pins on the best forest cells within ~5 km.
  const renderTopSpots = useCallback(
    async (
      spots: { lat: number; lng: number; score: number; forestType: string; productivity: number | null; verdict?: string; reasons?: string[] }[],
      origin: { lat: number; lng: number }
    ) => {
      const layer = topLayerRef.current;
      if (!mapRef.current || !layer) return;
      const leaflet = (await import('leaflet')).default;
      layer.clearLayers();
      spots.forEach((spot, index) => {
        const rank = index + 1;
        const color = getHeatColor(spot.score);
        const icon = leaflet.divIcon({
          className: 'top-spot-marker',
          html: `<div style="background:${color};color:#fff;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.45)">${rank}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        const km = haversineKm(origin.lat, origin.lng, spot.lat, spot.lng);
        const dir = bearingLabel(origin.lat, origin.lng, spot.lat, spot.lng);
        const reasonsHtml = (spot.reasons ?? []).map((r) => `<div style="margin-top:3px">${r}</div>`).join('');
        const popup = `<div style="min-width:210px;max-width:265px">
          <div style="font-weight:700;color:#14532d">${spot.verdict ?? `Topp ${rank}`}</div>
          <div style="color:#555;font-size:12px;margin-top:2px">~${km.toFixed(1)} km ${dir} · ${spot.score}/100</div>
          <div style="font-size:12px;margin-top:6px;color:#1f2937">${reasonsHtml}</div>
          <a href="https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}" target="_blank" rel="noreferrer" style="display:block;margin-top:7px;color:#15803d;font-weight:600;font-size:12px;text-decoration:underline">📍 Åpne i kart (naviger hit)</a>
          <div style="color:#9ca3af;font-size:10px;margin-top:6px">Kilder: MET (vær) · NIBIO/CORINE (skog) · Artsdatabanken (funn)</div>
        </div>`;
        leaflet.marker([spot.lat, spot.lng], { icon }).bindPopup(popup).addTo(layer);
      });
    },
    []
  );

  const clearTopSpots = useCallback(() => {
    topLayerRef.current?.clearLayers();
    setTopSpots(null);
    setTopMsg(null);
  }, []);

  const generateTopSpots = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    setTopMsg(null);
    setTopLoading(true);
    try {
      const center = map.getCenter();
      const originLat = latitude ?? center.lat;
      const originLng = longitude ?? center.lng;
      const latDelta = 5 / 111;
      const lngDelta = 5 / (111 * Math.cos((originLat * Math.PI) / 180));
      const params = new URLSearchParams({
        minLat: String(originLat - latDelta),
        maxLat: String(originLat + latDelta),
        minLng: String(originLng - lngDelta),
        maxLng: String(originLng + lngDelta),
        n: '7',
        top: '12'
      });
      if (filters.speciesId) params.set('speciesId', String(filters.speciesId));
      const res = await fetch(`/api/prediction/grid?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.status === 403) {
        setTopMsg('Krever Premium eller Sesongpass.');
        return;
      }
      if (!res.ok) {
        setTopMsg(data?.error ?? 'Kunne ikke finne topp-steder.');
        return;
      }
      const spots = (data.cells ?? []) as { lat: number; lng: number; score: number; forestType: string; productivity: number | null; verdict?: string; reasons?: string[] }[];
      if (spots.length === 0) {
        clearTopSpots();
        setTopMsg('Fant lite skogdata innen 5 km — prøv et område med mer skog.');
        return;
      }
      setTopSpots(spots);
      await renderTopSpots(spots, { lat: originLat, lng: originLng });
      const leaflet = (await import('leaflet')).default;
      const bounds = leaflet.latLngBounds(spots.map((s) => [s.lat, s.lng] as [number, number]));
      bounds.extend([originLat, originLng]);
      map.fitBounds(bounds.pad(0.2));
      setTopMsg(`${spots.length} beste steder innen 5 km. Trykk på en nål for begrunnelse.`);
    } catch {
      setTopMsg('Kunne ikke finne topp-steder.');
    } finally {
      setTopLoading(false);
    }
  }, [latitude, longitude, filters.speciesId, renderTopSpots, clearTopSpots]);

  // "Soppbilder på kartet": round species photos on each species' best ground.
  const renderSpeciesSpots = useCallback(
    async (
      spots: { speciesId: number; norwegianName: string; latinName: string; imageUrl: string; lat: number; lng: number; score: number; verdict?: string; reasons?: string[] }[]
    ) => {
      const layer = speciesLayerRef.current;
      if (!mapRef.current || !layer) return;
      const leaflet = (await import('leaflet')).default;
      layer.clearLayers();
      for (const spot of spots) {
        const color = getHeatColor(spot.score);
        const icon = leaflet.divIcon({
          className: 'species-spot-marker',
          html: `<div style="width:46px;height:46px;border-radius:9999px;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.5);overflow:hidden;background:${color}"><img src="${spot.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'"/></div>`,
          iconSize: [46, 46],
          iconAnchor: [23, 23]
        });
        const reasonsHtml = (spot.reasons ?? []).map((r) => `<div style="margin-top:3px">${r}</div>`).join('');
        const popup = `<div style="min-width:210px;max-width:265px">
          <div style="font-weight:700;color:#14532d">${spot.norwegianName}</div>
          <div style="font-style:italic;color:#6b7280;font-size:11px">${spot.latinName}</div>
          <div style="color:#555;font-size:12px;margin-top:3px">${spot.verdict ?? 'Beste sted her'} · ${spot.score}/100</div>
          <div style="font-size:12px;margin-top:6px;color:#1f2937">${reasonsHtml}</div>
          <a href="https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}" target="_blank" rel="noreferrer" style="display:block;margin-top:7px;color:#15803d;font-weight:600;font-size:12px;text-decoration:underline">📍 Åpne i kart (naviger hit)</a>
          <div style="color:#9ca3af;font-size:10px;margin-top:6px">Kilder: MET (vær) · NIBIO/CORINE (skog) · Artsdatabanken (funn)</div>
        </div>`;
        leaflet.marker([spot.lat, spot.lng], { icon }).bindPopup(popup).addTo(layer);
      }
    },
    []
  );

  const clearSpeciesSpots = useCallback(() => {
    speciesLayerRef.current?.clearLayers();
    setSpeciesSpots(null);
    setSpeciesMsg(null);
  }, []);

  const generateSpeciesSpots = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    setSpeciesMsg(null);
    setSpeciesLoading(true);
    try {
      const b = map.getBounds();
      const params = new URLSearchParams({
        minLat: String(b.getSouth()),
        maxLat: String(b.getNorth()),
        minLng: String(b.getWest()),
        maxLng: String(b.getEast()),
        n: '6'
      });
      const res = await fetch(`/api/prediction/species-spots?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.status === 403) {
        setSpeciesMsg('Krever Premium eller Sesongpass.');
        return;
      }
      if (!res.ok) {
        setSpeciesMsg(data?.error ?? 'Kunne ikke hente soppbilder.');
        return;
      }
      const spots = (data.spots ?? []) as { speciesId: number; norwegianName: string; latinName: string; imageUrl: string; lat: number; lng: number; score: number; verdict?: string; reasons?: string[] }[];
      if (spots.length === 0) {
        clearSpeciesSpots();
        setSpeciesMsg(data?.message ?? 'Ingen arter i sesong her nå.');
        return;
      }
      setSpeciesSpots(spots);
      await renderSpeciesSpots(spots);
      setSpeciesMsg(`${spots.length} arter i sesong — bilde på beste sted for hver.`);
    } catch {
      setSpeciesMsg('Kunne ikke hente soppbilder.');
    } finally {
      setSpeciesLoading(false);
    }
  }, [renderSpeciesSpots, clearSpeciesSpots]);

  // Registered finds (GBIF/Artsdatabanken) as clustered points — the concrete
  // "where mushrooms have actually been found" layer. Free for all.
  const loadOccurrences = useCallback(async () => {
    const map = mapRef.current;
    const cluster = occClusterRef.current;
    if (!map || !cluster) return;
    if (!showOccurrencesRef.current) {
      cluster.clearLayers();
      return;
    }
    const b = map.getBounds();
    const { data } = await supabase.rpc('get_occurrences_in_bounds', {
      min_lat: b.getSouth(),
      min_lng: b.getWest(),
      max_lat: b.getNorth(),
      max_lng: b.getEast(),
      p_species_id: filters.speciesId,
      p_limit: 3000
    });
    const leaflet = (await import('leaflet')).default;
    cluster.clearLayers();
    const names = speciesNamesRef.current;
    const points = (data ?? []) as { latitude: number; longitude: number; species_id: number | null }[];
    for (const o of points) {
      const name = o.species_id != null ? names.get(o.species_id) ?? 'Sopp' : 'Sopp';
      const icon = leaflet.divIcon({
        className: 'occ-marker',
        html: '<div style="width:12px;height:12px;border-radius:9999px;background:#8b5e34;border:2px solid #fff;box-shadow:0 0 2px rgba(0,0,0,0.5)"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });
      const popup = `<div><b>${name}</b><br/><span style="color:#555;font-size:12px">Registrert funn</span><br/><a href="https://www.google.com/maps/search/?api=1&query=${o.latitude},${o.longitude}" target="_blank" rel="noreferrer" style="color:#15803d;font-weight:600;font-size:12px;text-decoration:underline">📍 Åpne i kart</a><br/><span style="color:#9ca3af;font-size:10px">Artsdatabanken/GBIF</span></div>`;
      leaflet.marker([o.latitude, o.longitude], { icon }).bindPopup(popup).addTo(cluster);
    }
    setOccCount(points.length);
  }, [filters.speciesId, supabase]);

  useEffect(() => {
    loadOccurrencesRef.current = loadOccurrences;
  }, [loadOccurrences]);

  const toggleOccurrences = useCallback(() => {
    const next = !showOccurrencesRef.current;
    showOccurrencesRef.current = next;
    setShowOccurrences(next);
    if (next) {
      void loadOccurrences();
    } else {
      occClusterRef.current?.clearLayers();
      setOccCount(0);
    }
  }, [loadOccurrences]);

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

      // Base layers — switchable like Google Maps (Kart / Satellitt / Terreng).
      // Terreng (Kartverket) is the default: best detail for Norway (trails,
      // contours, forest shading). Kart (OSM) covers Sweden + the rest of the
      // world where Kartverket is blank. Satellitt (Esri) shows the real forest
      // from above — the most useful view for spotting clearings and tree cover.
      const baseTerreng = L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png', {
        attribution: '&copy; Kartverket',
        maxZoom: 18
      });
      const baseKart = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19
      });
      const baseSatellitt = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Flyfoto &copy; Esri, Maxar, Earthstar Geographics',
          maxZoom: 19
        }
      );
      baseTerreng.addTo(map);

      L.control.zoom({ position: 'topright' }).addTo(map);
      L.control
        .layers(
          { Terreng: baseTerreng, Kart: baseKart, Satellitt: baseSatellitt },
          {},
          { position: 'topright', collapsed: true }
        )
        .addTo(map);

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
      const occCluster = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 60, showCoverageOnHover: false });
      map.addLayer(occCluster);
      const heatLayer = L.layerGroup();
      map.addLayer(heatLayer);
      const topLayer = L.layerGroup();
      map.addLayer(topLayer);
      const speciesLayer = L.layerGroup();
      map.addLayer(speciesLayer);
      mapRef.current = map;
      clusterRef.current = clusters;
      occClusterRef.current = occCluster;
      heatLayerRef.current = heatLayer;
      topLayerRef.current = topLayer;
      speciesLayerRef.current = speciesLayer;

      const onMoveEnd = () => {
        const center = map.getCenter();
        setPredictionCoords({
          lat: Number(center.lat.toFixed(6)),
          lon: Number(center.lng.toFixed(6))
        });
        void loadFindingsRef.current();
        void loadPredictionTilesRef.current();
        void loadOccurrencesRef.current();
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
      topLayerRef.current = null;
      speciesLayerRef.current = null;
      occClusterRef.current = null;
    };
  }, [latitude, longitude]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, [supabase]);

  useEffect(() => {
    supabase
      .from('mushroom_species')
      .select('id,norwegian_name')
      .then(({ data }) => {
        const map = new Map<number, string>();
        for (const s of data ?? []) map.set(s.id as number, (s.norwegian_name as string | null) ?? 'Sopp');
        speciesNamesRef.current = map;
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
  // generic no-species view the verdict pill is enough; we don't pop a panel up
  // for "is it mushroom weather?".
  const explanationLines = useMemo(() => {
    const data = prediction.data;
    // Build the "why" for every prediction (species-specific when one is
    // selected, generic otherwise) — but only with real weather, so we never
    // render placeholder "0°C / 0mm" lines when no provider was reachable.
    if (!data || !data.weatherSource || data.weatherSource === 'unavailable') return null;
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
      forest: data.forest
        ? {
            forestType: data.forest.forestType,
            productivity: data.forest.productivity,
            volumePerHa: data.forest.volumePerHa,
            habitatScore: data.habitat?.score ?? null,
            habitatReasons: data.habitat?.reasons ?? [],
            source: data.forest.source
          }
        : null,
      nearbyOccurrences: data.nearbyOccurrences,
      month: new Date().getMonth() + 1
    });
  }, [prediction.data]);

  return (
    <div className="relative h-[calc(100vh-8.5rem)] overflow-hidden rounded-xl border border-gray-200">
      <div ref={containerRef} className="h-full w-full" />

      <MapFilters filters={filters} onChange={setFilters} />

      <div className="absolute left-1/2 top-3 z-[1000] flex w-[calc(100%-7rem)] max-w-md -translate-x-1/2 flex-col items-center gap-1">
        <button
          type="button"
          onClick={toggleOccurrences}
          className="rounded-full bg-white/95 px-3 py-2 text-xs font-medium text-amber-900 shadow-lg backdrop-blur hover:bg-white"
        >
          {showOccurrences ? `Skjul funn${occCount ? ` (${occCount})` : ''}` : '📍 Vis registrerte funn'}
        </button>
        {hasOfflineAccess ? (
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => (topSpots ? clearTopSpots() : void generateTopSpots())}
              disabled={topLoading}
              className="rounded-full bg-forest-800 px-3 py-2 text-xs font-medium text-white shadow-lg hover:bg-forest-700 disabled:opacity-60"
            >
              {topLoading ? 'Søker…' : topSpots ? 'Skjul beste steder' : '⭐ Beste steder'}
            </button>
            <button
              type="button"
              onClick={() => (speciesSpots ? clearSpeciesSpots() : void generateSpeciesSpots())}
              disabled={speciesLoading}
              className="rounded-full bg-forest-800 px-3 py-2 text-xs font-medium text-white shadow-lg hover:bg-forest-700 disabled:opacity-60"
            >
              {speciesLoading ? 'Laster…' : speciesSpots ? 'Skjul bilder' : 'Soppbilder'}
            </button>
          </div>
        ) : (
          <NonNativeOnly>
            <Link
              href="/pricing"
              className="rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-forest-900 shadow-lg backdrop-blur"
            >
              Soppkart-verktøy (Premium)
            </Link>
          </NonNativeOnly>
        )}
        {topMsg ? (
          <p className="max-w-[80vw] rounded bg-white/90 px-2 py-1 text-center text-[11px] text-gray-700 shadow">{topMsg}</p>
        ) : null}
        {speciesMsg ? (
          <p className="max-w-[80vw] rounded bg-white/90 px-2 py-1 text-center text-[11px] text-gray-700 shadow">{speciesMsg}</p>
        ) : null}
      </div>

      {/* The prediction verdict + "hvorfor" + source credit now live in the
          consolidated HotspotPanel below — shown for every query, not just when
          a species is selected. */}

      <div className={`absolute right-3 top-28 z-[1000] ${offlineOpen ? 'w-72' : 'w-auto'} rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900">Offline-kart</p>
          <div className="flex items-center gap-2">
            {billing.isLoading ? <span className="text-[11px] text-gray-500">Sjekker plan...</span> : null}
            <button
              type="button"
              onClick={() => setOfflineOpen((v) => !v)}
              aria-label={offlineOpen ? 'Skjul offline-kart' : 'Vis offline-kart'}
              className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
            >
              {offlineOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {offlineOpen ? (
          <>
        {showOfflineUpsell ? (
          <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-2">
            <p className="text-xs text-amber-800">Lagring av kartområder offline krever Premium eller Sesongpass.</p>
            <NonNativeOnly>
              <Link href="/pricing" className="text-xs font-medium text-amber-900 underline">
                Oppgrader plan
              </Link>
            </NonNativeOnly>
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
          </>
        ) : null}
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
        explanations={explanationLines}
        isLoading={(prediction.isLoading || prediction.isFetching) && tileHotspots.length === 0}
        error={prediction.isError && tileHotspots.length === 0}
      />

      {geoLoading ? <div className="absolute bottom-4 left-4 z-[1000] rounded-lg bg-white px-3 py-2 text-xs">Henter GPS...</div> : null}
      {geoError ? <div className="absolute bottom-4 left-4 z-[1000] rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{geoError}</div> : null}
    </div>
  );
}
