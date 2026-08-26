'use client';

import Link from 'next/link';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import { NonNativeOnly } from '@/components/native/NonNativeOnly';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, MoreHorizontal, Navigation, Trash2, X } from 'lucide-react';
import { createRoot, Root } from 'react-dom/client';
import { createClient } from '@/lib/supabase/client';
import { fetchRpcPaged } from '@/lib/supabase/paged-rpc';
import { useGeolocation, watchPositionUntilAccurate } from '@/lib/hooks/useGeolocation';
import { getRegion } from '@/lib/utils/region';
import { usePrediction } from '@/lib/hooks/usePrediction';
import { useBillingStatus } from '@/lib/hooks/useBilling';
import { PredictionHotspot, PredictionResponse, PredictionTile } from '@/types/prediction';
import { AddFindingSheet } from './AddFindingSheet';
import { findingPopupElement } from './findingPopupElement';
import { HotspotPanel } from './HotspotPanel';
import { MapFilters, MapFilterState } from './MapFilters';
import { MapFinding } from '@/types/finding';
import { OwnFindingRow, ownFindingToMapFinding } from '@/lib/utils/map-findings';
import {
  formatUncertaintyMeters,
  occurrenceYearCutoff,
  passesYearCutoff,
  type OccurrenceYearFilter
} from '@/lib/utils/occurrence-filters';
import {
  OfflineArea,
  OSM_TILE_TEMPLATE,
  SATELLITE_TILE_TEMPLATE,
  TERRAIN_TILE_TEMPLATE,
  cacheMapTilesForArea,
  clearMapTileCache,
  estimateStorageMb,
  readOfflineAreas,
  removeOfflineAreaById,
  removeOfflineAreaTiles,
  saveOfflineAreas
} from '@/lib/utils/offlineMap';
import { buildExplanation, scoreVerdict } from '@/lib/utils/prediction-explanation';
import type { Locale } from '@/i18n/config';
import type { AreaReport } from '@/lib/prediction/area-report';
import { intlLocale } from '@/lib/utils/intl-locale';
import { colorForScore, fillOpacitiesForScores } from '@/lib/utils/condition-colors';
import { scoreToCondition } from '@/lib/utils/prediction';
import { bestTilePerCell } from '@/lib/prediction/collapse-tiles';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import { PlaceResult, searchPlaces } from '@/lib/utils/place-search';
import { filterWithinRadiusKm, haversineKm } from '@/lib/utils/geo-distance';
import { SEARCH_AREA_RADIUS_M } from '@/lib/utils/spot-area';
import { createTopSpotArea } from './topSpotArea';
import { markerHtml, markerShapeFor, type MarkerShape } from './speciesMarkerIcon';
import { buildTopSpotPopupHtml } from './topSpotPopup';
import { readLocal, readLocalJson, removeLocal, writeLocal } from '@/lib/utils/safe-storage';
import { PlaceForecastStrip } from './PlaceForecastStrip';
import { FLAGS } from '@/lib/flags';
import toast from 'react-hot-toast';
import { foreslaaVurdering } from '@/lib/vurdering/foreslaa';

type LeafletType = typeof import('leaflet');

/**
 * Hvor mange registrerte funn kartet henter for utsnittet. Verdien er et
 * tegne-budsjett (klyngelaget takler noen tusen punkter), ikke en databasegrense
 * — den hentes nå over flere sider fordi PostgREST kutter hvert enkelt svar ved
 * 1000 rader. Treffer vi taket, sier kartet fra i stedet for å late som det
 * viser alt. Se src/lib/supabase/paged-rpc.ts.
 *
 * Hevet fra 3000 til 6000 etter GBIF-importen 2026-08-04, som tok tabellen fra
 * 327 298 til 428 829 funn. Med 3000 traff Oslo-utsnittet taket ved vanlig zoom
 * — brukeren fikk «det finnes flere, zoom inn» på selve hjemstedet sitt, og
 * artsfiltrene gjaldt da bare de hentede radene, ikke alle.
 *
 * Målt før hevingen: 1000 rader på 1,9 s for Oslo ved mobil zoom 11, hentet over
 * flere sider. Budsjettet er tegnetid, ikke databasen — klyngelaget takler
 * størrelsen, og laget tømmes og hentes på nytt ved panorering uansett.
 */
const OCCURRENCE_FETCH_LIMIT = 6000;

const FOREST_LABEL: Record<string, string> = {
  gran: 'granskog',
  furu: 'furuskog',
  bar: 'barskog',
  lauv: 'løvskog',
  blandet: 'blandingsskog',
  apent: 'åpent landskap'
};

/**
 * Ett av de anbefalte stedene fra /api/prediction/grid?top=N.
 *
 * `report` er områderapporten: serveren setter den sammen av feltene den har
 * (skogtype, bonitet, volum, avstand til målingen, vær, sesong, nabolaget) og
 * sender den ferdig formulert på leserens språk. Den er premium-halvdelen av
 * funksjonen, så gratisbrukere får en nål uten rapport.
 */
type TopSpot = {
  lat: number;
  lng: number;
  score: number;
  forestType: string;
  productivity: number | null;
  verdict?: string;
  reasons?: string[];
  topSpecies?: string[];
  report?: AreaReport;
};



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
  // Trengs for popup-rotene under: de er løsrevne React-røtter uten tilgang
  // til providerens kontekst, så meldingene må sendes inn eksplisitt.
  const messages = useMessages();
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
  // PÅ FRA START. Laget var ferdig bygget — klynger, artsnavn, spiselighets-
  // farger, dato, sesong- og spiselighetsfilter — men sto avslått bak en knapp
  // som bare het «Vis funn». 327 298 ekte funn var altså usynlige for nesten
  // alle som åpnet kartet.
  //
  // Dette er den eneste opplysningen appen har som er KONKRET og SANN uten
  // forbehold: noen sto her og fant denne arten, på denne datoen. Prognosen kan
  // vi ikke selge inn som mer enn den er (romlig AUC ~0,52), men et funn er et
  // funn. Datoen i popupen er det som gjør det til historie i stedet for et
  // løfte — se formatFound, som med vilje skriver bare årstall når GBIF-raden
  // mangler dag.
  //
  // Målt før den ble skrudd på: 277 ms–2 s per utsnitt (Oslo mobil zoom 11 ga
  // 1000 rader på 1,9 s). Laget tømmes og hentes på nytt ved panorering.
  const showOccurrencesRef = useRef(true);
  const speciesNamesRef = useRef<Map<number, string>>(new Map());
  // Artsnavnene lastes asynkront, og varmelaget rekker som regel å tegne før de
  // er inne. Uten dette sto de første sirklene igjen uten artsnavn til neste
  // panorering. En teller er nok — selve navnene ligger i refen.
  const [speciesNamesVersion, setSpeciesNamesVersion] = useState(0);
  const speciesEdibilityRef = useRef<Map<number, string>>(new Map());
  /** Markørform per art, utledet av slekten. Se speciesMarkerIcon.ts. */
  const speciesShapeRef = useRef<Map<number, MarkerShape>>(new Map());
  const occEdibilityRef = useRef<'all' | 'edible' | 'toxic'>('all');
  const occSeasonRef = useRef(false);
  const occYearRef = useRef<OccurrenceYearFilter>('all');
  // Migrasjon 054 gir RPC-en p_min_year. Før den er kjørt i prod finnes ikke
  // parameteren, og kallet feiler — da faller vi tilbake til klient-side
  // filtrering (med trunkeringsskjevheten kartet allerede advarer mot) i
  // stedet for et blankt lag. Husket per økt så vi ikke prøver forgjeves på
  // hver panorering.
  const occYearParamUnsupportedRef = useRef(false);
  // To raske filterklikk (eller klikk + panorering) starter overlappende
  // lastinger; hver rydder og fyller clusteret når DENS henting er ferdig, så
  // den tregeste vinner — og chip og kart kan vise hver sin sannhet. Bare den
  // nyeste generasjonen får tegne.
  const occLoadGenRef = useRef(0);
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
  /**
   * Posisjonen «Legg til funn» skal bruke når GPS ikke er å få tak i.
   *
   * Skjemaet krevde `useGeolocation()` og avviste lagring uten. Det låste ute
   * fire helt vanlige tilfeller: desktop uten GPS, avslått posisjonstillatelse,
   * dårlig signal under tregrenser — og det vanligste av alt, å registrere et
   * funn i etterkant hjemmefra. «Jeg fant kantarell ved den lysningen i går»
   * lot seg rett og slett ikke lagre.
   *
   * Kartsenteret er svaret som allerede ligger på skjermen: brukeren panorerer
   * dit hen var, og trykker pluss. Skjemaet sier tydelig hvilken av de to
   * posisjonene det bruker, så ingen tror de lagrer en GPS-måling de ikke har.
   */
  const [addSheetFallback, setAddSheetFallback] = useState<{ lat: number; lng: number } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Brukernavnet vises i popupen. For «Kun mine funn» leser vi funnene rett fra
  // tabellen, som ikke har den join-en public_findings-viewet gjør.
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [showOccurrences, setShowOccurrences] = useState(true);
  const [occCount, setOccCount] = useState(0);
  const [occTruncated, setOccTruncated] = useState(false);
  const [occEdibility, setOccEdibility] = useState<'all' | 'edible' | 'toxic'>('all');
  const [occSeason, setOccSeason] = useState(false);
  const [occYear, setOccYear] = useState<OccurrenceYearFilter>('all');
  const [showIntro, setShowIntro] = useState(false);
  const [tripActive, setTripActive] = useState(false);
  const [tripFinds, setTripFinds] = useState<string[]>([]);
  const [speciesSearch, setSpeciesSearch] = useState('');
  const [speciesSuggestions, setSpeciesSuggestions] = useState<{ id: number; name: string }[]>([]);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceResult[]>([]);
  // Set when the user searches a place — the forecast strip and the reset chip
  // follow the searched location instead of the GPS position.
  const [searchedPlace, setSearchedPlace] = useState<PlaceResult | null>(null);
  // Mirrors searchedPlace for the GPS effects, which must read the current
  // value without re-running when it changes.
  const searchedPlaceRef = useRef<PlaceResult | null>(null);
  // Monotonic id so a slow older typeahead response can't overwrite a newer one.
  const searchReqRef = useRef(0);
  const [selectedSpeciesName, setSelectedSpeciesName] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [predictionCoords, setPredictionCoords] = useState<{ lat: number | null; lon: number | null }>({
    lat: null,
    lon: null
  });
  const [tileHotspots, setTileHotspots] = useState<PredictionHotspot[]>([]);
  // Snitt over ALLE kollapsede ruter i utsnittet, ikke bare de 80 vi tegner.
  // Tegnelista er kuttet på score, så et snitt av den er systematisk for høyt.
  const [tileCellAverage, setTileCellAverage] = useState<number | null>(null);
  const [offlineAreas, setOfflineAreas] = useState<OfflineArea[]>([]);
  const [offlineName, setOfflineName] = useState('');
  const [offlineStatus, setOfflineStatus] = useState<string | null>(null);
  const [offlineBusy, setOfflineBusy] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [storageMb, setStorageMb] = useState<number | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [topSpots, setTopSpots] = useState<TopSpot[] | null>(null);
  const [topLoading, setTopLoading] = useState(false);
  const [topMsg, setTopMsg] = useState<string | null>(null);
  const [topAccess, setTopAccess] = useState<'premium_full' | 'free_limited' | null>(null);
  const [speciesSpots, setSpeciesSpots] = useState<{ speciesId: number; norwegianName: string; displayName?: string; latinName: string; imageUrl: string; lat: number; lng: number; score: number; verdict?: string; reasons?: string[] }[] | null>(null);
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


  const updateHeatLayer = useCallback(
    async (data: PredictionResponse | undefined) => {
      const map = mapRef.current;
      const heatLayer = heatLayerRef.current;
      if (!map || !heatLayer) return;

      const leaflet = (await import('leaflet')).default;
      heatLayer.clearLayers();

      // Dekkevnen regnes over HELE settet før noe tegnes, ikke rute for rute.
      // Se fillOpacitiesForScores: bøttene er bredere enn variasjonen på én
      // skjerm (median 7 poeng mot 10 i smaleste bøtte), så en absolutt skala
      // gir samme verdi til alt som er synlig. Normalisert mot det som faktisk
      // er på skjermen finnes det alltid kontrast.
      const synligeRuter = data?.hotspots ?? [];
      const dekkevner = fillOpacitiesForScores(synligeRuter.map((s) => s.score));

      for (const [indeks, spot] of synligeRuter.entries()) {
        // TEGNINGEN SKAL IKKE VÆRE MER PRESIS ENN DATAENE.
        //
        // Her sto en sirkel med radius 90 + score·3 meter — 270 m ved score 60.
        // Rasteret bak tallet har 0,06–0,07° mellom målepunktene (3,4–4,0 km i
        // øst–vest, 6,7–7,8 km i nord–sør), og fallback-banen klumper funn på
        // hele hundredels grader. En liten lys sirkel leses som «soppen står
        // inni denne ringen», og den romlige delen av modellen har en ærlig AUC
        // rundt 0,52 — den kan ikke bære en slik påstand.
        //
        // Rutene tegnes derfor i sin FAKTISKE størrelse når vi kjenner den
        // (grid_size_deg følger med flisa / settes av API-et). Uten den faller vi
        // tilbake til den gamle sirkelen, som er det eneste ærlige vi kan si om
        // et punkt uten kjent oppløsning.
        const color = colorForScore(spot.score).hex;
        const cellDeg = spot.gridSizeDeg && spot.gridSizeDeg > 0 ? spot.gridSizeDeg : null;
        // ⚠️ INGEN KANT PÅ DETTE LAGET.
        //
        // Størrelsen er riktig — rasteret har 0,06–0,07° mellom målepunktene —
        // men med `weight: 1` fikk hver celle en synlig strek, og siden cellene
        // ligger kant i kant ble hele kartet et oransje rutenett. Ærligheten lå
        // i STØRRELSEN, ikke i streken; streken la bare til en presisjon som
        // ikke finnes (en grense der ingen grense går) og gjorde kartet
        // uleselig.
        //
        // Uten kant og med lav dekkevne smelter nabocellene sammen til et mykt
        // varmekart — som er nettopp det et lag med 3–8 km oppløsning bør se ut
        // som. Oppløsningen står i klartekst i popupen i stedet.
        //
        // Fortsatt ingen kant: cellene ligger kant i kant, og en synlig strek gjør
        // hele kartet til et rutenett — og påstår en grense der ingen går.
        // Ærligheten ligger i STØRRELSEN på ruta, ikke i streken.
        const fillOpacity = dekkevner[indeks];
        const shape = cellDeg
          ? leaflet.rectangle(
              [
                [spot.lat - cellDeg / 2, spot.lng - cellDeg / 2],
                [spot.lat + cellDeg / 2, spot.lng + cellDeg / 2]
              ],
              { color, fillColor: color, fillOpacity, weight: 0, stroke: false }
            )
          : leaflet.circle([spot.lat, spot.lng], {
              radius: Math.max(120, Math.min(450, 90 + spot.score * 3)),
              color,
              fillColor: color,
              // Sirkelen er mye mindre enn ruta, så den tåler litt mer.
              fillOpacity: Math.min(0.6, fillOpacity + 0.07),
              weight: 0,
              stroke: false
            });

        // Si hvilken art tallet gjelder. «60/100» på et sted er meningsløst
        // alene: det er 60 for kantarell og 2 for vanlig morkel på nøyaktig
        // samme rute. Uten artsfilter er sirkelen den BESTE arten der nå, og
        // teksten sier det ("Best nå: …") så tallet ikke leses som en påstand
        // om sopp generelt.
        const speciesName = spot.speciesId != null ? speciesNamesRef.current.get(spot.speciesId) : undefined;

        // Dommen først, tallet i parentes. Før sto det rå «Best nå: Kantarell
        // 52/100 — Gjelder hele ruta — ikke et bestemt punkt i den», altså et
        // tall uten mening etterfulgt av en ren ansvarsfraskrivelse. Ingen av
        // delene sa om det var verdt å dra ut, og alle ruter så like ut.
        //
        // Forbeholdet om at ruta gjelder som helhet er IKKE fjernet — det står i
        // popupen (searchAreaExplainer), der brukeren faktisk leser detaljer. En
        // tooltip er et halvt sekunds blikk, og er feil sted for et forbehold.
        const label = t('hotspotTooltipVerdict', {
          verdict: scoreVerdict(spot.score, locale as Locale, speciesName),
          score: spot.score
        });

        shape.bindTooltip(label, { direction: 'top' });
        heatLayer.addLayer(shape);
      }
    },
    [locale, speciesNamesVersion, t]
  );

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
      setTileCellAverage(null);
      return;
    }

    const tiles = (data ?? []) as PredictionTile[];
    // Rasteret har én flis per ART per rute, så uten artsfilter kommer det sju
    // rader på nøyaktig samme koordinat. Før dette tegnet kartet alle sju oppå
    // hverandre; RPC-en sorterer score DESC og Leaflet tegner i mottatt
    // rekkefølge, så den LAVESTE lå øverst og var den pekeren traff. Derfor sto
    // det «2/100» (vanlig morkel, i august) på en rute der kantarell lå på 60.
    const cells = bestTilePerCell(tiles);
    const mapped: PredictionHotspot[] = cells.slice(0, 80).map((tile) => ({
      lat: tile.center_lat,
      lng: tile.center_lng,
      count: 1,
      score: tile.score,
      speciesId: tile.species_id,
      // Rutas faktiske størrelse, slik generatoren la den ut (tile-regions.ts).
      // Kartet tegner den i denne størrelsen — se updateHeatLayer.
      gridSizeDeg: Number(tile.metadata?.grid_size_deg) || null
    }));
    // Snittet i panelet skal IKKE regnes av de 80 høyest scorende — det er
    // trunkert på score og drar tallet oppover. `cells` er allerede kollapset
    // til beste art per rute, så dette er et ærlig snitt over stedene i
    // utsnittet.
    setTileCellAverage(
      cells.length > 0 ? Math.round(cells.reduce((sum, c) => sum + c.score, 0) / cells.length) : null
    );
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

  // "Lovende områder nær meg": ett mykt søkeOMRÅDE per lovende rute i rutenettet.
  //
  // Her sto det nummererte nåler. En nål er kartets mest presise form, og tallet
  // i den er en rangering — to påstander vi ikke har dekning for: koordinaten er
  // senteret i en 1,4–10 km bred rute (se spot-area.ts), og valideringen skiller
  // ikke område 1 fra område 4 innenfor skog. Se topSpotArea.ts for formvalgene.
  const renderTopSpots = useCallback(
    async (
      spots: TopSpot[],
      origin: { lat: number; lng: number },
      opts?: { limited?: boolean; speciesId?: number | null; radiusM?: number }
    ) => {
      const layer = topLayerRef.current;
      if (!mapRef.current || !layer) return;
      const leaflet = (await import('leaflet')).default;
      layer.clearLayers();
      const radiusM = opts?.radiusM && opts.radiusM > 0 ? opts.radiusM : SEARCH_AREA_RADIUS_M;
      // Fyllstyrken regnes over HELE settet før noe tegnes. Sirklene er de 12
      // høyest scorende cellene lokalt, så den globale paletten gir dem én farge
      // i 78 % av tilfellene — 12 identiske ringer uten grunn til å velge én.
      // Se fillOpacitiesForScores. Fargen forblir absolutt.
      const områdeDekkevner = fillOpacitiesForScores(spots.map((s) => s.score));
      spots.forEach((spot, spotIndex) => {
        const color = colorForScore(spot.score).hex;
        const popup = buildTopSpotPopupHtml({
          spot,
          distanceKm: haversineKm(origin.lat, origin.lng, spot.lat, spot.lng),
          directionLabel: t(`dir_${bearingLabel(origin.lat, origin.lng, spot.lat, spot.lng)}`),
          radiusM,
          limited: opts?.limited,
          speciesId: opts?.speciesId ?? null,
          locale,
          t: t as (key: string, values?: Record<string, string | number>) => string
        });
        const { area, center } = createTopSpotArea(leaflet, spot, radiusM, color, områdeDekkevner[spotIndex]);
        // Popupen henger på begge: flata åpner den der du trykker (Leaflet gir
        // Path-lag klikkpunktet), prikken er ankeret når området er lite.
        area.bindPopup(popup).addTo(layer);
        area.on('popupopen', (event) => bindSpotFeedback(event.popup));
        center.bindPopup(popup).addTo(layer);
        center.on('popupopen', (event) => bindSpotFeedback(event.popup));
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
      // Origin priority: a searched place beats the GPS fix — otherwise
      // «steinsopp ved Hamar» computed spots around the user's home instead.
      const center = map.getCenter();
      const place = searchedPlaceRef.current;
      const originLat = place?.lat ?? latitude ?? center.lat;
      const originLng = place?.lng ?? longitude ?? center.lng;

      type Spot = TopSpot;

      // Start local (5 km) and widen only when the near area has no promising
      // forest, so users in fields/towns still get pointed at the nearest good
      // ground instead of a dead-end message. 35 km stays inside the grid
      // route's bounds cap (2·35/111≈0.63° lat, ≤1.76° lng even at 69°N).
      const RADII_KM = [5, 10, 20, 35];
      // Rutenettet vi ber om. Serveren kan sette den ned (gratisbrukere får 5),
      // og sier i så fall fra i svaret — derfor leses cellestørrelsen derfra.
      const GRID_N = 7;
      let spots: Spot[] = [];
      let usedRadius = RADII_KM[0];
      let limited = false;
      // Radiusen sirklene tegnes med: halve cellebredden i rutenettet som
      // faktisk ble brukt. Se src/lib/utils/spot-area.ts.
      let areaRadiusM = SEARCH_AREA_RADIUS_M;

      for (let i = 0; i < RADII_KM.length; i++) {
        const radiusKm = RADII_KM[i];
        const latDelta = radiusKm / 111;
        const lngDelta = radiusKm / (111 * Math.cos((originLat * Math.PI) / 180));
        const box = {
          minLat: originLat - latDelta,
          maxLat: originLat + latDelta,
          minLng: originLng - lngDelta,
          maxLng: originLng + lngDelta
        };
        const params = new URLSearchParams({
          minLat: String(box.minLat),
          maxLat: String(box.maxLat),
          minLng: String(box.minLng),
          maxLng: String(box.maxLng),
          n: String(GRID_N),
          top: '12'
        });
        if (sid) params.set('speciesId', String(sid));

        const res = await fetch(`/api/prediction/grid?${params.toString()}`, { cache: 'no-store' });
        const data = await res.json();
        if (res.status === 403) {
          setTopMsg(t('requiresPremium'));
          return;
        }
        if (res.status === 429) {
          // Rate limited mid-expansion: stop widening, keep whatever the
          // server told us rather than masking it with a generic error.
          setTopMsg(data?.error ?? t('couldNotFindSpots'));
          return;
        }
        if (!res.ok) {
          setTopMsg(data?.error ?? t('couldNotFindSpots'));
          return;
        }

        // Rutenettet legges ut over hele BOKSEN, så hjørnerutene ligger opptil
        // √2 × radius unna. Uten dette sa banneret «6 lovende steder innen 5 km»
        // over en nål som selv skrev «~6,1 km» — to tall som motsier hverandre i
        // samme kartvisning. Vi kutter det som ligger utenfor radiusen vi lover.
        const found = filterWithinRadiusKm(
          { lat: originLat, lng: originLng },
          (data.cells ?? []) as Spot[],
          radiusKm
        );
        if (found.length > 0) {
          spots = found;
          usedRadius = radiusKm;
          limited = data.access === 'free_limited';
          // Fast én kvadratkilometer, ikke hele samplingscellen. Cellen kunne
          // bli 10 km bred, og da dekket områdene hele landskapet — et kart som
          // markerer alt markerer ingenting. Se SEARCH_AREA_RADIUS_M.
          areaRadiusM = SEARCH_AREA_RADIUS_M;
          break;
        }

        // Nothing here — tell the user we're widening before the next attempt.
        if (i < RADII_KM.length - 1) {
          setTopMsg(t('expandingSearch', { km: radiusKm }));
        }
      }

      if (spots.length === 0) {
        clearTopSpots();
        setTopMsg(t('littleForestData', { km: RADII_KM[RADII_KM.length - 1] }));
        return;
      }

      setTopAccess(limited ? 'free_limited' : 'premium_full');
      setTopSpots(spots);
      await renderTopSpots(
        spots,
        { lat: originLat, lng: originLng },
        { limited, speciesId: sid ?? null, radiusM: areaRadiusM }
      );
      const leaflet = (await import('leaflet')).default;
      const bounds = leaflet.latLngBounds(spots.map((s) => [s.lat, s.lng] as [number, number]));
      bounds.extend([originLat, originLng]);
      // Kartobjektet er nå flata, ikke senterpunktet. Uten dette kunne et
      // område på 10 km bli klippet halvveis av skjermkanten etter fitBounds.
      const padLat = areaRadiusM / 111_320;
      const padLng = padLat / Math.max(0.2, Math.cos((originLat * Math.PI) / 180));
      spots.forEach((s) => {
        bounds.extend([s.lat + padLat, s.lng + padLng]);
        bounds.extend([s.lat - padLat, s.lng - padLng]);
      });
      map.fitBounds(bounds.pad(0.2));
      const sName = sid != null ? speciesNamesRef.current.get(sid) ?? null : null;
      setTopMsg(
        limited
          ? t('topSpotsLimited', { count: spots.length })
          : sName
            ? t('topSpotsForSpecies', { count: spots.length, species: sName, km: usedRadius })
            : t('topSpotsGeneric', { count: spots.length, km: usedRadius })
      );
    } catch {
      setTopMsg(t('couldNotFindSpots'));
    } finally {
      setTopLoading(false);
    }
  }, [latitude, longitude, filters.speciesId, renderTopSpots, clearTopSpots, t]);

  // One search box, two answers: «hvilken sopp» AND «hvor». Both lookups run
  // on the same keystrokes so «steinsopp» and «Hamar» each resolve without the
  // user having to know which kind of thing they're typing.
  const searchSpeciesForSpots = useCallback(
    (value: string) => {
      setSpeciesSearch(value);
      if (speciesSearchTimer.current) clearTimeout(speciesSearchTimer.current);
      if (value.trim().length < 2) {
        setSpeciesSuggestions([]);
        setPlaceSuggestions([]);
        return;
      }
      const reqId = ++searchReqRef.current;
      speciesSearchTimer.current = setTimeout(async () => {
        const [speciesRes, places] = await Promise.all([
          supabase
            .from('mushroom_species')
            .select('id,norwegian_name,swedish_name')
            .or(
              `norwegian_name.ilike.%${value}%,swedish_name.ilike.%${value}%,latin_name.ilike.%${value}%,synonyms_text.ilike.%${value}%`
            )
            .order('norwegian_name', { ascending: true })
            .limit(6),
          searchPlaces(value)
        ]);
        // A cached place lookup can beat an older uncached one home; without
        // this the dropdown could end up showing results for a query the user
        // already typed past.
        if (reqId !== searchReqRef.current) return;
        setSpeciesSuggestions(
          ((speciesRes.data ?? []) as { id: number; norwegian_name: string; swedish_name: string | null }[]).map((d) => ({
            id: d.id,
            name: getSpeciesDisplayName(d, locale)
          }))
        );
        setPlaceSuggestions(places.slice(0, 5));
      }, 250);
    },
    [locale, supabase]
  );

  /** Jump the map to a searched place and re-run the prediction for it. */
  const goToPlace = useCallback(
    (place: PlaceResult) => {
      setSpeciesSearch(place.name);
      setSpeciesSuggestions([]);
      setPlaceSuggestions([]);
      posRef.current = { lat: place.lat, lng: place.lng };
      mapRef.current?.setView([place.lat, place.lng], 12);
      // The prediction panel follows the map, not the GPS, once you search.
      setPredictionCoords({ lat: place.lat, lon: place.lng });
      searchedPlaceRef.current = place;
      setSearchedPlace(place);
      searchReqRef.current++;
    },
    []
  );

  const selectSpeciesForSpots = useCallback(
    (id: number, name: string) => {
      setFilters((prev) => ({ ...prev, speciesId: id }));
      setSelectedSpeciesName(name);
      setSpeciesSearch(name);
      setSpeciesSuggestions([]);
      setPlaceSuggestions([]);
      searchReqRef.current++; // discard any in-flight lookup for the old text
      void generateTopSpots(id);
    },
    [generateTopSpots]
  );

  const clearSpeciesSearch = useCallback(() => {
    setFilters((prev) => ({ ...prev, speciesId: null }));
    setSelectedSpeciesName(null);
    setSpeciesSearch('');
    setSpeciesSuggestions([]);
    setPlaceSuggestions([]);
    clearTopSpots();
  }, [clearTopSpots]);

  // "Soppbilder på kartet": round species photos on each species' best ground.
  const renderSpeciesSpots = useCallback(
    async (
      spots: { speciesId: number; norwegianName: string; displayName?: string; latinName: string; imageUrl: string; lat: number; lng: number; score: number; verdict?: string; reasons?: string[] }[]
    ) => {
      const layer = speciesLayerRef.current;
      if (!mapRef.current || !layer) return;
      const leaflet = (await import('leaflet')).default;
      layer.clearLayers();
      for (const spot of spots) {
        const color = colorForScore(spot.score).hex;
        const icon = leaflet.divIcon({
          className: 'species-spot-marker',
          html: `<div style="width:46px;height:46px;border-radius:9999px;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.5);overflow:hidden;background:${color}"><img src="${spot.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'"/></div>`,
          iconSize: [46, 46],
          iconAnchor: [23, 23]
        });
        const reasonsHtml = (spot.reasons ?? []).map((r) => `<div style="margin-top:3px">${r}</div>`).join('');
        const popup = `<div style="min-width:210px;max-width:265px">
          <div style="font-weight:700;color:#14532d">${spot.displayName || spot.norwegianName}</div>
          <div style="font-style:italic;color:#6b7280;font-size:11px">${spot.latinName}</div>
          <div style="color:#555;font-size:12px;margin-top:3px">${spot.verdict ?? t('promisingConditionsInArea')} · ${spot.score}/100</div>
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
      const spots = (data.spots ?? []) as { speciesId: number; norwegianName: string; displayName?: string; latinName: string; imageUrl: string; lat: number; lng: number; score: number; verdict?: string; reasons?: string[] }[];
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
    const gen = ++occLoadGenRef.current;
    type OccRow = {
      latitude: number;
      longitude: number;
      species_id: number | null;
      observed_at?: string | null;
      coordinate_uncertainty_m?: number | null;
    };
    const baseArgs = {
      min_lat: b.getSouth(),
      min_lng: b.getWest(),
      max_lat: b.getNorth(),
      max_lng: b.getEast(),
      p_species_id: filters.speciesId,
      p_limit: OCCURRENCE_FETCH_LIMIT
    };
    // Årsfilteret hører hjemme i RPC-en (migrasjon 054): filtrerer vi klient-
    // side inne i det avkuttede utvalget, kan «siste 5 år» vise tomt kart i
    // tette utsnitt selv om ferske funn finnes — trunkeringsskjevheten under.
    const yearCutoff = occurrenceYearCutoff(occYearRef.current, new Date());
    let serverYearFiltered = yearCutoff != null && !occYearParamUnsupportedRef.current;
    // PostgREST kutter hvert svar ved 1000 rader uansett hva p_limit sier, så
    // dette må pagineres — ellers viser kartet 1000 punkter som (fordi RPC-en
    // ikke sorterer) i praksis er én til to arter, og ser komplett ut.
    let result = await fetchRpcPaged<OccRow>(
      supabase,
      'get_occurrences_in_bounds',
      serverYearFiltered ? { ...baseArgs, p_min_year: yearCutoff } : baseArgs,
      { limit: OCCURRENCE_FETCH_LIMIT }
    );
    if (result.error && serverYearFiltered) {
      // fetchRpcPaged KASTER ikke — feil kommer som result.error. Kun den
      // KONKRETE «ukjent signatur»-feilen (PGRST202: «Could not find the
      // function … in the schema cache») betyr at migrasjon 054 ikke er
      // kjørt — da husker vi det for økta og filtrerer klient-side. Alle
      // andre feil (nettverksglipp midt i pagineringen, timeout på fjelltur)
      // skal IKKE degradere økta permanent: neste panorering prøver
      // server-side igjen, og denne lastingen faller bare tilbake én gang.
      const missingParam =
        result.error.code === 'PGRST202' || /schema cache|p_min_year/i.test(result.error.message);
      if (missingParam) occYearParamUnsupportedRef.current = true;
      serverYearFiltered = false;
      result = await fetchRpcPaged<OccRow>(supabase, 'get_occurrences_in_bounds', baseArgs, {
        limit: OCCURRENCE_FETCH_LIMIT
      });
    }
    const { rows: data, truncated } = result;
    const leaflet = (await import('leaflet')).default;
    // En nyere lasting er i gang — ikke rydd clusteret dens resultat skal inn i.
    if (gen !== occLoadGenRef.current) return;
    cluster.clearLayers();
    const names = speciesNamesRef.current;
    const edibilities = speciesEdibilityRef.current;
    const shapes = speciesShapeRef.current;
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
    const all = data;
    const points = all.filter((o) => {
      // Klient-fallbacken for årsfilteret — kun aktiv når RPC-en mangler
      // p_min_year (før migrasjon 054); ellers har serveren alt filtrert.
      if (!serverYearFiltered && !passesYearCutoff(o.observed_at, yearCutoff)) return false;
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
      // Formen sier HVA som ble funnet, fargen sier om det kan spises. Alle
      // funn var identiske prikker før — se speciesMarkerIcon.ts for hvorfor det
      // ble silhuetter og ikke emoji (Unicode har bare to soppemoji, og hver
      // plattform tegner dem ulikt).
      const shape = o.species_id != null ? shapes.get(o.species_id) ?? 'generisk' : 'generisk';
      const icon = leaflet.divIcon({
        className: 'occ-marker',
        html: markerHtml(shape, color, 16),
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      // SPISELIGHET UTEN KONTEKST ER EN TRYGGHETSERKLÆRING.
      //
      // Her sto ordet «Spiselig» alene i grønt, rett under artsnavnet, i en boks
      // som ellers bare handler om et historisk observasjonspunkt. Sammen med
      // filterknappen «🟢 Spiselige» leses kartet da som en plukkeliste over hvor
      // det står spiselig sopp. Etiketten er artens, ikke soppen brukeren
      // eventuelt står med — og et GBIF-punkt fra 2019 sier ingenting om hva som
      // vokser der nå. Begge deler står nå eksplisitt.
      const ediHtml = ediLabel
        ? `<br/><span style="color:${color};font-weight:600;font-size:12px">${t('speciesEdibility', { label: ediLabel })}</span><br/><span style="color:#6b7280;font-size:11px">${t('speciesEdibilityNote')}</span>`
        : '';
      const found = formatFound(o.observed_at);
      const foundHtml = found ? ` · ${found}` : '';
      // Ærlighets-metadata per punkt: «±X m» når GBIF oppga usikkerheten,
      // «ukjent» når feltet er NULL (alt importert før migrasjon 054 — ~76 %
      // av radene er fra før kvalitetsfilteret fantes). Feltet mangler helt
      // (undefined) før migrasjonen er kjørt; da vises ingen linje i stedet
      // for å kalle alt ukjent uten dekning i data.
      const uncertaintyLabel =
        o.coordinate_uncertainty_m === undefined
          ? null
          : formatUncertaintyMeters(o.coordinate_uncertainty_m) ?? t('coordUncertaintyUnknown');
      const uncertaintyHtml = uncertaintyLabel
        ? `<br/><span style="color:#6b7280;font-size:11px">${t('coordUncertainty', { value: uncertaintyLabel })}</span>`
        : '';
      const popup = `<div><b>${name}</b>${ediHtml}<br/><span style="color:#555;font-size:12px">${t('registeredFinding')}${foundHtml}</span>${uncertaintyHtml}<br/><span style="color:#6b7280;font-size:11px">${t('historicalFindingNote')}</span><br/><a href="https://www.google.com/maps/search/?api=1&query=${o.latitude},${o.longitude}" target="_blank" rel="noreferrer" style="color:#15803d;font-weight:600;font-size:12px;text-decoration:underline">${t('openInMap')}</a><br/><span style="color:#9ca3af;font-size:10px">Artsdatabanken/GBIF</span></div>`;
      leaflet.marker([o.latitude, o.longitude], { icon }).bindPopup(popup).addTo(cluster);
    }
    if (gen !== occLoadGenRef.current) return;
    setOccCount(points.length);
    // Avkuttingen skal ikke være stille: når vi traff taket viser kartet et
    // utvalg, og spiselighets-/sesongfiltrene over har filtrert INNI det
    // utvalget. Et tomt «giftige»-kart kan da skyldes avkuttingen, ikke at det
    // mangler giftige funn — og må aldri leses som en trygghetserklæring.
    setOccTruncated(truncated);
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
      setOccTruncated(false);
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

  const setOccYearFilter = useCallback(
    (value: OccurrenceYearFilter) => {
      occYearRef.current = value;
      setOccYear(value);
      void loadOccurrences();
    },
    [loadOccurrences]
  );

  // All localStorage-bruk under går via safe-storage. `window.localStorage`
  // KASTER (ikke returnerer null) når nettleseren blokkerer lagring — Chrome
  // med «Blokker alle informasjonskapsler», iOS Safari med lagring av. Begge
  // lesningene her kjører på hver mount av /map, så en ubeskyttet getItem tok
  // ned hele kartsiden for de brukerne. Kartet er produktet.
  const dismissIntro = useCallback(() => {
    setShowIntro(false);
    writeLocal('mycelet:map-intro-v1', '1');
  }, []);

  useEffect(() => {
    if (!readLocal('mycelet:map-intro-v1')) {
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
    writeLocal('mycelet:trip-v1', JSON.stringify({ finds: [] }));
  }, []);

  const addTripFind = useCallback((name?: string) => {
    const next = [...tripFindsRef.current, name && name.trim() ? name.trim() : t('mushroomFallback')];
    tripFindsRef.current = next;
    setTripFinds(next);
    writeLocal('mycelet:trip-v1', JSON.stringify({ finds: next }));
  }, [t]);

  const endTrip = useCallback(() => {
    const finds = tripFindsRef.current;
    const count = finds.length;
    const unique = Array.from(new Set(finds));
    tripActiveRef.current = false;
    tripFindsRef.current = [];
    setTripActive(false);
    setTripFinds([]);
    removeLocal('mycelet:trip-v1');
    if (count > 0) {
      writeLocal(
        'mycelet:last-trip',
        JSON.stringify({ count, species: unique, at: new Date().toISOString() })
      );
    }
    if (count > 0) {
      toast.success(
        unique.length
          ? t('tripDoneWithSpecies', { count, species: unique.join(', ') })
          : t('tripDone', { count })
      );
      // Gyllent øyeblikk: turen er avsluttet MED funn i kurven. Se
      // lib/vurdering for reglene (kun appskallet, maks én gang noensinne).
      foreslaaVurdering();
    } else {
      toast(t('tripDoneNoFinds'));
    }
  }, [t]);

  useEffect(() => {
    // readLocalJson rydder selv opp i en skadet verdi. Den gamle catch-grenen
    // kalte removeItem direkte — som kaster like hardt som getItem gjorde.
    const parsed = readLocalJson<{ finds?: string[] }>('mycelet:trip-v1');
    if (!parsed) return;
    const finds = Array.isArray(parsed.finds) ? parsed.finds : [];
    tripActiveRef.current = true;
    tripFindsRef.current = finds;
    setTripActive(true);
    setTripFinds(finds);
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

  /** Omtrentlig lagringsbruk, så flisecachen ikke er usynlig for brukeren. */
  const refreshStorageUsage = useCallback(async () => {
    setStorageMb(await estimateStorageMb());
  }, []);

  const deleteSavedArea = useCallback(
    async (areaId: string) => {
      // Slett FLISENE først, mens vi ennå vet hvilke området eier. Før dette
      // fjernet «Slett» bare linja i lista — flisene ble liggende i
      // CacheStorage for alltid, og lagringen brukeren trodde han frigjorde var
      // fortsatt opptatt.
      const area = offlineAreas.find((item) => item.id === areaId);
      if (area) await removeOfflineAreaTiles(area);
      setOfflineAreas(removeOfflineAreaById(areaId));
      void refreshStorageUsage();
    },
    [offlineAreas, refreshStorageUsage]
  );

  const clearTileCache = useCallback(async () => {
    await clearMapTileCache();
    setOfflineStatus(t('offlineCacheCleared'));
    void refreshStorageUsage();
  }, [refreshStorageUsage, t]);

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
      date: now.toLocaleDateString(intlLocale(locale)),
      time: now.toLocaleTimeString(intlLocale(locale), {
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
        failedTiles: cacheResult.failed,
        // Nødvendig for å kunne slette akkurat disse flisene senere.
        tileTemplate,
        zoomLevels
      };

      const kept = [areaWithTiles, ...offlineAreas.filter((item) => item.id !== areaWithTiles.id)];
      const next = kept.slice(0, 8);
      // Område nr. 9 forsvant stille fra lista mens flisene ble igjen i cachen.
      // Faller det ut av visningen, skal lagringen følge med ut.
      for (const evicted of kept.slice(8)) void removeOfflineAreaTiles(evicted);
      saveOfflineAreas(next);
      setOfflineAreas(next);
      setOfflineName('');
      void refreshStorageUsage();

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

    // «Kun mine funn» må lese en annen kilde enn resten av kartet.
    //
    // get_findings_in_bounds returnerer SETOF public_findings, og det viewet har
    // `WHERE visibility IN ('public','approximate')`. Å filtrere det på user_id
    // fjernet derfor nøyaktig de funnene brukeren har merket PRIVATE — de han
    // helst vil ha på sitt eget kart. Samme bruker talte ulikt antall egne funn
    // her og på /mine-steder, uten at noe forklarte forskjellen.
    //
    // findings-tabellen har eier-RLS (migrasjon 015: «Brukere kan lese egne
    // funn»), så et direkte oppslag gir eieren alle tre synlighetene OG de
    // eksakte koordinatene til sine egne funn — samme kilde /mine-steder bruker.
    //
    // Vet vi ikke hvem brukeren er ennå (auth-oppslaget er asynkront), skal
    // «Kun mine funn» vise INGENTING. Å falle tilbake til det offentlige laget
    // ville vist alle andres funn under en avkrysningsboks som sier «mine».
    if (filters.onlyMine && !currentUserId) {
      cleanupPopupRoots();
      clusters.clearLayers();
      return;
    }

    const { data, error } = filters.onlyMine && currentUserId
      ? await (async () => {
          let query = supabase
            .from('findings')
            .select(
              'id,user_id,species_id,latitude,longitude,found_at,quantity,notes,thumbnail_url,verification_status,is_zone_finding,zone_label,zone_precision_km,mushroom_species(norwegian_name,latin_name,edibility)'
            )
            .eq('user_id', currentUserId)
            .eq('is_negative_observation', false)
            .gte('latitude', bounds.getSouth())
            .lte('latitude', bounds.getNorth())
            .gte('longitude', bounds.getWest())
            .lte('longitude', bounds.getEast())
            .order('found_at', { ascending: false })
            .limit(1000);
          if (filters.speciesId != null) query = query.eq('species_id', filters.speciesId);
          const res = await query;
          const rows = (res.data ?? []) as unknown as OwnFindingRow[];
          return {
            data: rows.map((row) => ownFindingToMapFinding(row, currentUsername ?? '')) as MapFinding[],
            error: res.error
          };
        })()
      : await supabase.rpc('get_findings_in_bounds', {
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
    const filtered = findings.filter((finding) => passPeriodFilter(finding.found_at, filters.period));

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

      // Provideren MÅ være med her — den bor i findingPopupElement, som HAR en
      // test ved siden av seg. Dette er en løsrevet React-rot (Leaflet eier
      // elementet), og React-kontekst krysser ikke rot-grenser: uten provider
      // kaster FindingPopup på første linje og roten står tom. Fra 26. juni til
      // 1. august ga hvert klikk på en soppmarkør en tom hvit boks for ALLE
      // brukere. Ingen test laster denne fila, så wrappingen skal ikke ligge her.
      popupRoot.render(
        findingPopupElement({
          finding,
          displayName:
            finding.species_id != null ? speciesNamesRef.current.get(finding.species_id) : undefined,
          locale,
          messages: messages as Record<string, unknown>
        })
      );
      popupRootsRef.current.push(popupRoot);

      marker.bindPopup(popupContainer, {
        closeButton: true,
        maxWidth: 320,
        minWidth: 240
      });

      clusters.addLayer(marker);
    }
  }, [currentUserId, currentUsername, filters, supabase, locale, messages]);

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
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data.user?.id ?? null;
      if (cancelled) return;
      setCurrentUserId(id);
      if (!id) return;
      const { data: profile } = await supabase.from('profiles').select('username').eq('id', id).maybeSingle();
      if (!cancelled) setCurrentUsername((profile?.username as string | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    supabase
      .from('mushroom_species')
      .select('id,norwegian_name,swedish_name,edibility,latin_name')
      .then(({ data }) => {
        const nameMap = new Map<number, string>();
        const ediMap = new Map<number, string>();
        // Slekten (første ordet i latin_name) bestemmer markørformen — se
        // speciesMarkerIcon.ts.
        const shapeMap = new Map<number, MarkerShape>();
        for (const s of data ?? []) {
          nameMap.set(s.id as number, getSpeciesDisplayName({
            norwegian_name: s.norwegian_name as string | null,
            swedish_name: s.swedish_name as string | null
          }, locale) || t('mushroomFallback'));
          if (s.edibility) ediMap.set(s.id as number, s.edibility as string);
          shapeMap.set(s.id as number, markerShapeFor(s.latin_name as string | null));
        }
        speciesShapeRef.current = shapeMap;
        speciesNamesRef.current = nameMap;
        speciesEdibilityRef.current = ediMap;
        setSpeciesNamesVersion((v) => v + 1);
      });
  }, [locale, supabase, t]);

  useEffect(() => {
    setOfflineAreas(readOfflineAreas());
  }, []);

  useEffect(() => {
    if (offlineOpen) void refreshStorageUsage();
  }, [offlineOpen, refreshStorageUsage]);

  // Don't let a queued typeahead fire after the map unmounts.
  useEffect(
    () => () => {
      if (speciesSearchTimer.current) clearTimeout(speciesSearchTimer.current);
    },
    []
  );

  // The GPS fix is one-shot and can land many seconds after mount (permission
  // prompt, cold fix). If the user has already searched a place by then, it
  // must NOT yank the map and prediction back — that silently left the panel
  // and the forecast strip describing two different places.
  useEffect(() => {
    if (searchedPlaceRef.current) return;
    if (latitude != null && longitude != null) {
      posRef.current = { lat: latitude, lng: longitude };
      if (mapRef.current) {
        mapRef.current.setView([latitude, longitude], 13);
      }
    }
  }, [latitude, longitude]);

  useEffect(() => {
    if (searchedPlaceRef.current) return;
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
      // tileHotspots er allerede kollapset til beste art per rute, så dette er
      // et snitt over STEDER — ikke, som før, et snitt på tvers av arter der
      // morkler utenfor sesong dro tallet ned hele høsten.
      //
      // Snittet regnes over ALLE rutene i utsnittet (tileCellAverage), ikke over
      // tegnelista: den er kuttet til de 80 høyest scorende, så et snitt av den
      // er systematisk høyere enn stedet fortjener. Reserven under gjelder bare
      // hvis snittet mangler.
      const avgScore =
        tileCellAverage ??
        Math.round(tileHotspots.reduce((sum, item) => sum + item.score, 0) / tileHotspots.length);
      // Arten som drar snittet. Kartet har navnene ferdig oversatt allerede,
      // så det slipper å vente på API-svaret for å kunne merke tallet.
      const lead = tileHotspots.reduce((best, s) => (s.score > best.score ? s : best), tileHotspots[0]);
      const leadName = lead.speciesId != null ? speciesNamesRef.current.get(lead.speciesId) : undefined;
      return {
        score: avgScore,
        leadingSpecies:
          lead.speciesId != null && leadName
            ? { id: lead.speciesId, norwegianName: leadName, swedishName: null, displayName: leadName }
            : undefined,
        // Same ladder as the server uses, so one number never gets two labels.
        condition: scoreToCondition(avgScore),
        // Ingen `components` her med vilje: rasteret lagrer bare totalen per
        // rute, og tre nuller ville sagt at miljø, historikk og sesong ER null.
        // Panelet skjuler de tekniske tallene når oppdelingen mangler.
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
    // speciesNamesVersion: navnene lastes asynkront, og uten den ville panelet
    // stått uten artsnavn til noe annet tilfeldigvis utløste en ny beregning.
  }, [prediction.data, tileHotspots, tileCellAverage, speciesNamesVersion]);

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
        humidityEstimated: data.weather.humidityEstimated ?? false,
        rain3dMm: data.weather.rain3dMm,
        rain7dMm: data.weather.rain7dMm ?? null,
        rain14dMm: data.weather.rain14dMm ?? null,
        minTemp7dC: data.weather.minTemp7dC ?? null,
        maxTemp7dC: data.weather.maxTemp7dC ?? null,
        // Gir «Siste regn: 12mm for 4 dager siden»-linja i panelet.
        precipDailyMm: data.weather.precipDailyMm ?? null
      },
      species: data.species,
      forest: data.forest
        ? {
            forestType: data.forest.forestType,
            productivity: data.forest.productivity,
            volumePerHa: data.forest.volumePerHa,
            // Hvor langt unna skogdataene er hentet. Uten den skrev panelet
            // «Skog her» om en flis flere kilometer borte.
            distanceKm: data.forest.distanceKm ?? null,
            habitatScore: data.habitat?.score ?? null,
            habitatReasons: data.habitat?.reasons ?? [],
            source: data.forest.source
          }
        : null,
      nearbyOccurrences: data.nearbyOccurrences,
      month: new Date().getMonth() + 1,
      locale: locale === 'sv' ? 'sv' : 'nb'
    });
  }, [prediction.data, locale]);

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
        {/* The species chip and the search box coexist: picking a species used
            to REPLACE the input, which made «steinsopp ved Hamar» impossible —
            you could have one or the other, never both. */}
        {selectedSpeciesName ? (
          <div className="flex w-full items-center justify-between gap-2 rounded-full bg-forest-800 px-3 py-2 text-xs font-medium text-white shadow-lg">
            <span className="truncate">🍄 {t('promisingSpotsFor', { species: selectedSpeciesName })}</span>
            <button
              type="button"
              onClick={clearSpeciesSearch}
              className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 font-semibold hover:bg-white/30"
            >
              {t('reset')}
            </button>
          </div>
        ) : null}
        <div className="w-full">
            <div className="relative">
              {/* One box for BOTH questions: «hvilken sopp» and «hvor». The
                  place search used to be buried in the Filtre sheet, so
                  planning a trip («steinsopp ved Hamar») meant digging. */}
              <input
                value={speciesSearch}
                onChange={(event) => searchSpeciesForSpots(event.target.value)}
                placeholder={selectedSpeciesName ? t('searchPlaceOnly') : t('searchSpeciesOrPlace')}
                className="w-full rounded-full bg-white/95 px-4 py-2 text-xs text-gray-800 shadow-lg backdrop-blur placeholder:text-gray-500 focus:outline-none"
              />
              {speciesSuggestions.length > 0 || placeSuggestions.length > 0 ? (
                <div className="absolute left-0 right-0 top-full z-[1001] mt-1 max-h-60 overflow-auto rounded-xl bg-white shadow-xl">
                  {speciesSuggestions.length > 0 ? (
                    <>
                      <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        {t('groupSpecies')}
                      </p>
                      {speciesSuggestions.map((s) => (
                        <button
                          key={`sp-${s.id}`}
                          type="button"
                          onClick={() => selectSpeciesForSpots(s.id, s.name)}
                          className="block w-full px-3 py-2 text-left text-xs text-gray-800 hover:bg-gray-50"
                        >
                          🍄 {s.name}
                        </button>
                      ))}
                    </>
                  ) : null}
                  {placeSuggestions.length > 0 ? (
                    <>
                      <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        {t('groupPlaces')}
                      </p>
                      {placeSuggestions.map((p) => (
                        <button
                          key={`pl-${p.name}-${p.lat}-${p.lng}`}
                          type="button"
                          onClick={() => goToPlace(p)}
                          className="block w-full px-3 py-2 text-left text-xs text-gray-800 hover:bg-gray-50"
                        >
                          📍 {p.name}
                          <span className="ml-1 text-[10px] text-gray-500">{p.context}</span>
                        </button>
                      ))}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
        </div>
        {searchedPlace ? (
          <PlaceForecastStrip
            place={searchedPlace}
            onClear={() => {
              searchedPlaceRef.current = null;
              setSearchedPlace(null);
            }}
          />
        ) : null}
        <div className="flex justify-center gap-1.5">
          <button
            type="button"
            onClick={toggleOccurrences}
            className={`rounded-full px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur ${
              showOccurrences ? 'bg-forest-800 text-white hover:bg-forest-700' : 'bg-white/95 text-gray-800 hover:bg-white'
            }`}
          >
            {/* «Skjul funn (3000)» ville påstått at det er nøyaktig 3000 funn i
                utsnittet. Traff vi hentetaket vet vi bare at det er minst så
                mange, og da skal tallet vise det. */}
            {showOccurrences
              ? occCount
                ? occTruncated
                  ? t('hideFindingsAtLeast', { count: occCount })
                  : t('hideFindingsCount', { count: occCount })
                : t('hideFindings')
              : t('findingsButton')}
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
            {/* Årsfilteret: ~72 % av punktene er fra før 2021, og gamle
                herbariebelegg rendret som ferske prikker skjuler datasettets
                sterkeste signal — datoene. */}
            <div className="flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[11px] shadow-lg backdrop-blur">
              {(
                [
                  ['all', t('yearAll')],
                  ['last5', t('yearLast5')],
                  ['last10', t('yearLast10')]
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setOccYearFilter(val)}
                  className={`rounded-full px-2 py-0.5 font-medium ${
                    occYear === val ? 'bg-forest-800 text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {occTruncated ? (
              <p className="w-full text-center text-[11px] font-medium text-amber-900">
                <span className="rounded-full bg-amber-50/95 px-2 py-1 shadow-lg backdrop-blur">
                  {t('findingsTruncated', { count: OCCURRENCE_FETCH_LIMIT })}
                </span>
              </p>
            ) : null}
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
                  onClick={() => void deleteSavedArea(area.id)}
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

        {/* Flisecachen var usynlig: ingen tak, ingen utløp, og ingen steder å se
            eller rydde den. Tjenestearbeideren legger dessuten inn hver flis du
            panorerer forbi, ikke bare de lagrede områdene. */}
        <div className="mt-2 border-t border-gray-100 pt-2">
          <p className="text-[11px] text-gray-600">
            {storageMb != null ? t('storageUsage', { mb: storageMb }) : t('storageUsageUnknown')}
          </p>
          <button
            type="button"
            onClick={() => void clearTileCache()}
            className="mt-1 inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-800 hover:bg-gray-50"
          >
            <Trash2 className="h-3 w-3" />
            {t('clearTileCache')}
          </button>
        </div>

        {/* /offline er den ene siden som kan åpnes uten dekning (precachet av
            public/sw.js). Lenken ligger her for at brukeren skal få sett hva
            som faktisk blir med ut i skogen — MENS det ennå er dekning. */}
        <a
          href="/offline"
          className="mt-2 inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-800 hover:bg-gray-50"
        >
          <Navigation className="h-3 w-3" />
          {t('openOfflineMap')}
        </a>
        <p className="mt-1 text-[11px] text-gray-600">{t('offlineShellHint')}</p>
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
        onClick={() => {
          const senter = mapRef.current?.getCenter();
          setAddSheetFallback(senter ? { lat: senter.lat, lng: senter.lng } : null);
          setShowAddSheet(true);
        }}
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
          fallbackLatitude={addSheetFallback?.lat ?? null}
          fallbackLongitude={addSheetFallback?.lng ?? null}
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
