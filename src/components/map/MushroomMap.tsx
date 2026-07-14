'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { NonNativeOnly } from '@/components/native/NonNativeOnly';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, MoreHorizontal, Navigation, Trash2, X } from 'lucide-react';
import { createRoot, Root } from 'react-dom/client';
import { createClient } from '@/lib/supabase/client';
import { useGeolocation, watchPositionUntilAccurate } from '@/lib/hooks/useGeolocation';
import { getRegion } from '@/lib/utils/region';
import { usePrediction } from '@/lib/hooks/usePrediction';
import { useBillingStatus } from '@/lib/hooks/useBilling';
import { PredictionHotspot, PredictionResponse, PredictionTile } from '@/types/prediction';
import { AddFindingSheet } from './AddFindingSheet';
import { FindingPopup } from './FindingPopup';
import { HotspotPanel } from './HotspotPanel';
import { MapFilters, MapFilterState } from './MapFilters';
import { MapFinding } from '@/types/finding';
import {
  OfflineArea,
  OSM_TILE_TEMPLATE,
  SATELLITE_TILE_TEMPLATE,
  TERRAIN_TILE_TEMPLATE,
  cacheMapTilesForArea,
  readOfflineAreas,
  removeOfflineAreaById,
  saveOfflineAreas
} from '@/lib/utils/offlineMap';
import { buildExplanation } from '@/lib/utils/prediction-explanation';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import { FLAGS } from '@/lib/flags';
import toast from 'react-hot-toast';

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
  // Stable direction keys; translated at the call site via t('dir<Key>').
  const dirs = ['north', 'northEast', 'east', 'southEast', 'south', 'southWest', 'west', 'northWest'];
  return dirs[Math.round(deg / 45) % 8];
}

const initialFilters: MapFilterState = {
  speciesId: null,
  period: 'month',
  onlyMine: false
};

export function MushroomMap() {
  const t = useTranslations('MushroomMap');
  const locale = useLocale();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const clusterRef = useRef<any>(null);
  const heatLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const topLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const speciesLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const popupRootsRef = useRef<Root[]>([]);
  const loadFindingsRef = useRef<() => Promise<void>>(async () => {});
  const loadPredictionTilesRef = useRef<() => Promise<void>>(async () => {});
  // Monotonic request id so only the latest prediction-tile RPC may write state.
  const tileReqRef = useRef(0);
  const occClusterRef = useRef<any>(null);
  const loadOccurrencesRef = useRef<() => Promise<void>>(async () => {});
  const showOccurrencesRef = useRef(false);
  const speciesNamesRef = useRef<Map<number, string>>(new Map());
  const speciesEdibilityRef = useRef<Map<number, string>>(new Map());
  const occEdibilityRef = useRef<'all' | 'edible' | 'toxic'>('all');
  const occSeasonRef = useRef(false);
  const tripActiveRef = useRef(false);
  const tripFindsRef = useRef<string[]>([]);
  const speciesSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meMarkerRef = useRef<any>(null);
  const meCircleRef = useRef<any>(null); // GPS accuracy circle around the "me" dot
  const geoAbortRef = useRef<AbortController | null>(null); // cancels an in-flight locate watch
  // True once the user manually picks a base layer — stops the region auto-switch.
  const userPickedBaseLayerRef = useRef(false);
  // The three switchable base layers, so the offline-save can cache whichever one
  // is currently shown (Terreng=Kartverket / Kart=OSM / Satellitt=Esri) instead
  // of always assuming Kartverket — which is blank outside Norway.
  const baseLayersRef = useRef<{
    terreng: import('leaflet').TileLayer;
    kart: import('leaflet').TileLayer;
    satellitt: import('leaflet').TileLayer;
  } | null>(null);
  // Last known position, so the map can recenter even if geolocation resolves
  // before the (async) map init finishes.
  const posRef = useRef<{ lat: number; lng: number } | null>(null);

  const supabase = useRef(createClient()).current;
  const { latitude, longitude, error: geoError } = useGeolocation();

  const [filters, setFilters] = useState<MapFilterState>(initialFilters);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showOccurrences, setShowOccurrences] = useState(false);
  const [occCount, setOccCount] = useState(0);
  const [occEdibility, setOccEdibility] = useState<'all' | 'edible' | 'toxic'>('all');
  const [occSeason, setOccSeason] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [tripActive, setTripActive] = useState(false);
  const [tripFinds, setTripFinds] = useState<string[]>([]);
  const [speciesSearch, setSpeciesSearch] = useState('');
  const [speciesSuggestions, setSpeciesSuggestions] = useState<{ id: number; name: string }[]>([]);
  const [selectedSpeciesName, setSelectedSpeciesName] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
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
  const [toolsOpen, setToolsOpen] = useState(false);
  const [topSpots, setTopSpots] = useState<{ lat: number; lng: number; score: number; forestType: string; productivity: number | null; verdict?: string; reasons?: string[]; topSpecies?: string[] }[] | null>(null);
  const [topLoading, setTopLoading] = useState(false);
  const [topMsg, setTopMsg] = useState<string | null>(null);
  const [topAccess, setTopAccess] = useState<'premium_full' | 'free_limited' | null>(null);
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

    // Guard against out-of-order overlapping requests. This runs from the mount
    // effect, the moveend handler (via ref), AND re-fires on every species-filter
    // change — so two RPCs can be in flight at once. Without this, a slower older
    // request could resolve last and overwrite fresher hotspots, showing "Beste
    // steder" for the wrong species/bounds. Only the latest request may write.
    const myReq = ++tileReqRef.current;
    const bounds = map.getBounds();
    const { data, error } = await supabase.rpc('get_prediction_tiles_in_bounds', {
      min_lat: bounds.getSouth(),
      min_lng: bounds.getWest(),
      max_lat: bounds.getNorth(),
      max_lng: bounds.getEast(),
      p_species_id: filters.speciesId
    });

    if (myReq !== tileReqRef.current) return; // a newer call superseded this one

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

  // "Fant du sopp her?" feedback on top-spot popups. The popup body is plain
  // HTML (Leaflet), so we bind the buttons on popupopen via data attributes.
  // This is the calibration loop for the prediction engine: every yes/no lands
  // in spot_feedback together with the score we showed.
  const bindSpotFeedback = useCallback((popup: import('leaflet').Popup) => {
    const el = popup.getElement();
    if (!el) return;
    const box = el.querySelector('[data-spot-feedback]') as HTMLElement | null;
    if (!box || box.dataset.bound === '1') return;
    box.dataset.bound = '1';
    box.querySelectorAll('button[data-fb]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const found = (btn as HTMLElement).dataset.fb === 'yes';
        try {
          const res = await fetch('/api/spot-feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lat: Number(box.dataset.lat),
              lng: Number(box.dataset.lng),
              found,
              scoreShown: box.dataset.score ? Number(box.dataset.score) : null,
              speciesId: box.dataset.species ? Number(box.dataset.species) : null,
              visitedAt: new Date().toISOString(),
              modelVersion: box.dataset.model,
              predictionSource: box.dataset.source
            })
          });
          if (res.status === 401) {
            toast(t('loginToGiveFeedback'));
            return;
          }
          if (!res.ok) throw new Error('feedback failed');
          box.innerHTML =
            `<div style="font-size:12px;font-weight:600;color:#15803d">${t('feedbackThanks')}</div>`;
        } catch {
          toast.error(t('feedbackSaveError'));
        }
      });
    });
  }, [t]);

  // "Lovende steder nær meg": numbered pins on promising forest cells within ~5 km.
  const renderTopSpots = useCallback(
    async (
      spots: { lat: number; lng: number; score: number; forestType: string; productivity: number | null; verdict?: string; reasons?: string[]; topSpecies?: string[] }[],
      origin: { lat: number; lng: number },
      opts?: { limited?: boolean; speciesId?: number | null }
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
        const dirKey = bearingLabel(origin.lat, origin.lng, spot.lat, spot.lng);
        const dir = t(`dir_${dirKey}`);
        const reasonsHtml = (spot.reasons ?? []).map((r) => `<div style="margin-top:3px">${r}</div>`).join('');
        const topSpeciesHtml = (spot.topSpecies ?? []).length
          ? `<div style="margin-top:6px;font-size:12px;font-weight:600;color:#14532d">${t('mostLikelyHere', { species: (spot.topSpecies ?? []).join(', ') })}</div>`
          : '';
        const limitedHtml = opts?.limited
          ? `<div style="margin-top:6px;font-size:12px;color:#92400e;background:#fef3c7;border-radius:8px;padding:5px 8px">${t('premiumWhyHigh')}</div>`
          : '';
        const feedbackHtml = `<div data-spot-feedback data-lat="${spot.lat}" data-lng="${spot.lng}" data-score="${spot.score}"${
          opts?.speciesId ? ` data-species="${opts.speciesId}"` : ''
        } data-model="v4_species_spots_habitat" data-source="computed_top_spots" style="margin-top:8px;border-top:1px solid #e5e7eb;padding-top:7px">
          <div style="font-size:12px;font-weight:600;color:#1f2937">${t('wereYouHere')}</div>
          <div style="display:flex;gap:6px;margin-top:5px">
            <button type="button" data-fb="yes" style="flex:1;background:#15803d;color:#fff;border:none;border-radius:8px;padding:5px 0;font-size:12px;font-weight:600;cursor:pointer">${t('feedbackYes')}</button>
            <button type="button" data-fb="no" style="flex:1;background:#f3f4f6;color:#374151;border:none;border-radius:8px;padding:5px 0;font-size:12px;font-weight:600;cursor:pointer">${t('feedbackNo')}</button>
          </div>
        </div>`;
        const popup = `<div style="min-width:210px;max-width:265px">
          <div style="font-weight:700;color:#14532d">${spot.verdict ?? t('topRank', { rank })}</div>
          <div style="color:#555;font-size:12px;margin-top:2px">~${km.toFixed(1)} km ${dir} · ${spot.score}/100</div>
          ${topSpeciesHtml}
          <div style="font-size:12px;margin-top:6px;color:#1f2937">${reasonsHtml}</div>
          ${limitedHtml}
          <a href="https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}" target="_blank" rel="noreferrer" style="display:block;margin-top:7px;color:#15803d;font-weight:600;font-size:12px;text-decoration:underline">${t('openInMapNavigate')}</a>
          ${feedbackHtml}
          <div style="color:#9ca3af;font-size:10px;margin-top:6px">${t('sourcesCredit')}</div>
        </div>`;
        const marker = leaflet.marker([spot.lat, spot.lng], { icon }).bindPopup(popup).addTo(layer);
        marker.on('popupopen', (event) => bindSpotFeedback(event.popup));
      });
    },
    [bindSpotFeedback, t]
  );

  const clearTopSpots = useCallback(() => {
    topLayerRef.current?.clearLayers();
    setTopSpots(null);
    setTopMsg(null);
    setTopAccess(null);
  }, []);

  const generateTopSpots = useCallback(async (speciesIdOverride?: number | null) => {
    const map = mapRef.current;
    if (!map) return;
    const sid = speciesIdOverride !== undefined ? speciesIdOverride : filters.speciesId;
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
      if (sid) params.set('speciesId', String(sid));
      const res = await fetch(`/api/prediction/grid?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.status === 403) {
        setTopMsg(t('requiresPremium'));
        return;
      }
      if (!res.ok) {
        setTopMsg(data?.error ?? t('couldNotFindSpots'));
        return;
      }
      const spots = (data.cells ?? []) as { lat: number; lng: number; score: number; forestType: string; productivity: number | null; verdict?: string; reasons?: string[]; topSpecies?: string[] }[];
      if (spots.length === 0) {
        clearTopSpots();
        setTopMsg(t('littleForestData'));
        return;
      }
      const limited = data.access === 'free_limited';
      setTopAccess(limited ? 'free_limited' : 'premium_full');
      setTopSpots(spots);
      await renderTopSpots(spots, { lat: originLat, lng: originLng }, { limited, speciesId: sid ?? null });
      const leaflet = (await import('leaflet')).default;
      const bounds = leaflet.latLngBounds(spots.map((s) => [s.lat, s.lng] as [number, number]));
      bounds.extend([originLat, originLng]);
      map.fitBounds(bounds.pad(0.2));
      const sName = sid != null ? speciesNamesRef.current.get(sid) ?? null : null;
      setTopMsg(
        limited
          ? t('topSpotsLimited', { count: spots.length })
          : sName
            ? t('topSpotsForSpecies', { count: spots.length, species: sName })
            : t('topSpotsGeneric', { count: spots.length })
      );
    } catch {
      setTopMsg(t('couldNotFindSpots'));
    } finally {
      setTopLoading(false);
    }
  }, [latitude, longitude, filters.speciesId, renderTopSpots, clearTopSpots, t]);

  // Prominent "which mushroom do you want?" search: pick a species and we jump
  // straight to the best spots for it (the prediction already re-ranks per
  // species). Debounced species lookup.
  const searchSpeciesForSpots = useCallback(
    (value: string) => {
      setSpeciesSearch(value);
      if (speciesSearchTimer.current) clearTimeout(speciesSearchTimer.current);
      if (value.trim().length < 2) {
        setSpeciesSuggestions([]);
        return;
      }
      speciesSearchTimer.current = setTimeout(async () => {
        const { data } = await supabase
          .from('mushroom_species')
          .select('id,norwegian_name,swedish_name')
          .or(`norwegian_name.ilike.%${value}%,swedish_name.ilike.%${value}%,latin_name.ilike.%${value}%`)
          .order('norwegian_name', { ascending: true })
          .limit(8);
        setSpeciesSuggestions(
          ((data ?? []) as { id: number; norwegian_name: string; swedish_name: string | null }[]).map((d) => ({
            id: d.id,
            name: getSpeciesDisplayName(d, locale)
          }))
        );
      }, 250);
    },
    [locale, supabase]
  );

  const selectSpeciesForSpots = useCallback(
    (id: number, name: string) => {
      setFilters((prev) => ({ ...prev, speciesId: id }));
      setSelectedSpeciesName(name);
      setSpeciesSearch(name);
      setSpeciesSuggestions([]);
      void generateTopSpots(id);
    },
    [generateTopSpots]
  );

  const clearSpeciesSearch = useCallback(() => {
    setFilters((prev) => ({ ...prev, speciesId: null }));
    setSelectedSpeciesName(null);
    setSpeciesSearch('');
    setSpeciesSuggestions([]);
    clearTopSpots();
  }, [clearTopSpots]);

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
          <div style="color:#555;font-size:12px;margin-top:3px">${spot.verdict ?? t('promisingSpotHere')} · ${spot.score}/100</div>
          <div style="font-size:12px;margin-top:6px;color:#1f2937">${reasonsHtml}</div>
          <a href="https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}" target="_blank" rel="noreferrer" style="display:block;margin-top:7px;color:#15803d;font-weight:600;font-size:12px;text-decoration:underline">${t('openInMapNavigate')}</a>
          <div style="color:#9ca3af;font-size:10px;margin-top:6px">${t('sourcesCredit')}</div>
        </div>`;
        leaflet.marker([spot.lat, spot.lng], { icon }).bindPopup(popup).addTo(layer);
      }
    },
    [t]
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
        setSpeciesMsg(t('requiresPremium'));
        return;
      }
      if (!res.ok) {
        setSpeciesMsg(data?.error ?? t('couldNotFetchPhotos'));
        return;
      }
      const spots = (data.spots ?? []) as { speciesId: number; norwegianName: string; latinName: string; imageUrl: string; lat: number; lng: number; score: number; verdict?: string; reasons?: string[] }[];
      if (spots.length === 0) {
        clearSpeciesSpots();
        setSpeciesMsg(data?.message ?? t('noSpeciesInSeason'));
        return;
      }
      setSpeciesSpots(spots);
      await renderSpeciesSpots(spots);
      setSpeciesMsg(t('speciesInSeasonCount', { count: spots.length }));
    } catch {
      setSpeciesMsg(t('couldNotFetchPhotos'));
    } finally {
      setSpeciesLoading(false);
    }
  }, [renderSpeciesSpots, clearSpeciesSpots, t]);

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
    const edibilities = speciesEdibilityRef.current;
    const EDIBILITY_HEX: Record<string, string> = {
      edible: '#059669',
      conditionally_edible: '#f59e0b',
      inedible: '#f97316',
      toxic: '#dc2626',
      deadly: '#7f1d1d'
    };
    const EDIBILITY_LABEL: Record<string, string> = {
      edible: t('edEdible'),
      conditionally_edible: t('edConditionallyEdible'),
      inedible: t('edInedible'),
      toxic: t('edToxic'),
      deadly: t('edDeadly')
    };
    const MONTHS_NO = [
      t('monthJan'),
      t('monthFeb'),
      t('monthMar'),
      t('monthApr'),
      t('monthMay'),
      t('monthJun'),
      t('monthJul'),
      t('monthAug'),
      t('monthSep'),
      t('monthOct'),
      t('monthNov'),
      t('monthDec')
    ];
    const formatFound = (d?: string | null): string | null => {
      if (!d) return null;
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
      if (!m) return null;
      const month = parseInt(m[2], 10);
      const day = parseInt(m[3], 10);
      // Year-only GBIF records are stored as YYYY-01-01 — show just the year so
      // we never claim a January find for a species that doesn't fruit then.
      if (month === 1 && day === 1) return m[1];
      return `${MONTHS_NO[month - 1]} ${m[1]}`;
    };
    const filter = occEdibilityRef.current;
    const seasonOnly = occSeasonRef.current;
    const nowMonth = new Date().getMonth() + 1;
    const inSeasonMonth = (d?: string | null) => {
      if (!d) return true; // no date → keep (graceful before dates are loaded)
      const m = /^\d{4}-(\d{2})/.exec(d);
      if (!m) return true;
      const month = parseInt(m[1], 10);
      const diff = Math.min((month - nowMonth + 12) % 12, (nowMonth - month + 12) % 12);
      return diff <= 1; // within ±1 month of now (wraps the year boundary)
    };
    const all = (data ?? []) as { latitude: number; longitude: number; species_id: number | null; observed_at?: string | null }[];
    const points = all.filter((o) => {
      if (seasonOnly && !inSeasonMonth(o.observed_at)) return false;
      if (filter === 'all') return true;
      const e = o.species_id != null ? edibilities.get(o.species_id) : undefined;
      if (filter === 'edible') return e === 'edible' || e === 'conditionally_edible';
      return e === 'toxic' || e === 'deadly';
    });
    for (const o of points) {
      const name = o.species_id != null ? names.get(o.species_id) ?? t('mushroomFallback') : t('mushroomFallback');
      const edi = o.species_id != null ? edibilities.get(o.species_id) : undefined;
      const color = (edi && EDIBILITY_HEX[edi]) || '#8b5e34';
      const ediLabel = edi ? EDIBILITY_LABEL[edi] : null;
      const icon = leaflet.divIcon({
        className: 'occ-marker',
        html: `<div style="width:12px;height:12px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 2px rgba(0,0,0,0.5)"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });
      const ediHtml = ediLabel ? `<br/><span style="color:${color};font-weight:600;font-size:12px">${ediLabel}</span>` : '';
      const found = formatFound(o.observed_at);
      const foundHtml = found ? ` · ${found}` : '';
      const popup = `<div><b>${name}</b>${ediHtml}<br/><span style="color:#555;font-size:12px">${t('registeredFinding')}${foundHtml}</span><br/><a href="https://www.google.com/maps/search/?api=1&query=${o.latitude},${o.longitude}" target="_blank" rel="noreferrer" style="color:#15803d;font-weight:600;font-size:12px;text-decoration:underline">${t('openInMap')}</a><br/><span style="color:#9ca3af;font-size:10px">Artsdatabanken/GBIF</span></div>`;
      leaflet.marker([o.latitude, o.longitude], { icon }).bindPopup(popup).addTo(cluster);
    }
    setOccCount(points.length);
  }, [filters.speciesId, supabase, t]);

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

  const setOccEdibilityFilter = useCallback(
    (value: 'all' | 'edible' | 'toxic') => {
      occEdibilityRef.current = value;
      setOccEdibility(value);
      void loadOccurrences();
    },
    [loadOccurrences]
  );

  const toggleOccSeason = useCallback(() => {
    const next = !occSeasonRef.current;
    occSeasonRef.current = next;
    setOccSeason(next);
    void loadOccurrences();
  }, [loadOccurrences]);

  const dismissIntro = useCallback(() => {
    setShowIntro(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('mycelet:map-intro-v1', '1');
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.localStorage.getItem('mycelet:map-intro-v1')) {
      setShowIntro(true);
    }
  }, []);

  // "Sopptur-modus": a lightweight client-side trip log. Starting a trip records
  // each find you add until you end it, then celebrates the haul. Persisted in
  // localStorage so it survives a refresh mid-forage.
  const startTrip = useCallback(() => {
    tripActiveRef.current = true;
    tripFindsRef.current = [];
    setTripActive(true);
    setTripFinds([]);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('mycelet:trip-v1', JSON.stringify({ finds: [] }));
    }
  }, []);

  const addTripFind = useCallback((name?: string) => {
    const next = [...tripFindsRef.current, name && name.trim() ? name.trim() : t('mushroomFallback')];
    tripFindsRef.current = next;
    setTripFinds(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('mycelet:trip-v1', JSON.stringify({ finds: next }));
    }
  }, [t]);

  const endTrip = useCallback(() => {
    const finds = tripFindsRef.current;
    const count = finds.length;
    const unique = Array.from(new Set(finds));
    tripActiveRef.current = false;
    tripFindsRef.current = [];
    setTripActive(false);
    setTripFinds([]);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('mycelet:trip-v1');
      if (count > 0) {
        window.localStorage.setItem(
          'mycelet:last-trip',
          JSON.stringify({ count, species: unique, at: new Date().toISOString() })
        );
      }
    }
    if (count > 0) {
      toast.success(
        unique.length
          ? t('tripDoneWithSpecies', { count, species: unique.join(', ') })
          : t('tripDone', { count })
      );
    } else {
      toast(t('tripDoneNoFinds'));
    }
  }, [t]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem('mycelet:trip-v1');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { finds?: string[] };
      const finds = Array.isArray(parsed.finds) ? parsed.finds : [];
      tripActiveRef.current = true;
      tripFindsRef.current = finds;
      setTripActive(true);
      setTripFinds(finds);
    } catch {
      window.localStorage.removeItem('mycelet:trip-v1');
    }
  }, []);

  // "Finn meg": recenter on a fresh GPS fix (falling back to the last known
  // position) and drop a "you are here" dot so the user can tell themselves
  // apart from the find points.
  const locateMe = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    // Cancel any in-flight locate (double-tap / repeat) and start fresh.
    geoAbortRef.current?.abort();
    const controller = new AbortController();
    geoAbortRef.current = controller;

    // Zoom in proportionally to how sure we are — honest precision, no false zoom.
    const zoomForAccuracy = (m: number) => (m <= 20 ? 17 : m <= 50 ? 16 : m <= 150 ? 15 : 14);
    let firstFix = true;

    const render = async (lat: number, lng: number, accuracy: number, isFinal: boolean) => {
      if (controller.signal.aborted) return;
      const leaflet = (await import('leaflet')).default;
      if (controller.signal.aborted || mapRef.current !== map) return;

      // Accuracy circle (radius in meters) — shrinks as the GPS sharpens.
      if (meCircleRef.current) {
        meCircleRef.current.setLatLng([lat, lng]).setRadius(accuracy);
      } else {
        meCircleRef.current = leaflet
          .circle([lat, lng], {
            radius: accuracy,
            color: '#2563eb',
            weight: 1,
            fillColor: '#2563eb',
            fillOpacity: 0.12,
            interactive: false
          })
          .addTo(map);
      }

      // "You are here" dot, kept on top of the circle.
      if (meMarkerRef.current) {
        meMarkerRef.current.setLatLng([lat, lng]);
      } else {
        const icon = leaflet.divIcon({
          className: 'me-marker',
          html: '<div style="width:16px;height:16px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 3px rgba(37,99,235,0.35)"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });
        meMarkerRef.current = leaflet.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
      }

      posRef.current = { lat, lng };

      // Recenter on the first fix and do one gentle zoom-refinement on the final
      // fix; intermediate fixes only move the dot/circle so we never fight the
      // user panning or pinching while the GPS is still sharpening.
      if (firstFix || isFinal) {
        firstFix = false;
        map.setView([lat, lng], zoomForAccuracy(accuracy));
      }
    };

    setLocating(true);
    watchPositionUntilAccurate({
      targetAccuracyM: 25,
      timeoutMs: 12_000,
      signal: controller.signal,
      onUpdate: ({ latitude: lat, longitude: lng, accuracy }) => {
        void render(lat, lng, accuracy, false);
      }
    })
      .then(({ latitude: lat, longitude: lng, accuracy }) => {
        void render(lat, lng, accuracy, true);
      })
      .catch(() => {
        // Aborted/denied/no-fix → fall back to the hook's last known position.
        if (!controller.signal.aborted && latitude != null && longitude != null) {
          void render(latitude, longitude, 100, true);
        }
      })
      .finally(() => {
        if (geoAbortRef.current === controller) geoAbortRef.current = null;
        setLocating(false);
      });
  }, [latitude, longitude]);

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
      setOfflineStatus(t('offlineRequiresPremium'));
      return;
    }

    const map = mapRef.current;
    if (!map) {
      setOfflineStatus(t('mapNotReady'));
      return;
    }

    const bounds = map.getBounds();
    const center = map.getCenter();
    const zoom = map.getZoom();
    const now = new Date();
    const generatedName = t('generatedAreaName', {
      date: now.toLocaleDateString('nb-NO'),
      time: now.toLocaleTimeString('nb-NO', {
        hour: '2-digit',
        minute: '2-digit'
      })
    });

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

    // Cache whichever base map the user is actually looking at — not a hardcoded
    // Kartverket layer that's blank outside Norway. Region guard: if Terreng is
    // active but the area sits outside Norway (e.g. the user manually picked it
    // over Sweden), fall back to OSM so the saved area isn't a blank cache.
    const layers = baseLayersRef.current;
    let tileTemplate = OSM_TILE_TEMPLATE;
    if (layers) {
      if (map.hasLayer(layers.satellitt)) tileTemplate = SATELLITE_TILE_TEMPLATE;
      else if (map.hasLayer(layers.kart)) tileTemplate = OSM_TILE_TEMPLATE;
      else if (map.hasLayer(layers.terreng)) tileTemplate = TERRAIN_TILE_TEMPLATE;
    }
    if (tileTemplate === TERRAIN_TILE_TEMPLATE && getRegion(center.lat, center.lng) !== 'NO') {
      tileTemplate = OSM_TILE_TEMPLATE;
    }

    setOfflineBusy(true);

    try {
      const zoomLevels = Array.from(new Set([Math.max(8, zoom - 1), zoom, Math.min(18, zoom + 1)]));
      const cacheResult = await cacheMapTilesForArea(area.bounds, zoomLevels, tileTemplate);
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
        setOfflineStatus(t('offlineCacheFailed'));
      } else {
        setOfflineStatus(t('offlineSaved', { count: cacheResult.cached }));
      }
    } catch {
      setOfflineStatus(t('offlineSaveError'));
    } finally {
      setOfflineBusy(false);
    }
  }, [hasOfflineAccess, offlineAreas, offlineName, t]);

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

      // Re-check after the async import gap. React StrictMode (dev) mounts this
      // effect twice in quick succession; without this guard both init() calls
      // pass the top check while awaiting the dynamic import, then both call
      // L.map() on the same container → "Map container is already initialized".
      // The cleanup sets mounted=false between the two mounts, so the stale run
      // bails here, and a finished run leaves mapRef.current set so the other bails.
      if (!mounted || mapRef.current || !containerRef.current) return;

      delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: '/images/ui/marker-icon-2x.png',
        iconUrl: '/images/ui/marker-icon.png',
        shadowUrl: '/images/ui/marker-shadow.png'
      });

      const map = L.map(containerRef.current, {
        // Oslo as a neutral starting point; the geolocation effect recenters on
        // the user's real position once it resolves (see posRef + setView below).
        center: [59.91, 10.75],
        zoom: 11,
        // Shared display ceiling. Without this the map inherits the ACTIVE layer's
        // max (Terreng = 18), capping zoom there. 20 lets the user zoom much
        // deeper; layers over-zoom (upscale) past their maxNativeZoom.
        maxZoom: 20,
        zoomControl: false
      });

      // Base layers — switchable like Google Maps (Kart / Satellitt / Terreng).
      // Terreng (Kartverket) is the default: best detail for Norway (trails,
      // contours, forest shading). Kart (OSM) covers Sweden + the rest of the
      // world where Kartverket is blank. Satellitt (Esri) shows the real forest
      // from above — the most useful view for spotting clearings and tree cover.
      // maxNativeZoom = deepest REAL tile each provider serves over our coverage
      // (verified: Kartverket topo tops out at z18); maxZoom = shared over-zoom
      // ceiling so all layers reach the same depth by upscaling the last tiles.
      const baseTerreng = L.tileLayer(TERRAIN_TILE_TEMPLATE, {
        attribution: '&copy; Kartverket',
        maxNativeZoom: 18,
        maxZoom: 20
      });
      const baseKart = L.tileLayer(OSM_TILE_TEMPLATE, {
        attribution: '&copy; OpenStreetMap',
        maxNativeZoom: 19,
        maxZoom: 20
      });
      const baseSatellitt = L.tileLayer(SATELLITE_TILE_TEMPLATE, {
        attribution: 'Flyfoto &copy; Esri, Maxar, Earthstar Geographics',
        maxNativeZoom: 19,
        maxZoom: 20
      });
      baseTerreng.addTo(map);
      baseLayersRef.current = { terreng: baseTerreng, kart: baseKart, satellitt: baseSatellitt };

      L.control.zoom({ position: 'topright' }).addTo(map);
      L.control
        .layers(
          { Terreng: baseTerreng, Kart: baseKart, Satellitt: baseSatellitt },
          {},
          { position: 'topright', collapsed: true }
        )
        .addTo(map);

      // Once the user manually switches base layer, stop auto-switching by region.
      map.on('baselayerchange', () => {
        userPickedBaseLayerRef.current = true;
      });

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

      // If geolocation already resolved before this (async) init finished, the
      // setView effect couldn't run yet (no map). Recenter on the user now.
      if (posRef.current) {
        map.setView([posRef.current.lat, posRef.current.lng], 13);
      }

      const onMoveEnd = () => {
        const center = map.getCenter();
        // Kartverket "Terreng" has no tiles outside Norway, so auto-switch to OSM
        // ("Kart") when the view is over Sweden / elsewhere — unless the user has
        // manually chosen a base layer. This is what makes the Swedish map work.
        if (!userPickedBaseLayerRef.current) {
          if (getRegion(center.lat, center.lng) === 'NO') {
            if (!map.hasLayer(baseTerreng)) {
              map.removeLayer(baseKart);
              baseTerreng.addTo(map);
            }
          } else if (!map.hasLayer(baseKart)) {
            map.removeLayer(baseTerreng);
            baseKart.addTo(map);
          }
        }
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
      baseLayersRef.current = null;
      // Stop any in-flight GPS watch (so it can't keep the radio hot after the
      // user leaves the map) and drop the accuracy circle.
      geoAbortRef.current?.abort();
      geoAbortRef.current = null;
      meMarkerRef.current = null;
      meCircleRef.current = null;
    };
    // Init the map ONCE. Recentering on the user's position is handled by the
    // geolocation effect below (setView) + posRef — never rebuild the whole map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, [supabase]);

  useEffect(() => {
    supabase
      .from('mushroom_species')
      .select('id,norwegian_name,swedish_name,edibility')
      .then(({ data }) => {
        const nameMap = new Map<number, string>();
        const ediMap = new Map<number, string>();
        for (const s of data ?? []) {
          nameMap.set(s.id as number, getSpeciesDisplayName({
            norwegian_name: s.norwegian_name as string | null,
            swedish_name: s.swedish_name as string | null
          }, locale) || t('mushroomFallback'));
          if (s.edibility) ediMap.set(s.id as number, s.edibility as string);
        }
        speciesNamesRef.current = nameMap;
        speciesEdibilityRef.current = ediMap;
      });
  }, [locale, supabase, t]);

  useEffect(() => {
    setOfflineAreas(readOfflineAreas());
  }, []);

  useEffect(() => {
    if (latitude != null && longitude != null) {
      posRef.current = { lat: latitude, lng: longitude };
      if (mapRef.current) {
        mapRef.current.setView([latitude, longitude], 13);
      }
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

  // Status messages surface as transient toasts (no permanent boxes cluttering
  // the map). topMsg/speciesMsg are still the single source; we just render
  // them as toasts when they change to a value.
  useEffect(() => {
    if (topMsg) toast(topMsg);
  }, [topMsg]);

  useEffect(() => {
    if (speciesMsg) toast(speciesMsg);
  }, [speciesMsg]);

  useEffect(() => {
    if (geoError) toast.error(t('gpsUnavailable'), { id: 'map-geolocation-error' });
  }, [geoError, t]);

  return (
    <div className="relative h-[calc(100vh-8.5rem)] overflow-hidden rounded-xl border border-gray-200">
      <div ref={containerRef} className="h-full w-full" />

      <MapFilters
        filters={filters}
        onChange={setFilters}
        onSelectPlace={(lat, lng) => mapRef.current?.setView([lat, lng], 13)}
      />

      <div className="absolute left-1/2 top-3 z-[1000] flex w-[calc(100%-7rem)] max-w-md -translate-x-1/2 flex-col items-center gap-1">
        <div className="w-full">
          {selectedSpeciesName ? (
            <div className="flex items-center justify-between gap-2 rounded-full bg-forest-800 px-3 py-2 text-xs font-medium text-white shadow-lg">
              <span className="truncate">🍄 {t('promisingSpotsFor', { species: selectedSpeciesName })}</span>
              <button
                type="button"
                onClick={clearSpeciesSearch}
                className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 font-semibold hover:bg-white/30"
              >
                {t('reset')}
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={speciesSearch}
                onChange={(event) => searchSpeciesForSpots(event.target.value)}
                placeholder={t('whichMushroomToday')}
                className="w-full rounded-full bg-white/95 px-4 py-2 text-xs text-gray-800 shadow-lg backdrop-blur placeholder:text-gray-500 focus:outline-none"
              />
              {speciesSuggestions.length > 0 ? (
                <div className="absolute left-0 right-0 top-full z-[1001] mt-1 max-h-48 overflow-auto rounded-xl bg-white shadow-xl">
                  {speciesSuggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectSpeciesForSpots(s.id, s.name)}
                      className="block w-full px-3 py-2 text-left text-xs text-gray-800 hover:bg-gray-50"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex justify-center gap-1.5">
          <button
            type="button"
            onClick={toggleOccurrences}
            className={`rounded-full px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur ${
              showOccurrences ? 'bg-forest-800 text-white hover:bg-forest-700' : 'bg-white/95 text-gray-800 hover:bg-white'
            }`}
          >
            {showOccurrences ? (occCount ? t('hideFindingsCount', { count: occCount }) : t('hideFindings')) : t('findingsButton')}
          </button>
          <button
            type="button"
            onClick={() => (topSpots ? clearTopSpots() : void generateTopSpots())}
            disabled={topLoading}
            className={`rounded-full px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur disabled:opacity-60 ${
              topSpots ? 'bg-forest-800 text-white hover:bg-forest-700' : 'bg-white/95 text-gray-800 hover:bg-white'
            }`}
          >
            {topLoading ? t('searching') : topSpots ? t('hideSpots') : t('promisingSpotsButton')}
          </button>
          <button
            type="button"
            onClick={() => {
              setToolsOpen((open) => !open);
              setOfflineOpen(false);
            }}
            aria-expanded={toolsOpen}
            aria-controls="map-more-tools"
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur ${
              toolsOpen || offlineOpen || speciesSpots
                ? 'bg-forest-800 text-white hover:bg-forest-700'
                : 'bg-white/95 text-gray-800 hover:bg-white'
            }`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
            {t('moreTools')}
          </button>
        </div>
        {toolsOpen ? (
          <div id="map-more-tools" className="w-full max-w-xs rounded-xl border border-gray-200 bg-white/95 p-2 shadow-xl backdrop-blur">
            <div className="mb-1 flex items-center justify-between px-1">
              <p className="text-xs font-semibold text-gray-900">{t('moreToolsHeading')}</p>
              <button
                type="button"
                onClick={() => setToolsOpen(false)}
                aria-label={t('closeTools')}
                className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid gap-1">
              {billing.isLoading ? (
                <p className="px-2 py-1.5 text-xs text-gray-500">{t('checkingPlan')}</p>
              ) : hasOfflineAccess ? (
                <button
                  type="button"
                  onClick={() => {
                    setToolsOpen(false);
                    if (speciesSpots) clearSpeciesSpots();
                    else void generateSpeciesSpots();
                  }}
                  disabled={speciesLoading}
                  className="rounded-lg px-2 py-2 text-left text-xs font-medium text-gray-800 hover:bg-gray-100 disabled:opacity-60"
                >
                  {speciesLoading ? t('loading') : speciesSpots ? `📸 ${t('hidePhotos')}` : t('photosButton')}
                </button>
              ) : (
                <NonNativeOnly>
                  <Link href="/pricing" className="rounded-lg px-2 py-2 text-xs font-medium text-forest-900 hover:bg-gray-100">
                    ⭐ {t('premiumTools')}
                  </Link>
                </NonNativeOnly>
              )}
              <button
                type="button"
                onClick={() => {
                  setToolsOpen(false);
                  setOfflineOpen(true);
                }}
                className="rounded-lg px-2 py-2 text-left text-xs font-medium text-gray-800 hover:bg-gray-100"
              >
                ⬇️ {t('offlineMap')}
              </button>
              {FLAGS.tripMode && !tripActive ? (
                <button
                  type="button"
                  onClick={() => {
                    setToolsOpen(false);
                    startTrip();
                  }}
                  className="rounded-lg px-2 py-2 text-left text-xs font-medium text-gray-800 hover:bg-gray-100"
                >
                  🎒 {t('trip')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {topAccess === 'free_limited' && topSpots ? (
          <NonNativeOnly>
            <Link
              href="/pricing"
              className="flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg hover:bg-amber-600"
            >
              🔒 {t('seeAll12Premium')}
            </Link>
          </NonNativeOnly>
        ) : null}
        {FLAGS.tripMode && tripActive ? (
          <div className="flex items-center gap-2 rounded-full bg-amber-700 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
            <span>🎒 {t('tripFindsCount', { count: tripFinds.length })}</span>
            <button
              type="button"
              onClick={endTrip}
              className="rounded-full bg-white/20 px-2 py-0.5 font-semibold hover:bg-white/30"
            >
              {t('endTrip')}
            </button>
          </div>
        ) : null}
        {showOccurrences ? (
          <div className="flex flex-wrap items-center justify-center gap-1">
            <div className="flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[11px] shadow-lg backdrop-blur">
              {(
                [
                  ['all', t('filterAll')],
                  ['edible', t('filterEdible')],
                  ['toxic', t('filterToxic')]
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setOccEdibilityFilter(val)}
                  className={`rounded-full px-2 py-0.5 font-medium ${
                    occEdibility === val ? 'bg-forest-800 text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleOccSeason}
              className={`rounded-full px-3 py-1 text-[11px] font-medium shadow-lg backdrop-blur ${
                occSeason ? 'bg-amber-600 text-white' : 'bg-white/95 text-gray-700 hover:bg-white'
              }`}
            >
              {occSeason ? t('onlyInSeasonNow') : t('showAllTimes')}
            </button>
          </div>
        ) : null}
      </div>

      {/* The prediction verdict + "hvorfor" + source credit now live in the
          consolidated HotspotPanel below — shown for every query, not just when
          a species is selected. */}

      {offlineOpen ? (
      <div className="absolute left-3 right-3 top-28 z-[1050] max-h-[calc(100%-8rem)] overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:left-auto sm:w-72">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900">{t('offlineMap')}</p>
          <div className="flex items-center gap-2">
            {billing.isLoading ? <span className="text-[11px] text-gray-500">{t('checkingPlan')}</span> : null}
            <button
              type="button"
              onClick={() => setOfflineOpen(false)}
              aria-label={t('hideOfflineMap')}
              className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showOfflineUpsell ? (
          <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-2">
            <p className="text-xs text-amber-800">{t('offlineSaveRequiresPremium')}</p>
            <NonNativeOnly>
              <Link href="/pricing" className="text-xs font-medium text-amber-900 underline">
                {t('upgradePlan')}
              </Link>
            </NonNativeOnly>
          </div>
        ) : null}

        <label className="mt-2 block text-xs font-medium text-gray-700">
          {t('areaName')}
          <input
            value={offlineName}
            onChange={(event) => setOfflineName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            placeholder={t('areaNamePlaceholder')}
          />
        </label>

        <button
          type="button"
          onClick={() => void saveCurrentAreaOffline()}
          disabled={billing.isLoading || !hasOfflineAccess || offlineBusy}
          className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-forest-800 px-2 py-2 text-xs font-medium text-white hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {offlineBusy ? t('saving') : t('saveMapArea')}
        </button>

        {offlineStatus ? <p className="mt-2 text-[11px] text-gray-700">{offlineStatus}</p> : null}

        <div className="mt-2 max-h-36 space-y-1 overflow-auto">
          {offlineAreas.map((area) => (
            <div key={area.id} className="rounded-lg border border-gray-200 bg-white p-2">
              <p className="truncate text-xs font-medium text-gray-900">{area.name}</p>
              <p className="text-[11px] text-gray-600">
                {t('tilesZoom', { tiles: area.cachedTiles, zoom: area.zoom })}
              </p>
              <div className="mt-1 flex gap-1">
                <button
                  type="button"
                  onClick={() => focusSavedArea(area)}
                  className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-800 hover:bg-gray-50"
                >
                  <Navigation className="h-3 w-3" />
                  {t('goTo')}
                </button>
                <button
                  type="button"
                  onClick={() => deleteSavedArea(area.id)}
                  className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-[11px] text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-3 w-3" />
                  {t('delete')}
                </button>
              </div>
            </div>
          ))}
          {offlineAreas.length === 0 ? <p className="text-[11px] text-gray-600">{t('noSavedAreas')}</p> : null}
        </div>
      </div>
      ) : null}

      <button
        type="button"
        onClick={locateMe}
        disabled={locating}
        className="absolute bottom-20 right-4 z-[1000] flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-xl shadow-xl backdrop-blur transition-colors hover:bg-white disabled:opacity-60"
        aria-label={t('findMyPosition')}
        title={t('findMyPosition')}
      >
        {locating ? '…' : '📍'}
      </button>

      <button
        onClick={() => setShowAddSheet(true)}
        className="absolute bottom-4 right-4 z-[1000] h-14 w-14 rounded-full bg-forest-800 text-3xl text-white shadow-xl transition-colors hover:bg-forest-700"
        aria-label={t('addFinding')}
      >
        +
      </button>

      {showIntro ? (
        <div
          className="absolute inset-0 z-[1100] flex items-end justify-center bg-black/30 p-4 sm:items-center"
          onClick={dismissIntro}
        >
          <div className="max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <p className="text-base font-semibold text-gray-900">{t('introTitle')}</p>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              <li>📍 {t.rich('introFindings', { b: (chunks) => <b>{chunks}</b> })}</li>
              <li>⭐ {t.rich('introSpots', { b: (chunks) => <b>{chunks}</b> })}</li>
              <li>🛰️ {t.rich('introSatellite', { b: (chunks) => <b>{chunks}</b> })}</li>
              <li>{t.rich('introLocate', { b: (chunks) => <b>{chunks}</b> })}</li>
            </ul>
            <button
              type="button"
              onClick={dismissIntro}
              className="mt-4 w-full rounded-full bg-forest-800 px-4 py-2 text-sm font-medium text-white hover:bg-forest-700"
            >
              {t('introGotIt')}
            </button>
          </div>
        </div>
      ) : null}

      {showAddSheet ? (
        <AddFindingSheet
          latitude={latitude}
          longitude={longitude}
          onClose={() => setShowAddSheet(false)}
          onSaved={(speciesName) => {
            setShowAddSheet(false);
            void loadFindings();
            if (tripActiveRef.current) addTripFind(speciesName);
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

    </div>
  );
}
