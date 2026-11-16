'use client';

import Link from 'next/link';
import type { MapSpeciesParam, MapViewParams } from '@/lib/utils/map-view-params';
import { lagreHusketUtsnitt, lesHusketUtsnitt, type HusketUtsnitt } from '@/lib/map/husket-utsnitt';
import { lagreHusketPosisjon } from '@/lib/map/husket-posisjon';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Download, Filter, MoreHorizontal, Navigation, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchRpcPaged } from '@/lib/supabase/paged-rpc';
import { useGeolocation } from '@/lib/hooks/useGeolocation';
import { finnFerskPosisjon } from '@/lib/map/fersk-posisjon';
import { flyttetoleranseMeter, kartErFlyttet, senterForBoks } from '@/lib/map/funnposisjon';
import { initialMapFilters, nextMapFilters } from '@/lib/map/initial-filters';
import { rettArtsfilter } from '@/lib/map/artsfilter-navn';
import {
  LOVENDE_RADIER_KM,
  harSkogdekning,
  nesteRadiusIndex,
  nesteSteg,
  type LovendeSteg
} from '@/lib/map/lovende-sok';
import { festBoksTilOppslagspresisjon } from '@/lib/map/oppslagsboks';
import {
  SPISELIGHET_MARKORFARGE,
  SPISELIGHET_TEKSTFARGE,
  UKJENT_MARKORFARGE,
  UKJENT_TEKSTFARGE
} from '@/lib/map/spiselighetsfarger';
import {
  kanGjenbrukeHenting,
  ligger,
  velgHenteutsnitt,
  type ForrigeHenting,
  type Utsnitt
} from '@/lib/map/utsnitt-gjenbruk';
import { getRegion } from '@/lib/utils/region';
import { usePrediction } from '@/lib/hooks/usePrediction';
import { useBillingStatus } from '@/lib/hooks/useBilling';
import { PredictionHotspot, PredictionResponse, PredictionTile } from '@/types/prediction';
import { AddFindingSheet } from './AddFindingSheet';
import { findingPopupElement } from './findingPopupElement';
import { inneholderMonster } from '@/lib/api/postgrest-filter';
import { serverFeiltekst } from '@/lib/map/funn-svar';
import { VisbarFeil } from '@/lib/map/visbar-feil';
import { Funnlag } from './funnlag';
import type { FindingReportPayload } from './FindingPopup';
import { HotspotPanel } from './HotspotPanel';
import { MapFilters, MapFilterState } from './MapFilters';
import { MapIntro } from './MapIntro';
import { ToTrinnsSletting } from './ToTrinnsSletting';
import { MapFinding } from '@/types/finding';
import { OwnFindingRow, ownFindingToMapFinding } from '@/lib/utils/map-findings';
import {
  formatUncertaintyMeters,
  occurrenceYearCutoff,
  passesYearCutoff,
  type OccurrenceYearFilter
} from '@/lib/utils/occurrence-filters';
import {
  MAX_NATIVE_ZOOM,
  NoTilesCachedError,
  OfflineArea,
  OfflineAreaTooLargeError,
  OSM_TILE_TEMPLATE,
  SATELLITE_TILE_TEMPLATE,
  TERRAIN_TILE_TEMPLATE,
  cacheMapTilesForArea,
  clearMapTileCache,
  estimateStorageMb,
  offlineZoomLevels,
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
import { roundForProviderLookup } from '@/lib/privacy/provider-precision';
import { filterWithinRadiusKm, haversineKm } from '@/lib/utils/geo-distance';
import { SEARCH_AREA_RADIUS_M } from '@/lib/utils/spot-area';
import { createTopSpotArea } from './topSpotArea';
import { markerHtml, markerShapeFor, type MarkerShape } from './speciesMarkerIcon';
import { buildTopSpotPopupHtml } from './topSpotPopup';
import { readLocal, readLocalJson, removeLocal, writeLocal } from '@/lib/utils/safe-storage';
import { PlaceForecastStrip } from './PlaceForecastStrip';
import { FLAGS } from '@/lib/flags';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useReportContent } from '@/lib/hooks/useForum';
import { invalidateAfterBlockChange } from '@/lib/hooks/useBlocks';
import { useForumErrorMessage } from '@/components/forum/useForumErrorMessage';
import { utenBlokkerte } from '@/lib/moderation/blokkering';
import { lagBlokkerteHusk } from '@/lib/map/blokkerte-brukere';
import { useIsNative } from '@/lib/hooks/useIsNative';
import { byggLovendeOmraderGpx } from '@/lib/gpx/lovende-omrader';
import { osloDag } from '@/lib/bruk/bruksdag';
import { GpxKopierModal } from '@/components/gpx/GpxKopierModal';
import { ProvGratisArk } from '@/components/billing/ProvGratisArk';
import { ProveLofteTekst } from '@/components/billing/ProveLofteTekst';
import { hentProveLofte } from '@/lib/hooks/useProveLofte';
import {
  FORSTE_OKT_MS,
  KARTDAGER_NOKKEL,
  PROVETILBUD_NOKKEL,
  leggTilKartdag,
  registrerVisning,
  skalViseProvetilbud,
  tolkProvetilbud,
  kanFaaProveperiode,
  type ProvetilbudUtloser
} from '@/lib/billing/provetilbud';
import { foreslaaVurdering } from '@/lib/vurdering/foreslaa';
import { vernLeafletEtterFjerning } from './leafletEtterFjerning';
import { TREFF_44 } from './trykkflate';
import { LUKKEKNAPP_KLASSER } from '@/components/ui/useDialogFokus';

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
 * størrelsen. Laget hentes og tegnes på nytt bare når utsnittet går ut over det
 * som alt er hentet, eller et filter endres (se loadOccurrences).
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
/**
 * Kartverkets turrutebase (merkede fotruter) som valgfritt kartlag. Bare Norge —
 * Sverige har ingen tilsvarende åpen tjeneste. Valget huskes lokalt. Laget er
 * ikke med i offline-bufferen (WMS, ikke fliser).
 */
const TRAIL_WMS_URL = 'https://wms.geonorge.no/skwms1/wms.friluftsruter2';
const TRAIL_LAYER_KEY = 'mycelet:kart-turruter-v1';

/** En rad fra get_occurrences_in_bounds, slik kartet bruker den. */
type OccRow = {
  latitude: number;
  longitude: number;
  species_id: number | null;
  observed_at?: string | null;
  coordinate_uncertainty_m?: number | null;
};

/**
 * Siste henting av registrerte funn: radene, utsnittet de ble hentet for, og
 * det serveren ble spurt om. Brukes til å la være å hente på nytt når det som
 * vises alt er dekket — se src/lib/map/utsnitt-gjenbruk.ts.
 */
type OccFetch = ForrigeHenting & {
  speciesId: number | null;
  yearCutoff: number | null;
  /** false = årsfilteret må gjøres her (RPC-en mangler p_min_year, eller kallet feilet). */
  serverYearFiltered: boolean;
  rows: OccRow[];
};

/**
 * Det markørene i funnlaget er bygget av. Er alt dette uendret, står
 * markørene riktig og laget trenger ikke tømmes og bygges opp igjen.
 */
type OccDraw = {
  henting: OccFetch;
  filter: 'all' | 'edible' | 'toxic';
  seasonOnly: boolean;
  /** Sesongfilteret regnes mot inneværende måned. */
  maaned: number;
  /** Artsnavn-oppslaget markørene ble bygget med (byttes ut når artene er lastet). */
  navn: Map<number, string>;
  /** Oversetteren popupene bruker. */
  t: unknown;
  /** Punktene som faktisk ble tegnet, til tellingen av det som er i utsnittet. */
  punkter: { lat: number; lng: number }[];
};

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

/**
 * Der kartet står før noe annet er kjent (ingen dyplenke, intet husket utsnitt,
 * ingen posisjon ennå). Ett sted å lese det fra: kartinit, vernet mot å huske
 * plassholderen som utsnitt, og «har brukeren flyttet kartet?» må være enige.
 */
const PLASSHOLDER_SENTER = { lat: 59.91, lng: 10.75 } as const;
const PLASSHOLDER_ZOOM = 11;

/**
 * Knappene i verktøyraden øverst på kartet: 36 px høye, med en usynlig
 * treffflate på 44 px rundt (se trykkflate.ts). Radene i kolonnen står 8 px
 * fra hverandre, så flatene møtes uten å overlappe. De var 28 px høye — og
 * betjenes med tommelen ute i skogen.
 */
const VERKTOYKNAPP = `relative whitespace-nowrap rounded-full px-3 py-2.5 text-xs font-medium shadow-lg backdrop-blur ${TREFF_44}`;

/** En rad i «Mer»-menyen: 44 px høy i seg selv. */
const MENYRAD = 'min-h-[44px] rounded-lg px-2 py-2 text-left text-xs font-medium text-gray-800 hover:bg-gray-100';

/** Valgene i funnfilteret: 36 px høye med treffflate på 44 px, 8 px mellom radene. */
const FILTERVALG = `relative rounded-full px-2.5 py-2.5 text-[11px] font-medium ${TREFF_44}`;

/** De små knappene i offline-panelet (Gå til, Slett, Tøm kartcachen, Åpne offline-kartet). */
const PANELKNAPP = 'inline-flex min-h-[44px] items-center gap-1 rounded border px-3 text-[11px]';

/**
 * Krysset i en Leaflet-popup er 24 × 24 px og eies av Leaflet. Klassene
 * legges på elementet når popupen åpnes, og gir det 10 px usynlig flate på
 * hver side — 44 × 44 px. Krysset er alt `position: absolute`.
 */
const POPUPKRYSS_TREFF = ['after:absolute', 'after:-inset-2.5', "after:content-['']"];

/**
 * Zoomknappene er også Leaflets egne: 30 × 30 px, kant i kant. De er veien
 * inn og ut for den som har én hånd ledig — knip trenger to.
 *
 * Her er usynlig flate alene ikke nok: knappene står oppå hverandre, så
 * flatene kan ikke vokse mot hverandre, og over og under er det bare 10 px
 * til kartkanten og lagvelgeren. Knappene tegnes derfor 36 px, og får 4 px
 * flate til hver side; «inn» får 8 px oppover og «ut» 8 px nedover. Det gir
 * 44 × 44 px hver. `!` fordi Leaflets egne regler for størrelsen er mer
 * spesifikke enn en vanlig klasse. Målt i nettleseren med Leaflets egne
 * elementer og stilark, på en 375 px bred telefon: kontrollen står 6 px fra
 * søkefeltet og flaten 4 px fra, og lagvelgeren under flytter seg 12 px ned.
 */
const ZOOMKNAPP = ['relative', '!h-9', '!w-9', '!leading-9', 'after:absolute', 'after:-inset-x-1', "after:content-['']"];
const ZOOMKNAPP_INN = ['after:-top-2', 'after:bottom-0'];
const ZOOMKNAPP_UT = ['after:top-0', 'after:-bottom-2'];

/**
 * Så lenge må kartet stå i ro før lasterne henter for det nye utsnittet.
 * En finger som drar kartet i flere korte tak, eller et knip som slippes og
 * tas opp igjen, ga ett «moveend» per tak — og hvert av dem startet fire
 * hentinger som det neste straks gjorde ugyldige.
 */
const FLYTT_RO_MS = 300;

export function MushroomMap({
  /**
   * true = start med «Kun mine funn» på. Brukes av /map?mine=1, som
   * lagringsflytene navigerer til: et nylagret privat funn er usynlig i
   * standardlaget (public_findings ekskluderer private), og «Funn lagret!»
   * etterfulgt av et kart uten funnet leses som at lagringen feilet.
   */
  startWithOnlyMine = false,
  /**
   * Utsnittet en dyplenke ba om (`/map?lat=…&lng=…&zoom=…`), typisk fra
   * «Best i landet i dag». Behandles som et SØKT STED, ikke bare et startpunkt:
   * ellers rykker GPS-fiksen kartet tilbake til brukerens egen posisjon noen
   * sekunder etter at siden er åpnet — som er nøyaktig det som gjorde at et
   * trykk på Bodø endte hjemme hos brukeren.
   */
  initialView = null,
  /** «Let etter denne arten» (?art=): arten er valgt fra første render, og lovende områder regnes ut når kartet står. */
  initialSpecies = null
}: {
  startWithOnlyMine?: boolean;
  initialView?: MapViewParams | null;
  initialSpecies?: MapSpeciesParam | null;
} = {}) {
  const t = useTranslations('MushroomMap');
  // Forumets tekster for melding og blokkering — kartet viser dem i varsler og
  // sender dem til funnpopupen som ferdig tekst (se handleReportFinding).
  const tReport = useTranslations('ReportButton');
  const tBlock = useTranslations('BlockUser');
  const tBlockedUsers = useTranslations('BlockedUsers');
  const forumError = useForumErrorMessage();
  const queryClient = useQueryClient();
  const locale = useLocale();
  const native = useIsNative();
  // «Lovende områder» som GPX i appskallet vises som tekst (se GpxKopierModal).
  const [gpxTekst, setGpxTekst] = useState<string | null>(null);
  // Trengs for popup-rotene under: de er løsrevne React-røtter uten tilgang
  // til providerens kontekst, så meldingene må sendes inn eksplisitt.
  const messages = useMessages();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const clusterRef = useRef<any>(null);
  const heatLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const topLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const speciesLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  // Funnlaget: markørene for brukernes funn og popup-roten til hver av dem.
  // Stemmes av mot hvert nytt svar i stedet for å tømmes — se funnlag.ts.
  const funnlagRef = useRef<Funnlag<MapFinding> | null>(null);
  const loadFindingsRef = useRef<() => Promise<void>>(async () => {});
  const generateTopSpotsRef = useRef<(speciesIdOverride?: number | null, originOverride?: { lat: number; lng: number } | null) => Promise<void>>(
    async () => {}
  );
  // Hvilken art de viste lovende områdene faktisk ble regnet for — GPX-navnet
  // skal ikke låne navnet på en art som er valgt, men ikke ferdig regnet.
  const topSpotsForSpeciesRef = useRef<number | null>(null);
  // «Let etter denne arten» uten GPS-fiks og uten husket utsnitt: vent med
  // lovende områder til posisjonen er kjent, ellers regnes de rundt Oslo-
  // plassholderen og blir liggende der når kartet hopper til brukeren.
  const ventendeArtRef = useRef<number | null>(null);
  const loadPredictionTilesRef = useRef<() => Promise<void>>(async () => {});
  // Monotonic request id so only the latest prediction-tile RPC may write state.
  const tileReqRef = useRef(0);
  // Samme vern for funnlaget. Flisene og de registrerte funnene hadde det;
  // funnlaget manglet det, og der er følgen verst: en treg henting av ALLES
  // funn, startet før «Kun mine funn» ble krysset av, kunne bli ferdig etter
  // den raske hentingen av egne funn og tegne andres funn under avkrysningen.
  const findingsGenRef = useRef(0);
  // Hva funnlaget viser akkurat nå. Feiler hentingen av egne funn, skal det
  // som ligger der fra fellesskapslaget ikke bli stående under «Kun mine funn».
  const findingsLayerShowsRef = useRef<'own' | 'shared' | null>(null);
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
  // 1000 rader på 1,9 s). Laget hentes på nytt når utsnittet går ut over det
  // som alt er hentet — ikke ved hver panorering (se loadOccurrences).
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
  // Siste henting og siste tegning av registrerte funn. Null = ingenting å
  // gjenbruke (laget er av, eller forrige henting feilet).
  const lastOccFetchRef = useRef<OccFetch | null>(null);
  const lastOccDrawRef = useRef<OccDraw | null>(null);
  const tripActiveRef = useRef(false);
  const tripFindsRef = useRef<string[]>([]);
  const speciesSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meMarkerRef = useRef<any>(null);
  const meCircleRef = useRef<any>(null); // GPS accuracy circle around the "me" dot
  const geoAbortRef = useRef<AbortController | null>(null); // cancels an in-flight locate watch
  // Ventende henting etter at kartet er flyttet — se FLYTT_RO_MS.
  const moveLoadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  // Siste EKTE GPS-måling: fra åpningen av kartet, fra «Finn meg» og fra den
  // ferske målingen i funnskjemaet. Aldri et søkt sted — posRef over settes
  // også av stedssøket, så den kan ikke brukes som «der brukeren er».
  //
  // Finnes fordi `latitude`/`longitude` fra useGeolocation() er målt ÉN gang,
  // da kartet ble åpnet, og aldri oppdateres. Alt som leste dem etterpå —
  // «Lovende» sitt utgangspunkt, reserven i «Finn meg» — regnet fra der
  // brukeren var da turen startet.
  const sisteGpsRef = useRef<{ lat: number; lng: number } | null>(null);

  const supabase = useRef(createClient()).current;
  // Hvem leseren har blokkert, for funnlaget. Et løfte som hentes én gang og
  // ventes på sammen med funnene — se src/lib/map/blokkerte-brukere.ts for
  // hvorfor det ikke er en tilstand. RLS gir bare leserens egne rader.
  // createClient() i selve oppslaget (nettleserklienten er én og samme), så
  // tilstanden ikke bygges av en ref-verdi under gjengivelsen.
  const [blokkerte] = useState(() =>
    lagBlokkerteHusk(() => createClient().from('blocked_users').select('blocked_id'))
  );
  // Ventingen på lista har en frist: blir oppslaget hengende, tegnes funnene
  // uten den. Dette rydder opp når lista så kommer — nålene til de blokkerte
  // tas ut av det som alt står på kartet, uten ny henting. Samme grep som rett
  // etter en blokkering (handleBlockFindingAuthor). Kom lista i tide, er det
  // ingenting å ta ut.
  useEffect(() => {
    void blokkerte.naarHentet().then((ider) => {
      for (const id of ider) funnlagRef.current?.fjernFraBruker(id);
    });
  }, [blokkerte]);
  const { latitude, longitude, error: geoError } = useGeolocation();

  // Forrige utsnitt (senter, zoom, art, søkt sted) — se husket-utsnitt.ts.
  // Leses én gang. En dyplenke (initialView / initialSpecies) vinner over det.
  // ?mine=1 (rett etter lagring fra AI-flyten) skal vise funnet som nettopp ble
  // lagret — ved GPS-posisjonen, uten artsfilter. Da hentes ingenting husket.
  const [husket] = useState<HusketUtsnitt | null>(() => (initialView || startWithOnlyMine ? null : lesHusketUtsnitt()));
  // Bare utsnittet: brukes av kartinit og som vern mot GPS-sentreringen, på
  // samme måte som searchedPlaceRef verner en dyplenke.
  const husketUtsnittRef = useRef<{ lat: number; lng: number; zoom: number } | null>(
    husket ? { lat: husket.lat, lng: husket.lng, zoom: husket.zoom } : null
  );
  // Det siste senteret APPEN la kartet på uten at noen ba om et sted:
  // plassholderen, sentreringen på GPS ved åpning, «Finn meg», utsnittet
  // «⭐ Lovende» zoomer til. Null når kartet åpnet på et sted noen valgte
  // (dyplenke, søkt sted, utsnittet fra forrige besøk). Funnskjemaet bruker
  // det til å avgjøre om kartsenteret er et sted brukeren har pekt ut, eller
  // bare der appen la kartet — se kartErFlyttet.
  const autoSenterRef = useRef<{ lat: number; lng: number } | null>(
    initialView || husket ? null : { lat: PLASSHOLDER_SENTER.lat, lng: PLASSHOLDER_SENTER.lng }
  );
  const initialSpeciesRef = useRef<MapSpeciesParam | null>(initialSpecies);

  // Startverdien og reglene står i src/lib/map/initial-filters.ts. Kort: åpner
  // kartet på «Kun mine funn» (?mine=1), starter perioden på «alle» — ellers
  // skjulte standardperioden «denne måneden» nettopp de funnene lenken lovet.
  const [filters, setFiltersRaw] = useState<MapFilterState>(() =>
    initialMapFilters({ startWithOnlyMine, speciesId: initialSpecies?.id ?? husket?.speciesId ?? null })
  );
  // ALLE endringer av filtrene går gjennom nextMapFilters, så perioden følger
  // med når «Kun mine funn» slås på — uansett om det skjer i filterarket eller
  // fordi et privat funn nettopp ble lagret.
  const setFilters = useCallback((next: MapFilterState | ((previous: MapFilterState) => MapFilterState)) => {
    setFiltersRaw((previous) => nextMapFilters(previous, typeof next === 'function' ? next(previous) : next));
  }, []);
  const [showAddSheet, setShowAddSheet] = useState(false);
  /**
   * Kartsenteret i det brukeren trykket pluss, og om det er brukeren selv som
   * har lagt kartet der.
   *
   * Skjemaet krevde først `useGeolocation()` og avviste lagring uten. Det låste
   * ute fire helt vanlige tilfeller: desktop uten GPS, avslått
   * posisjonstillatelse, dårlig signal under tregrenser — og det vanligste av
   * alt, å registrere et funn i etterkant hjemmefra. «Jeg fant kantarell ved
   * den lysningen i går» lot seg rett og slett ikke lagre. Kartsenteret er
   * svaret som allerede ligger på skjermen: brukeren panorerer dit hen var, og
   * trykker pluss.
   *
   * Så ble kartsenteret reserve for GPS — og bare det. Hadde kartet fått en
   * posisjon da det ble åpnet, vant den alltid: «i etterkant hjemmefra» ble
   * lagret hjemme, og den som gikk førti minutter fra parkeringsplassen fikk
   * funnet lagret der. Nå følger kartsenteret ALLTID med, skjemaet måler
   * posisjonen på nytt selv, og velger bare mellom dem når de er enige
   * (src/lib/map/funnposisjon.ts). Kartets egen, gamle posisjon sendes ikke inn.
   */
  const [addSheetKart, setAddSheetKart] = useState<{ senter: { lat: number; lng: number }; flyttet: boolean } | null>(
    null
  );
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
  // Antall aktive funnfiltre — badgen på trakt-knappen. Uten den ville et
  // filter satt inne i det lukkede panelet vært usynlig tilstand: kartet viser
  // færre funn og ingenting sier hvorfor.
  const occFilterCount =
    Number(occEdibility !== 'all') + Number(occSeason) + Number(occYear !== 'all');
  const [showIntro, setShowIntro] = useState(false);
  const [tripActive, setTripActive] = useState(false);
  const [tripFinds, setTripFinds] = useState<string[]>([]);
  const [speciesSearch, setSpeciesSearch] = useState(initialSpecies?.name ?? husket?.speciesName ?? '');
  // Siste kjente senter/zoom fra moveend — det som lagres som husket utsnitt.
  const [viewport, setViewport] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [speciesSuggestions, setSpeciesSuggestions] = useState<{ id: number; name: string }[]>([]);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceResult[]>([]);
  // Set when the user searches a place — the forecast strip and the reset chip
  // follow the searched location instead of the GPS position.
  // Seedes fra dyplenken sammen med referansen under. Settes BARE referansen,
  // rendres aldri PlaceForecastStrip — og da finnes ikke X-knappen som er den
  // eneste veien ut av utsnittet. Uten den ville «Lovende steder» regnet rundt
  // det dyplenkede stedet resten av økta, også etter at brukeren hadde trykket
  // «Finn meg» og flyttet kartet hjem: generateTopSpots leser referansen FØR
  // GPS-posisjonen, og avslutter med fitBounds rundt den.
  const [searchedPlace, setSearchedPlace] = useState<PlaceResult | null>(
    initialView
      ? { name: initialView.name ?? '', context: '', lat: initialView.lat, lng: initialView.lng }
      : husket?.place
        ? { name: husket.place.name, context: '', lat: husket.place.lat, lng: husket.place.lng }
        : null
  );
  // Mirrors searchedPlace for the GPS effects, which must read the current
  // value without re-running when it changes.
  // Settes ved første render, ikke i en effekt: GPS-effekten under sjekker
  // nettopp denne referansen, og kan fyre før en effekt hadde rukket å sette
  // den. Da ville dyplenken tapt kappløpet mot brukerens posisjon.
  const searchedPlaceRef = useRef<PlaceResult | null>(
    initialView
      ? { name: initialView.name ?? '', context: '', lat: initialView.lat, lng: initialView.lng }
      : husket?.place
        ? { name: husket.place.name, context: '', lat: husket.place.lat, lng: husket.place.lng }
        : null
  );
  // Monotonic id so a slow older typeahead response can't overwrite a newer one.
  const searchReqRef = useRef(0);
  const [selectedSpeciesName, setSelectedSpeciesName] = useState<string | null>(
    initialSpecies ? initialSpecies.name || null : (husket?.speciesName ?? null)
  );
  const [locating, setLocating] = useState(false);
  // Starter på dyplenkens sted når det finnes. Uten dette ville kartet vist
  // Bodø mens prognosepanelet ved siden av beskrev brukerens egen posisjon —
  // to steder på samme skjerm, som er nøyaktig feilen kommentaren ved
  // GPS-effekten lenger nede allerede advarer mot.
  //
  // Punktet har ÉN presisjon uansett hvor det settes fra (her, stedssøket,
  // GPS-en, flytting av kartet): tre desimaler, ~100 m. usePrediction bruker
  // punktet som nøkkel, og kartet flyttes rett etter hvert av de andre
  // kallene — med ulik presisjon ble det to nøkler og to kall til
  // /api/prediction for samme sted. Serveren runder uansett til det samme
  // før vær og skog slås opp, og enhetens eksakte posisjon trenger ikke stå
  // i en URL.
  const [predictionCoords, setPredictionCoords] = useState<{ lat: number | null; lon: number | null }>(() => {
    const lat = initialView?.lat ?? husket?.lat ?? null;
    const lng = initialView?.lng ?? husket?.lng ?? null;
    return lat != null && lng != null ? roundForProviderLookup(lat, lng) : { lat: null, lon: null };
  });
  const [tileHotspots, setTileHotspots] = useState<PredictionHotspot[]>([]);
  // Snitt over ALLE kollapsede ruter i utsnittet, ikke bare de 80 vi tegner.
  // Tegnelista er kuttet på score, så et snitt av den er systematisk for høyt.
  const [tileCellAverage, setTileCellAverage] = useState<number | null>(null);
  const [offlineAreas, setOfflineAreas] = useState<OfflineArea[]>([]);
  const [offlineName, setOfflineName] = useState('');
  const offlineNameId = useId();
  const [offlineStatus, setOfflineStatus] = useState<string | null>(null);
  const [offlineBusy, setOfflineBusy] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [storageMb, setStorageMb] = useState<number | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [occFiltersOpen, setOccFiltersOpen] = useState(false);
  const [topSpots, setTopSpots] = useState<TopSpot[] | null>(null);
  const [topLoading, setTopLoading] = useState(false);
  const [topMsg, setTopMsg] = useState<string | null>(null);
  const [topAccess, setTopAccess] = useState<'premium_full' | 'free_limited' | null>(null);
  const [speciesSpots, setSpeciesSpots] = useState<{ speciesId: number; norwegianName: string; displayName?: string; latinName: string; imageUrl: string; lat: number; lng: number; score: number; verdict?: string; reasons?: string[] }[] | null>(null);
  const [speciesLoading, setSpeciesLoading] = useState(false);
  const [speciesMsg, setSpeciesMsg] = useState<string | null>(null);

  const billing = useBillingStatus(true);
  const hasOfflineAccess = billing.data?.capabilities.paid ?? false;
  // Gratisuka finnes bare for nye abonnenter — tekstene og arket skal ikke love
  // den til en som har hatt abonnement før (se kanFaaProveperiode).
  const kanFaaProve = kanFaaProveperiode(billing.data);
  // Prøvetilbudet (src/lib/billing/provetilbud.ts): «andre dag» avgjøres ved
  // mount fra lokalt lagrede kartdager; «begrenset» når lovende områder viser
  // 3 av 12. Arket vises maks to ganger, aldri to ganger samme døgn.
  // Utløseren som fyrte følger med arket til bruksdag-raden («tilbud»/utløser),
  // så trakten ark → pris kan leses per utløser. Null = ikke vist.
  const [visProvetilbud, setVisProvetilbud] = useState<ProvetilbudUtloser | null>(null);
  const provetilbudUtloserRef = useRef<ProvetilbudUtloser | null>(null);
  // Første kartøkt: etter et halvt minutt har brukeren sett hva kartet er.
  const [provetilbudTikk, setProvetilbudTikk] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => {
      if (!provetilbudUtloserRef.current) provetilbudUtloserRef.current = 'forste-okt';
      setProvetilbudTikk((n) => n + 1);
    }, FORSTE_OKT_MS);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    const dager = leggTilKartdag(readLocal(KARTDAGER_NOKKEL), osloDag(new Date()));
    writeLocal(KARTDAGER_NOKKEL, JSON.stringify(dager));
    if (dager.length >= 2) provetilbudUtloserRef.current = 'andre-dag';
  }, []);
  useEffect(() => {
    const utloser: ProvetilbudUtloser | null = topAccess === 'free_limited' ? 'begrenset' : provetilbudUtloserRef.current;
    const tilstand = tolkProvetilbud(readLocal(PROVETILBUD_NOKKEL));
    const naaMs = Date.now();
    if (
      !skalViseProvetilbud({
        betaler: hasOfflineAccess,
        betalingKjent: !billing.isLoading && Boolean(billing.data),
        kanFaaProve,
        tilstand,
        utloser,
        naaMs
      })
    ) {
      return;
    }
    writeLocal(PROVETILBUD_NOKKEL, JSON.stringify(registrerVisning(tilstand, naaMs)));
    setVisProvetilbud(utloser);
  }, [topAccess, billing.isLoading, billing.data, hasOfflineAccess, kanFaaProve, provetilbudTikk]);
  // Butikkens svar på om gratisuka finnes hentes tidlig, så arket ikke lover
  // «7 dager gratis» før det vet (hentProveLofte husker svaret; nett svarer straks).
  useEffect(() => {
    if (billing.isLoading || hasOfflineAccess || !kanFaaProve) return;
    void hentProveLofte();
  }, [billing.isLoading, hasOfflineAccess, kanFaaProve]);
  const showOfflineUpsell = !billing.isLoading && !hasOfflineAccess;

  const prediction = usePrediction({
    lat: predictionCoords.lat,
    lon: predictionCoords.lon,
    speciesId: filters.speciesId
  });


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

  /**
   * «Lovende områder» som GPX: vi sier hvor, UT.no/Garmin/Organic Maps lager
   * ruten dit langs stier. Nett: fil. Appskall: tekst med kopier-knapp.
   */
  const eksporterTopSpotsGpx = useCallback(() => {
    if (!topSpots?.length) return;
    try {
      const gpx = byggLovendeOmraderGpx(topSpots, {
        artsnavn: topSpotsForSpeciesRef.current != null && topSpotsForSpeciesRef.current === filters.speciesId ? selectedSpeciesName : null,
        dato: osloDag(new Date()),
        locale: locale === 'sv' ? 'sv' : 'nb'
      });
      if (native) {
        setGpxTekst(gpx);
        return;
      }
      const url = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mycelet-lovende-omrader.gpx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t('gpxTopSpotsDownloaded'), { duration: 4000 });
    } catch {
      toast.error(t('gpxTopSpotsFailed'));
    }
  }, [topSpots, selectedSpeciesName, filters.speciesId, locale, native, t]);

  const clearTopSpots = useCallback(() => {
    topLayerRef.current?.clearLayers();
    setTopSpots(null);
    setTopMsg(null);
    setTopAccess(null);
  }, []);

  const generateTopSpots = useCallback(async (speciesIdOverride?: number | null, originOverride?: { lat: number; lng: number } | null) => {
    const map = mapRef.current;
    if (!map) return;
    const sid = speciesIdOverride !== undefined ? speciesIdOverride : filters.speciesId;
    setTopMsg(null);
    setTopLoading(true);
    try {
      // Origin priority: an explicit origin (husket utsnitt ved dyplenke) beats a
      // searched place, which beats the GPS fix — otherwise «steinsopp ved Hamar»
      // computed spots around the user's home instead.
      // GPS-fiksen er den SISTE vi har (sisteGpsRef), ikke den fra da kartet
      // ble åpnet: etter en tur og et trykk på «Finn meg» regnet «Lovende»
      // ellers fortsatt rundt parkeringsplassen.
      const center = map.getCenter();
      const place = searchedPlaceRef.current;
      const gpsNaa = sisteGpsRef.current;
      // Avrundet til ~100 m FØR boksen regnes ut. Utgangspunktet er som regel
      // enhetens GPS-posisjon, og midt i boksen ligger nettopp det punktet:
      // rutenett-ruta slår opp vær, skog og høyde hos eksterne tjenester for
      // det, og boksen står i URL-en. Vær og skog er egenskaper ved området
      // (provider-precision.ts): rutenettet flyttes høyst ~60 m, og rutene er
      // minst 1,4 km brede. Ett og samme punkt brukes videre til radiusen og
      // avstandene i popupene, så tallene på skjermen stemmer med hverandre.
      const { lat: originLat, lon: originLng } = roundForProviderLookup(
        originOverride?.lat ?? place?.lat ?? gpsNaa?.lat ?? center.lat,
        originOverride?.lng ?? place?.lng ?? gpsNaa?.lng ?? center.lng
      );

      type Spot = TopSpot;

      // Start local (5 km) and widen only when the near area has no forest to
      // judge, so users in fields/towns still get pointed at the nearest good
      // ground instead of a dead-end message. Når det ER skog her og
      // forholdene er for svake, hjelper ingen radius — da stopper søket etter
      // første kall og sier nettopp det. Reglene (og radiene) står i
      // src/lib/map/lovende-sok.ts.
      const RADII_KM = LOVENDE_RADIER_KM;
      // Rutenettet vi ber om. Serveren kan sette den ned (gratisbrukere får 5),
      // og sier i så fall fra i svaret — derfor leses cellestørrelsen derfra.
      const GRID_N = 7;
      let spots: Spot[] = [];
      let usedRadius: number = RADII_KM[0];
      let limited = false;
      // Radiusen sirklene tegnes med: halve cellebredden i rutenettet som
      // faktisk ble brukt. Se src/lib/utils/spot-area.ts.
      let areaRadiusM = SEARCH_AREA_RADIUS_M;
      // Hvorfor søket ga seg uten treff, og om noe svar underveis viste skog.
      let sluttSteg: LovendeSteg = 'stopp_ingen_skog';
      let skogSett = false;

      for (let i: number | null = 0; i !== null; ) {
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
        const serverCells = (data.cells ?? []) as Spot[];
        const found = filterWithinRadiusKm({ lat: originLat, lng: originLng }, serverCells, radiusKm);
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

        // Ingen treff innenfor radiusen. Avgjørelsen tas på serverens RÅ liste
        // (hjørnerutene utenfor sirkelen er fortsatt treff neste radius tar
        // med), sammen med dekningen og den beste scoren i svaret.
        sluttSteg = nesteSteg({
          serverCellsEmpty: serverCells.length === 0,
          coverage: data.coverage,
          bestScore: data.bestScore,
          radiusIndex: i,
          skogSettFor: skogSett
        });
        skogSett = skogSett || harSkogdekning(data.coverage);
        i = nesteRadiusIndex(sluttSteg, i);

        // Nothing here — tell the user we're widening before the next attempt.
        if (i !== null) {
          setTopMsg(t('expandingSearch', { km: radiusKm }));
        }
      }

      if (spots.length === 0) {
        clearTopSpots();
        if (sluttSteg === 'stopp_forhold') {
          // Skogen er her; det er forholdene som ikke holder. Å be en bruker
          // midt i Nordmarka om å «flytte kartet nærmere skog» var både usant
          // og kom etter fire kall. Ingen tall og ingen påstand om at det ikke
          // finnes sopp — bare at vi ikke har noe å love.
          const art = sid != null ? speciesNamesRef.current.get(sid) ?? null : null;
          setTopMsg(art ? t('weakConditionsSpecies', { species: art }) : t('weakConditions'));
        } else {
          setTopMsg(t('littleForestData', { km: RADII_KM[RADII_KM.length - 1] }));
        }
        return;
      }

      setTopAccess(limited ? 'free_limited' : 'premium_full');
      setTopSpots(spots);
      topSpotsForSpeciesRef.current = sid ?? null;
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
      const utsnitt = bounds.pad(0.2);
      map.fitBounds(utsnitt);
      // Kartet står nå der APPEN la det: midt mellom de lovende områdene, ikke
      // på et sted brukeren har pekt ut. Uten dette leste funnskjemaet
      // flyttingen som brukerens egen — med fersk GPS måtte hvert pluss etter
      // «Lovende» velge mellom to posisjoner, og uten GPS ble funnet lagret
      // midt i boksen uten spørsmål. Målet regnes ut i stedet for å leses av
      // kartet når flyttingen er ferdig; se senterForBoks for hvorfor.
      autoSenterRef.current = senterForBoks(utsnitt.getSouthWest(), utsnitt.getNorthEast());
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
  }, [filters.speciesId, renderTopSpots, clearTopSpots, t]);

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
        // Søketeksten står i et or-filter, der komma og parenteser er
        // syntaks — se postgrest-filter.ts.
        const monster = inneholderMonster(value);
        const [speciesRes, places] = await Promise.all([
          supabase
            .from('mushroom_species')
            .select('id,norwegian_name,swedish_name')
            .or(
              `norwegian_name.ilike.${monster},swedish_name.ilike.${monster},latin_name.ilike.${monster},synonyms_text.ilike.${monster}`
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
      setPredictionCoords(roundForProviderLookup(place.lat, place.lng));
      searchedPlaceRef.current = place;
      setSearchedPlace(place);
      searchReqRef.current++;
    },
    []
  );

  useEffect(() => {
    generateTopSpotsRef.current = generateTopSpots;
  }, [generateTopSpots]);

  // Husk utsnitt, art og søkt sted for neste besøk (24 t). Skrives først når
  // kartet har meldt et senter — før det finnes ikke noe utsnitt å huske.
  useEffect(() => {
    if (!viewport) return;
    // Oslo-plassholderen før GPS-en har svart er ikke et utsnitt noen har valgt.
    // Lagres den, blokkerer den GPS-sentreringen ved hvert senere besøk.
    if (
      Math.abs(viewport.lat - PLASSHOLDER_SENTER.lat) < 1e-4 &&
      Math.abs(viewport.lng - PLASSHOLDER_SENTER.lng) < 1e-4 &&
      viewport.zoom === PLASSHOLDER_ZOOM
    )
      return;
    lagreHusketUtsnitt({
      lat: viewport.lat,
      lng: viewport.lng,
      zoom: viewport.zoom,
      speciesId: filters.speciesId,
      speciesName: selectedSpeciesName,
      place: searchedPlace ? { name: searchedPlace.name, lat: searchedPlace.lat, lng: searchedPlace.lng } : null
    });
  }, [viewport, filters.speciesId, selectedSpeciesName, searchedPlace]);

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
    [generateTopSpots, setFilters]
  );

  const clearSpeciesSearch = useCallback(() => {
    setFilters((prev) => ({ ...prev, speciesId: null }));
    setSelectedSpeciesName(null);
    setSpeciesSearch('');
    setSpeciesSuggestions([]);
    setPlaceSuggestions([]);
    clearTopSpots();
  }, [clearTopSpots, setFilters]);

  // Et artsfilter skal alltid ha et navn brukeren kan se. Et filter uten navn
  // (husket fra det gamle artssøket i filterarket, eller fra en dyplenke uten
  // artnavn) får navnet sitt når artslista er inne, og en art som ikke finnes,
  // fjernes helt. Reglene står i src/lib/map/artsfilter-navn.ts.
  useEffect(() => {
    const retting = rettArtsfilter({
      speciesId: filters.speciesId,
      speciesName: selectedSpeciesName,
      navn: speciesNamesRef.current
    });
    if (retting.type === 'sett_navn') {
      setSelectedSpeciesName(retting.navn);
      // Søkefeltet viser den valgte arten, som når den velges der — men
      // skriver ikke over noe brukeren alt har skrevet.
      setSpeciesSearch((tekst) => tekst || retting.navn);
    } else if (retting.type === 'fjern_art') {
      clearSpeciesSearch();
    }
    // speciesNamesVersion: artslista ligger i en ref og lastes asynkront.
  }, [filters.speciesId, selectedSpeciesName, speciesNamesVersion, clearSpeciesSearch]);

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
          <div style="color:#4b5563;font-size:10px;margin-top:6px">${t('sourcesCredit')}</div>
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
      // Står kartet der appen la det, er midten av utsnittet enhetens
      // posisjon, og ruta slår opp vær for nettopp det punktet. Samme festing
      // som «Lovende» (se oppslagsboks.ts): utsnittet flyttes høyst ~60 m.
      const boks = festBoksTilOppslagspresisjon({
        minLat: b.getSouth(),
        minLng: b.getWest(),
        maxLat: b.getNorth(),
        maxLng: b.getEast()
      });
      const params = new URLSearchParams({
        minLat: String(boks.minLat),
        maxLat: String(boks.maxLat),
        minLng: String(boks.minLng),
        maxLng: String(boks.maxLng),
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
    // Tas FØR grenen under som bare tømmer laget, så også den gjør pågående
    // hentinger ugyldige — samme grep som i loadFindings.
    const gen = ++occLoadGenRef.current;
    if (!showOccurrencesRef.current) {
      cluster.clearLayers();
      lastOccFetchRef.current = null;
      lastOccDrawRef.current = null;
      return;
    }
    // Et svar skal bare inn i laget det ble hentet for: er en nyere lasting i
    // gang, eller kartet (og dermed laget) byttet ut i mellomtiden, forkastes
    // det — og huskes heller ikke, for da ville neste lasting tro at markørene
    // alt sto i det nye laget.
    const utdatert = () => gen !== occLoadGenRef.current || occClusterRef.current !== cluster;
    const b = map.getBounds();
    const visning: Utsnitt = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
    // Årsfilteret hører hjemme i RPC-en (migrasjon 054): filtrerer vi klient-
    // side inne i det avkuttede utvalget, kan «siste 5 år» vise tomt kart i
    // tette utsnitt selv om ferske funn finnes — trunkeringsskjevheten under.
    const yearCutoff = occurrenceYearCutoff(occYearRef.current, new Date());

    // ── Hentingen: gjenbruk når det forrige hentede utsnittet dekker det som
    // vises (samme art og årsfilter), ellers hent. Se utsnitt-gjenbruk.ts.
    // Zoomet brukeren inn, lå radene der allerede — og likevel ble opptil 6000
    // av dem hentet på nytt og hver markør bygget om.
    const forrige = lastOccFetchRef.current;
    const forrigeSammeNokkel =
      forrige !== null && forrige.speciesId === filters.speciesId && forrige.yearCutoff === yearCutoff ? forrige : null;
    let henting: OccFetch;
    if (forrigeSammeNokkel && kanGjenbrukeHenting(forrigeSammeNokkel, visning)) {
      henting = forrigeSammeNokkel;
    } else {
      const argsFor = (u: Utsnitt) => ({
        min_lat: u.south,
        min_lng: u.west,
        max_lat: u.north,
        max_lng: u.east,
        p_species_id: filters.speciesId,
        p_limit: OCCURRENCE_FETCH_LIMIT
      });
      let serverYearFiltered = yearCutoff != null && !occYearParamUnsupportedRef.current;
      // PostgREST kutter hvert svar ved 1000 rader uansett hva p_limit sier, så
      // dette må pagineres — ellers viser kartet 1000 punkter som (fordi RPC-en
      // ikke sorterer) i praksis er én til to arter, og ser komplett ut.
      const hent = (u: Utsnitt, medServerAar: boolean) =>
        fetchRpcPaged<OccRow>(
          supabase,
          'get_occurrences_in_bounds',
          medServerAar ? { ...argsFor(u), p_min_year: yearCutoff } : argsFor(u),
          { limit: OCCURRENCE_FETCH_LIMIT }
        );
      // Litt mer enn det som vises, så små panoreringer treffer det hentede —
      // men bare når forrige henting sier at det er god plass under taket.
      let utsnitt = velgHenteutsnitt({ visning, forrige: forrigeSammeNokkel, tak: OCCURRENCE_FETCH_LIMIT });
      let result = await hent(utsnitt, serverYearFiltered);
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
        result = await hent(utsnitt, false);
      }
      // Polstringen skal aldri koste et helt utsnitt: ble den polstrede
      // hentingen avkuttet, hentes akkurat det som vises. Taket ble hevet til
      // 6000 nettopp for at et vanlig utsnitt skulle komme hel fram.
      if (!result.error && result.truncated && utsnitt !== visning) {
        utsnitt = visning;
        result = await hent(utsnitt, serverYearFiltered);
      }
      // En nyere lasting er i gang — verken husk eller tegn denne.
      if (utdatert()) return;
      henting = {
        utsnitt,
        antallRader: result.rows.length,
        avkortet: result.truncated,
        speciesId: filters.speciesId,
        yearCutoff,
        serverYearFiltered,
        rows: result.rows
      };
      // Et feilet svar huskes ikke — neste flytt skal prøve igjen.
      lastOccFetchRef.current = result.error ? null : henting;
    }

    // ── Tegningen: bare når noe av det markørene er bygget av, er endret.
    // Dekker det hentede fortsatt det som vises, og filtrene og artsdataene er
    // de samme, står markørene der de skal. Da telles det bare på nytt.
    const filter = occEdibilityRef.current;
    const seasonOnly = occSeasonRef.current;
    const nowMonth = new Date().getMonth() + 1;
    const tegnet = lastOccDrawRef.current;
    if (
      tegnet !== null &&
      tegnet.henting === henting &&
      tegnet.filter === filter &&
      tegnet.seasonOnly === seasonOnly &&
      tegnet.maaned === nowMonth &&
      tegnet.navn === speciesNamesRef.current &&
      tegnet.t === t
    ) {
      setOccCount(tegnet.punkter.filter((punkt) => ligger(punkt, visning)).length);
      setOccTruncated(henting.avkortet);
      return;
    }

    const leaflet = (await import('leaflet')).default;
    // En nyere lasting er i gang — ikke rydd clusteret dens resultat skal inn i.
    if (utdatert()) return;
    cluster.clearLayers();
    const names = speciesNamesRef.current;
    const edibilities = speciesEdibilityRef.current;
    const shapes = speciesShapeRef.current;
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
    const inSeasonMonth = (d?: string | null) => {
      if (!d) return true; // no date → keep (graceful before dates are loaded)
      const m = /^\d{4}-(\d{2})/.exec(d);
      if (!m) return true;
      const month = parseInt(m[1], 10);
      const diff = Math.min((month - nowMonth + 12) % 12, (nowMonth - month + 12) % 12);
      return diff <= 1; // within ±1 month of now (wraps the year boundary)
    };
    const points = henting.rows.filter((o) => {
      // Klient-fallbacken for årsfilteret — kun aktiv når RPC-en mangler
      // p_min_year (før migrasjon 054); ellers har serveren alt filtrert.
      if (!henting.serverYearFiltered && !passesYearCutoff(o.observed_at, yearCutoff)) return false;
      if (seasonOnly && !inSeasonMonth(o.observed_at)) return false;
      if (filter === 'all') return true;
      const e = o.species_id != null ? edibilities.get(o.species_id) : undefined;
      if (filter === 'edible') return e === 'edible' || e === 'conditionally_edible';
      return e === 'toxic' || e === 'deadly';
    });
    // Popupen bygges når den ÅPNES, ikke for hvert av opptil 6000 punkter på
    // forhånd. Teksten er ordrett den samme som før — forbeholdene i den er
    // bevisst ærlighet og skal ikke kortes ned.
    const byggPopup = (o: OccRow): string => {
      const name = o.species_id != null ? names.get(o.species_id) ?? t('mushroomFallback') : t('mushroomFallback');
      const edi = o.species_id != null ? edibilities.get(o.species_id) : undefined;
      const ediLabel = edi ? EDIBILITY_LABEL[edi] : null;
      // Tekstfargen, ikke markørfargen: den er for lys til å leses på hvitt
      // (gult ga 2,15:1). Se src/lib/map/spiselighetsfarger.ts.
      const color = (edi && SPISELIGHET_TEKSTFARGE[edi]) || UKJENT_TEKSTFARGE;
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
      return `<div><b>${name}</b>${ediHtml}<br/><span style="color:#555;font-size:12px">${t('registeredFinding')}${foundHtml}</span>${uncertaintyHtml}<br/><span style="color:#6b7280;font-size:11px">${t('historicalFindingNote')}</span><br/><a href="https://www.google.com/maps/search/?api=1&query=${o.latitude},${o.longitude}" target="_blank" rel="noreferrer" style="color:#15803d;font-weight:600;font-size:12px;text-decoration:underline">${t('openInMap')}</a><br/><span style="color:#4b5563;font-size:10px">Artsdatabanken/GBIF</span></div>`;
    };
    for (const o of points) {
      const edi = o.species_id != null ? edibilities.get(o.species_id) : undefined;
      const color = (edi && SPISELIGHET_MARKORFARGE[edi]) || UKJENT_MARKORFARGE;
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
      leaflet
        .marker([o.latitude, o.longitude], { icon })
        .bindPopup(() => byggPopup(o))
        .addTo(cluster);
    }
    lastOccDrawRef.current = {
      henting,
      filter,
      seasonOnly,
      maaned: nowMonth,
      navn: names,
      t,
      punkter: points.map((o) => ({ lat: o.latitude, lng: o.longitude }))
    };
    // Bare det som faktisk er i det som vises, telles — hentingen kan være
    // polstret, og etiketten sier «i utsnittet».
    setOccCount(points.filter((o) => ligger({ lat: o.latitude, lng: o.longitude }, visning)).length);
    // Avkuttingen skal ikke være stille: når vi traff taket viser kartet et
    // utvalg, og spiselighets-/sesongfiltrene over har filtrert INNI det
    // utvalget. Et tomt «giftige»-kart kan da skyldes avkuttingen, ikke at det
    // mangler giftige funn — og må aldri leses som en trygghetserklæring.
    setOccTruncated(henting.avkortet);
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
      // En henting som er underveis, skal ikke fylle laget igjen etter at det
      // er slått av — den sjekker generasjonen når svaret kommer.
      occLoadGenRef.current++;
      occClusterRef.current?.clearLayers();
      // Laget er tomt: det finnes verken en henting eller en tegning å
      // gjenbruke når det slås på igjen.
      lastOccFetchRef.current = null;
      lastOccDrawRef.current = null;
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

    // `accuracy === null` = ingen måling nå, bare den sist kjente posisjonen.
    const render = async (lat: number, lng: number, accuracy: number | null, isFinal: boolean) => {
      if (controller.signal.aborted) return;
      const leaflet = (await import('leaflet')).default;
      if (controller.signal.aborted || mapRef.current !== map) return;

      // Accuracy circle (radius in meters) — shrinks as the GPS sharpens.
      // Uten en måling tegnes ingen sirkel. Reserven tegnet før en sirkel på
      // 100 m rundt en posisjon som kunne være førti minutter gammel — en
      // nøyaktighet ingen hadde målt.
      if (accuracy === null) {
        meCircleRef.current?.remove();
        meCircleRef.current = null;
      } else if (meCircleRef.current) {
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
      if (accuracy !== null) sisteGpsRef.current = { lat, lng };

      // Recenter on the first fix and do one gentle zoom-refinement on the final
      // fix; intermediate fixes only move the dot/circle so we never fight the
      // user panning or pinching while the GPS is still sharpening.
      if (firstFix || isFinal) {
        firstFix = false;
        map.setView([lat, lng], accuracy === null ? 14 : zoomForAccuracy(accuracy));
        // Kartet står nå der appen la det, ikke der brukeren pekte.
        autoSenterRef.current = { lat, lng };
      }
    };

    setLocating(true);
    // finnFerskPosisjon, ikke watchPositionUntilAccurate direkte: i iOS-skallet
    // er den første «målingen» ofte den sist kjente posisjonen, og med god
    // nøyaktighet stoppet letingen der — prikken havnet der brukeren VAR.
    finnFerskPosisjon({
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
        if (controller.signal.aborted) return;
        // Avslått eller ingen måling. Et trykk som bare viste «…» i tolv
        // sekunder og så ingenting, leses som at knappen er død — si fra.
        // Samme id som varselet ved åpning, så de to aldri står oppå hverandre.
        const sist = sisteGpsRef.current;
        if (sist) {
          void render(sist.lat, sist.lng, null, true);
          toast(t('gpsLastKnown'), { id: 'map-geolocation-error' });
        } else {
          toast.error(t('gpsUnavailable'), { id: 'map-geolocation-error' });
        }
      })
      .finally(() => {
        if (geoAbortRef.current === controller) geoAbortRef.current = null;
        setLocating(false);
      });
  }, [t]);

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
      // De andre områdene sendes med: fliser de deler med dette (to lagrede
      // områder som overlapper), skal bli liggende. Ellers tok «Slett» på det
      // ene med seg kartet til det andre.
      if (area) await removeOfflineAreaTiles(area, offlineAreas);
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
      // Nivået brukeren ser på først, så ett ut og ett inn — og aldri dypere
      // enn bakgrunnskartet faktisk har fliser for. Reglene står i
      // offlineZoomLevels (src/lib/utils/offlineMap.ts).
      const { zoom: lagretZoom, zoomLevels } = offlineZoomLevels(zoom, tileTemplate);
      const cacheResult = await cacheMapTilesForArea(area.bounds, zoomLevels, tileTemplate);
      // ET OMRÅDE UTEN FLISER ER IKKE ET OFFLINE-KART.
      //
      // Lista under legger det nye området øverst og kaster det eldste ut når
      // den er full — med flisene. På én strek dekning byttet et forsøk som
      // ikke fikk ned én eneste flis, ut et ekte, nedlastet område mot et tomt,
      // akkurat der det gamle ikke kan lastes ned igjen, og kvitteringen sa
      // «Området ble lagret». cacheMapTilesForArea avviser nå et slikt forsøk
      // (NoTilesCachedError, fanget under); denne sjekken står her i tillegg,
      // så lista aldri avhenger av at hjelperen kaster.
      if (cacheResult.cached === 0) {
        setOfflineStatus(t('offlineCacheFailed'));
        return;
      }
      const areaWithTiles: OfflineArea = {
        ...area,
        // Nivået som faktisk ble lagret. Står kartet på zoom 19–20, er det
        // forstørrede fliser fra nivå 18 brukeren ser; offline-siden tegner
        // området på det nivået som står her, og fant før ingen fliser.
        zoom: lagretZoom,
        cachedTiles: cacheResult.cached,
        failedTiles: cacheResult.failed,
        // Nødvendig for å kunne slette akkurat disse flisene senere.
        tileTemplate,
        zoomLevels
      };

      const kept = [areaWithTiles, ...offlineAreas.filter((item) => item.id !== areaWithTiles.id)];
      const next = kept.slice(0, 8);
      // Område nr. 9 forsvant stille fra lista mens flisene ble igjen i cachen.
      // Faller det ut av visningen, skal lagringen følge med ut — men bare
      // flisene ingen av de gjenværende områdene deler. Uten `next` her mistet
      // området som nettopp ble lagret flisene sine i samme øyeblikk, når det
      // eldste området dekket samme sted (samme skog lagret før hver tur).
      for (const evicted of kept.slice(8)) void removeOfflineAreaTiles(evicted, next);
      saveOfflineAreas(next);
      setOfflineAreas(next);
      setOfflineName('');
      void refreshStorageUsage();
      // «Klare offline» loves bare når ALLE flisene kom ned. Mangler noen —
      // det vanlige når nettet faller ut midt i lagringen — har kartet hull, og
      // kvitteringen sa før «Område lagret. 30 kartfliser klare offline» uten
      // å nevne de 50 som manglet.
      setOfflineStatus(
        cacheResult.failed > 0
          ? t('offlineSavedPartial', {
              failed: cacheResult.failed,
              total: cacheResult.cached + cacheResult.failed
            })
          : t('offlineSaved', { count: cacheResult.cached })
      );
    } catch (error) {
      // Lista og de lagrede områdene er urørt, og teksten sier nettopp det.
      // Navnet brukeren skrev får stå, så neste forsøk er ett trykk.
      //  - For stort område: ingenting ble hentet. Brukeren må zoome inn.
      //  - Ingen fliser lot seg lagre: prøv igjen med bedre dekning.
      //  - Alt annet er en uventet feil.
      setOfflineStatus(
        t(
          error instanceof OfflineAreaTooLargeError
            ? 'offlineAreaTooLarge'
            : error instanceof NoTilesCachedError
              ? 'offlineCacheFailed'
              : 'offlineSaveError'
        )
      );
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

  /**
   * Sletting av eget funn, fra popupen.
   *
   * Slettingen er MYK (migrasjon 056): raden får deleted_at, forsvinner fra
   * alle lesesteder, og hard-slettes av /api/cron/purge-deleted-findings 30
   * dager senere. Derfor kan varselet under tilby en ekte angreknapp — den
   * skriver deleted_at tilbake til NULL, den gjenoppretter ikke noe.
   *
   * Angreknappen er ikke pynt. Popupen betjenes med tommelen på en telefon i
   * skogen, og et feilklikk her fjernet tidligere et funn for godt. To-trinns
   * bekreftelse i popupen fanger de fleste feilklikkene; angreknappen fanger
   * resten. (Funn kan også slettes og gjenopprettes på Mine steder, der
   * «Nylig slettet» står hele angrefristen — se src/components/places/.)
   *
   * Kartet — ikke popupen — eier dette, fordi det er kartet som må lukke
   * popupen og tegne laget på nytt. Popupen lever i en løsrevet React-rot som
   * Leaflet river ned i samme øyeblikk.
   */
  const restoreFinding = useCallback(
    async (findingId: string) => {
      try {
        const res = await fetch(`/api/findings/${findingId}/restore`, { method: 'POST' });
        if (!res.ok) throw new Error('restore failed');
        await loadFindingsRef.current?.();
        toast.success(t('findingRestored'));
      } catch {
        toast.error(t('findingRestoreFailed'));
      }
    },
    [t]
  );

  const handleDeleteFinding = useCallback(
    async (findingId: string) => {
      // Kastes videre til popupen, som viser den der brukeren ser på. Bare
      // rutas egen, oversatte tekst (med `details` når en migrasjon mangler:
      // «Funnet ditt er trygt og IKKE slettet …») eller katalogens. Et fetch
      // uten dekning kaster nettleserens engelske «Load failed», og en
      // feilside fra en proxy er ikke rutas svar — se funn-svar.ts.
      let res: Response;
      try {
        res = await fetch(`/api/findings/${findingId}`, { method: 'DELETE' });
      } catch {
        throw new VisbarFeil(t('findingDeleteFailed'));
      }
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        throw new VisbarFeil(serverFeiltekst(body, { medDetaljer: true, status: res.status }) ?? t('findingDeleteFailed'));
      }

      mapRef.current?.closePopup();
      // Nåla tas ut med en gang, så den ikke står igjen hvis hentingen under
      // feiler. Laget stemmes av mot svaret, og et feilet svar endrer ingenting.
      funnlagRef.current?.fjern(findingId);
      await loadFindingsRef.current?.();

      // Strengene hentes HER, i et tre som har next-intl-provideren. Varselet
      // rendres av <Toaster> et helt annet sted i treet, så det må få ferdig
      // tekst — ikke en t()-kall som ville krevd provideren der borte.
      const deletedText = t('findingDeleted');
      const undoText = t('findingDeleteUndo');
      toast(
        (item) => (
          <span className="flex items-center gap-3">
            <span>{deletedText}</span>
            <button
              type="button"
              onClick={() => {
                toast.dismiss(item.id);
                void restoreFinding(findingId);
              }}
              className="shrink-0 rounded-full bg-forest-800 px-3 py-1 text-xs font-semibold text-white hover:bg-forest-700"
            >
              {undoText}
            </button>
          </span>
        ),
        // Lengre enn standardvarselet (4 s): angreknappen er ubrukelig hvis
        // den forsvinner før brukeren rekker å se at den var der.
        { duration: 10_000, icon: '🗑️' }
      );
    },
    [restoreFinding, t]
  );

  /**
   * Stabil inngang til slettingen.
   *
   * loadFindings er avhengighet i en useEffect som HENTER FUNN (linja med
   * `void loadFindings()`), så alt som havner i dens deps-liste må ha stabil
   * identitet — ellers henter kartet på nytt ved hver eneste render.
   * handleDeleteFinding lukker over `t`, og det er ikke en garanti vi vil at
   * kartets henteløkke skal hvile på. Samme ref-grep som loadFindingsRef
   * bruker rett under.
   */
  const deleteFindingRef = useRef(handleDeleteFinding);
  useEffect(() => {
    deleteFindingRef.current = handleDeleteFinding;
  }, [handleDeleteFinding]);
  const deleteFinding = useCallback((findingId: string) => deleteFindingRef.current(findingId), []);

  /**
   * Melding av en annens funn, fra popupen.
   *
   * Lagringen er forumets egen (useReportContent): samme tabell, samme
   * moderatorkø, og `finding_id` har ligget klar i den siden migrasjon 001 —
   * det var bare kartet som manglet knappen. Popupen kan ikke kalle kroken
   * selv; den lever i en løsrevet React-rot uten QueryClient.
   *
   * Feilteksten hentes HER, i et tre som har next-intl-provideren, og kastes
   * videre til popupen som viser den. Aldri den rå feilmeldingen: det er enten
   * en intern kode eller engelsk PostgREST-tekst.
   *
   * Meldingen sier ikke hvem som meldte til noen andre enn moderatorene, og
   * popupen viser ingenting om andres meldinger.
   */
  const { mutateAsync: sendReport } = useReportContent();
  const handleReportFinding = useCallback(
    async (findingId: string, payload: FindingReportPayload) => {
      try {
        await sendReport({ findingId, reason: payload.reason, description: payload.description });
      } catch (error) {
        throw new VisbarFeil(forumError(error, tReport('submitError')));
      }
    },
    [forumError, sendReport, tReport]
  );

  /**
   * Blokkering av den som la inn et funn, fra popupen.
   *
   * Tre ting skjer, i denne rekkefølgen:
   *  1. Raden skrives. `ignoreDuplicates` (ON CONFLICT DO NOTHING), ikke en
   *     vanlig upsert: blocked_users har ingen UPDATE-policy, så en upsert på
   *     en rad som alt finnes avvises av RLS. Det skjer når forrige forsøk
   *     gikk gjennom, men laget ikke ble lastet på nytt — og da skal ikke et
   *     nytt trykk svare «kunne ikke blokkere» om en bruker som ER blokkert.
   *  2. Brukerens nåler tas ut av laget med en gang, av markørene vi alt har.
   *     Kartet skal ikke stå med funnene til en du nettopp blokkerte fordi en
   *     henting feilet.
   *  3. Laget hentes på nytt, og forumets spørringer gjøres ugyldige — de
   *     leser samme blokkeringsliste (se BLOCK_INVALIDATION_KEYS).
   *
   * Kaster med ferdig oversatt tekst, som popupen viser.
   */
  const handleBlockFindingAuthor = useCallback(
    async (finding: MapFinding) => {
      const blokkertId = finding.user_id;
      if (!currentUserId || !blokkertId || blokkertId === currentUserId) {
        throw new VisbarFeil(tBlock('failed'));
      }
      // Alt som går galt her — også et kall som kaster — blir til den
      // oversatte teksten. Popupen viser det som kastes ordrett.
      let skrevet = false;
      try {
        const { error } = await supabase
          .from('blocked_users')
          .upsert(
            { blocker_id: currentUserId, blocked_id: blokkertId },
            { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true }
          );
        skrevet = !error;
      } catch {
        skrevet = false;
      }
      if (!skrevet) throw new VisbarFeil(tBlock('failed'));

      blokkerte.leggTil(blokkertId);
      mapRef.current?.closePopup();
      funnlagRef.current?.fjernFraBruker(blokkertId);
      invalidateAfterBlockChange(queryClient);
      // Navnet kommer fra funnet; uten brukernavn sier varselet «Ukjent bruker».
      toast.success(tBlock('blocked', { name: finding.username?.trim() || tBlockedUsers('unknown') }));
      void loadFindingsRef.current?.();
    },
    [blokkerte, currentUserId, queryClient, supabase, tBlock, tBlockedUsers]
  );

  // Stabile innganger, av samme grunn som deleteFinding over: de står i
  // deps-lista til loadFindings, som en effekt henter funn på.
  const reportFindingRef = useRef(handleReportFinding);
  const blockFindingAuthorRef = useRef(handleBlockFindingAuthor);
  useEffect(() => {
    reportFindingRef.current = handleReportFinding;
    blockFindingAuthorRef.current = handleBlockFindingAuthor;
  }, [handleReportFinding, handleBlockFindingAuthor]);
  const reportFinding = useCallback(
    (findingId: string, payload: FindingReportPayload) => reportFindingRef.current(findingId, payload),
    []
  );
  const blockFindingAuthor = useCallback((finding: MapFinding) => blockFindingAuthorRef.current(finding), []);

  const loadFindings = useCallback(async () => {
    const map = mapRef.current;
    const clusters = clusterRef.current;
    if (!map || !clusters) return;

    // Tas FØR alt annet — også før grenen under som bare tømmer laget — så
    // hvert nytt kall gjør alle eldre, pågående hentinger ugyldige.
    const gen = ++findingsGenRef.current;
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
      funnlagRef.current?.tom();
      findingsLayerShowsRef.current = null;
      return;
    }

    // Hvem leseren har blokkert. Startes FØR hentingen under og ventes på
    // etter den, så de to går samtidig og laget tegnes én gang — filtrert.
    // «Kun mine funn» viser bare egne funn og trenger ikke lista.
    const blokkerteLofte = filters.onlyMine ? null : blokkerte.ider();

    const { data, error } = filters.onlyMine && currentUserId
      ? await (async () => {
          let query = supabase
            .from('findings')
            .select(
              'id,user_id,species_id,latitude,longitude,found_at,quantity,notes,thumbnail_url,verification_status,is_zone_finding,zone_label,zone_precision_km,mushroom_species(norwegian_name,latin_name,edibility)'
            )
            .eq('user_id', currentUserId)
            .eq('is_negative_observation', false)
            // «Kun mine funn» leser tabellen direkte, ikke public_findings, så
            // deleted_at-filteret i viewet (migrasjon 056) gjelder ikke her.
            // Uten denne linja ville et funn brukeren nettopp slettet blitt
            // tegnet igjen ved neste panorering.
            .is('deleted_at', null)
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

    // Avvises aldri, og venter høyst BLOKKERTE_FRIST_MS: feiler oppslaget
    // eller blir det hengende, vises funnene som før. Settet er huskens eget:
    // en liste som kom etter fristen, men før funnene, er med i filteret under.
    const blokkerteIder = blokkerteLofte ? await blokkerteLofte : null;

    // Et nyere kall har overtatt (panorering, filterendring, innlogging som
    // løste seg). Dets svar skal inn i laget, ikke dette.
    if (gen !== findingsGenRef.current) return;

    if (error) {
      // Det som lå der fra før får stå — med ett unntak: fellesskapets funn
      // under en avkrysning som sier «mine». Da er et tomt lag det ærlige.
      if (filters.onlyMine && findingsLayerShowsRef.current === 'shared') {
        funnlagRef.current?.tom();
        findingsLayerShowsRef.current = null;
      }
      return;
    }

    const findings = (data ?? []) as MapFinding[];
    // Fellesskapets lag uten funnene til dem leseren har blokkert. Viewet bak
    // (public_findings) kjenner ikke blokkeringslista, så dette er stedet —
    // se src/lib/moderation/blokkering.ts.
    const synlige = blokkerteIder ? utenBlokkerte(findings, blokkerteIder) : findings;
    const filtered = synlige.filter((finding) => passPeriodFilter(finding.found_at, filters.period));

    // Laget hører til kartet det ble laget for. Er kartet byttet ut mens vi
    // ventet på svaret, finnes ikke laget dette svaret skulle inn i.
    const funnlag = funnlagRef.current;
    if (!funnlag || funnlag.klynger !== clusters || clusterRef.current !== clusters) return;

    // Herfra og ut er det ingen venting: generasjonen er sjekket over, og
    // resten skjer i én usplittet bolk. To overlappende kjøringer kan da ikke
    // flette seg og etterlate begge settene i laget.
    //
    // Bytter laget kilde — egne funn ↔ fellesskapets — bygges alt på nytt:
    // samme funn står på hvert sitt punkt i de to (eksakt for eieren,
    // forskjøvet for andre), og ingenting fra det ene skal bli stående i det
    // andre.
    const viser = filters.onlyMine ? 'own' : 'shared';
    if (findingsLayerShowsRef.current !== viser) funnlag.tom();
    findingsLayerShowsRef.current = viser;

    // AVSTEMMING, IKKE TØMMING. Laget ble tømt og bygget opp ved hver henting,
    // og Leaflet lukker popupen til en markør som fjernes: åpnet du et funn,
    // og kartet flyttet seg for å gi popupen plass, forsvant den når den nye
    // hentingen var ferdig. Nå blir markører for funn som fortsatt er med,
    // stående — med popupen og alt brukeren har skrevet i den. Se funnlag.ts.
    funnlag.synk(filtered, (finding) => {
      // Kun eierens egne funn kan slettes. Det offentlige laget viser andres
      // nåler også, og public_findings har user_id, så sammenligningen holder
      // begge lagene i sjakk.
      const eget = currentUserId != null && finding.user_id === currentUserId;
      // Melding og blokkering: bare for en innlogget leser, og bare på ANDRES
      // funn. Før innloggingen er slått opp vises ingen av dem.
      const kanMelde = currentUserId != null && !eget;
      const displayName = finding.species_id != null ? speciesNamesRef.current.get(finding.species_id) : undefined;
      return {
        // Alt popupen viser. Er dette uendret, gjengis den ikke på nytt.
        signatur: JSON.stringify([finding, displayName ?? null, eget, kanMelde]),
        // Provideren MÅ være med — den bor i findingPopupElement, som HAR en
        // test ved siden av seg. Popupen er en løsrevet React-rot (Leaflet eier
        // elementet), og React-kontekst krysser ikke rot-grenser: uten
        // provider kaster FindingPopup på første linje og roten står tom. Fra
        // 26. juni til 1. august ga hvert klikk på en soppmarkør en tom hvit
        // boks for ALLE brukere. Ingen test laster denne fila, så wrappingen
        // skal ikke ligge her.
        lag: () =>
          findingPopupElement({
            finding,
            displayName,
            locale,
            messages: messages as Record<string, unknown>,
            canDelete: eget,
            onDelete: deleteFinding,
            onReport: kanMelde ? reportFinding : undefined,
            onBlock: kanMelde && finding.user_id ? blockFindingAuthor : undefined
          })
      };
    });
  }, [
    currentUserId,
    currentUsername,
    filters,
    supabase,
    locale,
    messages,
    deleteFinding,
    reportFinding,
    blockFindingAuthor,
    blokkerte
  ]);

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
      // Før første kart: Leaflets zoom-tidtaker og treghetsramme kjører etter
      // map.remove() og krasjet når brukeren forlot kartet midt i en zoom
      // eller et sveip (Sentry MYCELET-9 og MYCELET-A).
      vernLeafletEtterFjerning(L);
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
        // Et søkt sted overstyrer begge deler. Det dekker to tilfeller: en
        // dyplenke (?lat&lng&zoom), og et stedssøk som rakk å løse seg mens
        // Leaflet-importen fortsatt lastet — der var goToPlace sin setView en
        // no-op fordi kartet ikke fantes ennå, og kartet ble liggende på Oslo
        // mens søkefeltet og værstripa sa noe annet.
        // Et husket utsnitt fra forrige besøk kommer etter dyplenken, før Oslo.
        center: searchedPlaceRef.current
          ? [searchedPlaceRef.current.lat, searchedPlaceRef.current.lng]
          : husketUtsnittRef.current
            ? [husketUtsnittRef.current.lat, husketUtsnittRef.current.lng]
            : [PLASSHOLDER_SENTER.lat, PLASSHOLDER_SENTER.lng],
        zoom: initialView?.zoom ?? husketUtsnittRef.current?.zoom ?? (searchedPlaceRef.current ? 12 : PLASSHOLDER_ZOOM),
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
      // Tallene bor i offlineMap.ts (MAX_NATIVE_ZOOM): offline-lagringen må
      // holde seg innenfor de samme nivåene som lagene faktisk har fliser for.
      const baseTerreng = L.tileLayer(TERRAIN_TILE_TEMPLATE, {
        attribution: '&copy; Kartverket',
        maxNativeZoom: MAX_NATIVE_ZOOM[TERRAIN_TILE_TEMPLATE],
        maxZoom: 20
      });
      const baseKart = L.tileLayer(OSM_TILE_TEMPLATE, {
        attribution: '&copy; OpenStreetMap',
        maxNativeZoom: MAX_NATIVE_ZOOM[OSM_TILE_TEMPLATE],
        maxZoom: 20
      });
      const baseSatellitt = L.tileLayer(SATELLITE_TILE_TEMPLATE, {
        attribution: `${t('attributionAerial')} &copy; Esri, Maxar, Earthstar Geographics`,
        maxNativeZoom: MAX_NATIVE_ZOOM[SATELLITE_TILE_TEMPLATE],
        maxZoom: 20
      });
      baseTerreng.addTo(map);
      baseLayersRef.current = { terreng: baseTerreng, kart: baseKart, satellitt: baseSatellitt };

      // Leaflets egne kontroller har engelske navn («Zoom in», «Layers», «Close
      // popup»). De er det eneste en skjermleser får lest opp for knappene.
      const zoomkontroll = L.control
        .zoom({ position: 'topright', zoomInTitle: t('zoomIn'), zoomOutTitle: t('zoomOut') })
        .addTo(map);
      // 44 × 44 px treffflate på hver av de to knappene — se ZOOMKNAPP.
      const zoomflate = zoomkontroll.getContainer();
      zoomflate?.querySelector('.leaflet-control-zoom-in')?.classList.add(...ZOOMKNAPP, ...ZOOMKNAPP_INN);
      zoomflate?.querySelector('.leaflet-control-zoom-out')?.classList.add(...ZOOMKNAPP, ...ZOOMKNAPP_UT);
      // Turruter oppå grunnkartet, under prognosen og markørene (tile-panet).
      const turruter = L.tileLayer.wms(TRAIL_WMS_URL, {
        layers: 'Fotrute',
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        attribution: `${t('attributionTrails')} &copy; Kartverket`,
        // Tjenesten tegner ingenting over 1:1 000 000 (MaxScaleDenominator i
        // GetCapabilities) — z8–9 ga tomme fliser og en avkrysning uten effekt.
        // Kartet går til z20; uten maxZoom arver laget Leaflets 18 og forsvinner
        // akkurat der stien ved en lovende rute skal leses.
        minZoom: 10,
        maxZoom: 20,
        zIndex: 5,
        opacity: 0.9
      });
      if (readLocal(TRAIL_LAYER_KEY) === '1') turruter.addTo(map);
      map.on('overlayadd', (e: import('leaflet').LayersControlEvent) => {
        if (e.layer === turruter) writeLocal(TRAIL_LAYER_KEY, '1');
      });
      map.on('overlayremove', (e: import('leaflet').LayersControlEvent) => {
        if (e.layer === turruter) writeLocal(TRAIL_LAYER_KEY, '0');
      });

      // Navnene i lagvelgeren på leserens språk. De sto som faste norske ord,
      // mens den svenske introen ba brukeren bytte til «Satellit». `t` er den
      // fra første gjengivelse (effekten kjøres én gang) — språkbytte laster
      // siden på nytt, så den blir aldri gammel. Lagene huskes og byttes på
      // identitet, ikke på navn, så navnene kan endres fritt.
      const lagvelger = L.control
        .layers(
          {
            [t('layerTerrain')]: baseTerreng,
            [t('layerMap')]: baseKart,
            [t('layerSatellite')]: baseSatellitt
          },
          { [t('layerTrails')]: turruter },
          { position: 'topright', collapsed: true }
        )
        .addTo(map);
      // Knappen som åpner lagvelgeren heter «Layers» og har ingen innstilling
      // for det; navnet settes på elementet.
      const lagknapp = lagvelger.getContainer()?.querySelector('.leaflet-control-layers-toggle');
      lagknapp?.setAttribute('title', t('layersControl'));
      lagknapp?.setAttribute('aria-label', t('layersControl'));
      // Krysset i en popup heter «Close popup». Gjelder alle popupene på
      // kartet: funn, registrerte funn, lovende områder og soppbilder.
      map.on('popupopen', (e: import('leaflet').PopupEvent) => {
        const kryss = e.popup.getElement()?.querySelector('.leaflet-popup-close-button');
        if (!kryss) return;
        kryss.setAttribute('aria-label', t('closePopup'));
        kryss.classList.add(...POPUPKRYSS_TREFF);
      });

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
      funnlagRef.current = new Funnlag<MapFinding>(L, clusters, (funn) => createMarkerIcon(L, funn.edibility));
      occClusterRef.current = occCluster;
      heatLayerRef.current = heatLayer;
      topLayerRef.current = topLayer;
      speciesLayerRef.current = speciesLayer;

      // Har posisjonen alt løst seg før denne (asynkrone) initen ble ferdig,
      // fikk ikke setView-effekten kjørt (ingen kart). Sentrer på brukeren nå —
      // med mindre et søkt sted eller en dyplenke ba om et bestemt utsnitt.
      // Samme vern som de to GPS-effektene lenger nede; uten det her taper
      // dyplenken kappløpet når posisjonen kommer raskt (varm fiks, gitt
      // tillatelse fra før).
      if (posRef.current && !searchedPlaceRef.current && !husketUtsnittRef.current) {
        map.setView([posRef.current.lat, posRef.current.lng], 13);
        autoSenterRef.current = { lat: posRef.current.lat, lng: posRef.current.lng };
      }

      const onMoveEnd = () => {
        // Leaflet kobler ikke fra lyttere ved remove(), og en «moveend» kan
        // komme etterpå (stoppet panorering inne i remove(), eller den
        // forsinkede etter en størrelsesendring). Da er dette kartet borte —
        // et lagbytte her krasjet i GridLayer, og lasterne hentet data for en
        // side brukeren har forlatt.
        if (mapRef.current !== map) return;
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
        setViewport({ lat: Number(center.lat.toFixed(5)), lng: Number(center.lng.toFixed(5)), zoom: map.getZoom() });
        // Lagbyttet og utsnittet over skjer med en gang. HENTINGENE venter
        // til kartet har stått i ro: hvert «moveend» startet før fire
        // hentinger (prognose, funn, fliser, registrerte funn) uten opphold.
        if (moveLoadTimerRef.current) clearTimeout(moveLoadTimerRef.current);
        moveLoadTimerRef.current = setTimeout(() => {
          moveLoadTimerRef.current = null;
          lastForUtsnitt();
        }, FLYTT_RO_MS);
      };

      /** Hent alt som gjelder det utsnittet kartet står på nå. */
      const lastForUtsnitt = () => {
        // Kan fyre etter at kartet er fjernet (tidtakeren, eller den første
        // lastingen rett under) — samme vern som i onMoveEnd.
        if (mapRef.current !== map) return;
        const center = map.getCenter();
        // Tre desimaler (~100 m), ikke seks: hvert lille rykk i kartet ga en
        // ny nøkkel i usePrediction og dermed et nytt kall til /api/prediction
        // for et punkt serveren uansett runder av før vær og skog slås opp.
        // Ikke grovere — svaret har tekst om skogen NÆR punktet. Samme
        // presisjon som de andre stedene punktet settes (se predictionCoords).
        setPredictionCoords(roundForProviderLookup(center.lat, center.lng));
        void loadFindingsRef.current();
        void loadPredictionTilesRef.current();
        void loadOccurrencesRef.current();
      };

      map.on('moveend', onMoveEnd);
      // Første lasting skjer med en gang, uten å vente ut roen. Her sto i
      // tillegg to ventede kall til funn og fliser rett etter — de samme
      // hentingene to ganger ved hver åpning av kartet. Ingenting under
      // venter på dem.
      onMoveEnd();
      if (moveLoadTimerRef.current) clearTimeout(moveLoadTimerRef.current);
      moveLoadTimerRef.current = null;
      lastForUtsnitt();
      // «Let etter denne arten»: arten er valgt fra første render; nå som kartet
      // står, regnes lovende områder ut rundt utsnittet (GPS eller søkt sted).
      if (initialSpeciesRef.current) {
        const id = initialSpeciesRef.current.id;
        initialSpeciesRef.current = null;
        if (husketUtsnittRef.current) {
          // Rundt det huskede utsnittet — ikke rundt en varm GPS-fiks som ellers
          // ville dratt kartet hjem igjen med fitBounds.
          const c = map.getCenter();
          void generateTopSpotsRef.current(id, { lat: c.lat, lng: c.lng });
        } else if (searchedPlaceRef.current || posRef.current) {
          void generateTopSpotsRef.current(id);
        } else {
          ventendeArtRef.current = id;
        }
      }
    };

    void init();

    return () => {
      mounted = false;
      // Nullstill referansen FØR remove(): remove() kan selv sende «moveend»
      // (stopper en pågående panorering), og lytterne sjekker mapRef.
      const map = mapRef.current;
      mapRef.current = null;
      map?.remove();
      // En henting som ventet på at kartet skulle stå i ro, skal ikke fyre
      // for en side brukeren har forlatt.
      if (moveLoadTimerRef.current) clearTimeout(moveLoadTimerRef.current);
      moveLoadTimerRef.current = null;
      lastOccFetchRef.current = null;
      lastOccDrawRef.current = null;
      // Kartet er alt fjernet over; bare popup-røttene står igjen å rydde.
      funnlagRef.current?.kast();
      funnlagRef.current = null;
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
        // Farge og form på funnmarkørene kommer fra artsdataene. Rakk
        // markørene å bli tegnet først, sto de som brune standardprikker til
        // neste panorering hentet alt på nytt — og nå som et utsnitt som alt
        // er dekket ikke hentes på nytt, ville de blitt stående. Tegn om av
        // radene vi har; det koster ingen henting.
        if (lastOccDrawRef.current) void loadOccurrencesRef.current();
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
    if (latitude != null && longitude != null) {
      // posRef oppdateres alltid — «Finn meg» og funnskjemaet trenger den —
      // men et husket utsnitt eller et søkt sted skal ikke yankes bort.
      posRef.current = { lat: latitude, lng: longitude };
      // En nyere måling (fra «Finn meg» eller funnskjemaet) skal ikke byttes
      // ut med den fra åpningen — den kan komme sent inn etter en kald start.
      sisteGpsRef.current ??= { lat: latitude, lng: longitude };
      lagreHusketPosisjon(latitude, longitude); // forsidekortet starter her neste gang (husket-posisjon.ts)
      if (searchedPlaceRef.current || husketUtsnittRef.current) return;
      if (mapRef.current) {
        mapRef.current.setView([latitude, longitude], 13);
        autoSenterRef.current = { lat: latitude, lng: longitude };
      }
      if (ventendeArtRef.current) {
        const id = ventendeArtRef.current;
        ventendeArtRef.current = null;
        void generateTopSpotsRef.current(id, { lat: latitude, lng: longitude });
      }
    }
  }, [latitude, longitude]);

  // Posisjon avslått: den ventende arten regnes rundt det kartet viser.
  useEffect(() => {
    if (!geoError || !ventendeArtRef.current) return;
    const id = ventendeArtRef.current;
    ventendeArtRef.current = null;
    const c = mapRef.current?.getCenter();
    void generateTopSpotsRef.current(id, c ? { lat: c.lat, lng: c.lng } : null);
  }, [geoError]);

  useEffect(() => {
    if (searchedPlaceRef.current || husketUtsnittRef.current) return;
    if (latitude != null && longitude != null) {
      setPredictionCoords(roundForProviderLookup(latitude, longitude));
    }
  }, [latitude, longitude]);

  useEffect(() => {
    void loadFindings();
  }, [loadFindings]);

  useEffect(() => {
    void loadPredictionTiles();
  }, [loadPredictionTiles]);

  // De registrerte funnene følger artsfilteret med en gang, som funnlaget og
  // flisene over. De ble før bare hentet på nytt når kartet ble flyttet: ble
  // en art valgt uten at «Lovende» flyttet kartet (utenfor sesong finnes ingen
  // lovende områder å zoome til), eller ble arten nullstilt, sto laget igjen
  // med forrige utvalg mens brikken og de to andre lagene sa noe annet.
  useEffect(() => {
    void loadOccurrences();
  }, [loadOccurrences]);

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

  // `isolate` gir kartet sin egen stablingskontekst. Uten den konkurrerte
  // Leaflets lag (400) og kontroller (1000) og våre egne knapper
  // (z-[1000]–z-[1100]) i rot-konteksten og malte over bunnmenyen (z-50) —
  // bare etikettene stakk fram, ikonene lå under kartet. Alt som skal dekke
  // hele skjermen herfra (GpxKopierModal, ProvGratisArk) portales til <body>;
  // resten er `absolute` inni kartet med vilje.
  //
  // Høyden: 100dvh minus det som faktisk står over og under kartet på /map —
  // header (3.5rem + safe-area topp), main pt-4 (1rem), tittelraden (2rem),
  // space-y-3 (0.75rem), main pb-4 (1rem) og PageWrapper sin bunnpolstring
  // (5rem + safe-area bunn) = 13.25rem. Da blir siden nøyaktig én skjerm høy
  // og kartet slutter ~1.5rem over bunnmenyen (4.44rem). Før trakk den bare
  // fra 8.5rem, så kartet gikk 51px inn under menyen på alle skjermer.
  // vh er reserve for iOS 15.0–15.3 (appens minstemål), som ikke kan dvh.
  // min-h holder kartet brukbart på små/liggende skjermer; da ruller siden.
  return (
    <div className="relative isolate h-[calc(100vh_-_13.25rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] min-h-[20rem] overflow-hidden rounded-xl border border-gray-200 supports-[height:100dvh]:h-[calc(100dvh_-_13.25rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))]">
      <div ref={containerRef} className="h-full w-full" />

      {/* Arket viser artsfilteret og tømmer det samme vei som brikken under
          (clearSpeciesSearch). Sted og art velges i søkefeltet — arkets egne
          søk skrev bare halve tilstanden, se MapFilters. */}
      <MapFilters
        filters={filters}
        onChange={setFilters}
        speciesName={selectedSpeciesName}
        onClearSpecies={clearSpeciesSearch}
      />

      {/* 8 px mellom radene (gap-2): hver rad er 36 px høy og har en treffflate
          på 44 px, så flatene møtes akkurat — se trykkflate.ts.

          z-[1001], ett hakk over pillen nederst og de runde knappene
          (z-[1000]): menyene som åpnes i denne kolonnen når ned til dem på en
          liten skjerm, og lå da UNDER pillen — nederste valg lot seg ikke
          trykke på. Det åpne prognosepanelet ligger over igjen (z-[1002], se
          HotspotPanel), som før.

          max-h + min-h-0 på panelene: er kartet for lavt, ruller panelet inni
          seg selv i stedet for å bli klippet av kartkanten. */}
      <div className="absolute left-1/2 top-3 z-[1001] flex max-h-[calc(100%-1.5rem)] w-[calc(100%-7rem)] max-w-md -translate-x-1/2 flex-col items-center gap-2">
        {/* The species chip and the search box coexist: picking a species used
            to REPLACE the input, which made «steinsopp ved Hamar» impossible —
            you could have one or the other, never both. */}
        {selectedSpeciesName ? (
          <div className="flex w-full items-center justify-between gap-2 rounded-full bg-forest-800 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
            <span className="truncate">🍄 {t('promisingSpotsFor', { species: selectedSpeciesName })}</span>
            <button
              type="button"
              onClick={clearSpeciesSearch}
              className={`relative shrink-0 rounded-full bg-white/20 px-2.5 py-1 font-semibold hover:bg-white/30 ${TREFF_44}`}
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
              {/* Feltet hadde bare en plassholder: ikke noe navn for en
                  skjermleser, og fokusrammen var fjernet uten erstatning.
                  Navnet følger plassholderen, så de to aldri sier hver sitt.
                  Plassholderen er for lang for feltet på en telefon (16 px
                  skrift på iOS, se globals.css) — den kuttes med «…» i
                  stedet for midt i et ord. */}
              {/* Etiketten har ingen tekst (navnet er aria-label). Den finnes
                  for treffflaten: et trykk på en etikett setter fokus i
                  feltet, og polstringen gir 4 px over og under det 36 px
                  høye feltet uten å flytte noe. */}
              <label className="-my-1 block py-1">
                <input
                  value={speciesSearch}
                  onChange={(event) => searchSpeciesForSpots(event.target.value)}
                  placeholder={selectedSpeciesName ? t('searchPlaceOnly') : t('searchSpeciesOrPlace')}
                  aria-label={selectedSpeciesName ? t('searchPlaceOnly') : t('searchSpeciesOrPlace')}
                  className="h-9 w-full rounded-full bg-white/95 px-4 text-xs text-gray-800 shadow-lg backdrop-blur placeholder:text-gray-500 placeholder-shown:text-ellipsis focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-700"
                />
              </label>
              {speciesSuggestions.length > 0 || placeSuggestions.length > 0 ? (
                <div className="absolute left-0 right-0 top-full z-[1001] mt-1 max-h-60 overflow-auto rounded-xl bg-white shadow-xl">
                  {speciesSuggestions.length > 0 ? (
                    <>
                      <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                        {t('groupSpecies')}
                      </p>
                      {speciesSuggestions.map((s) => (
                        <button
                          key={`sp-${s.id}`}
                          type="button"
                          onClick={() => selectSpeciesForSpots(s.id, s.name)}
                          className="block min-h-[44px] w-full px-3 py-2 text-left text-xs text-gray-800 hover:bg-gray-50"
                        >
                          🍄 {s.name}
                        </button>
                      ))}
                    </>
                  ) : null}
                  {placeSuggestions.length > 0 ? (
                    <>
                      <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                        {t('groupPlaces')}
                      </p>
                      {placeSuggestions.map((p) => (
                        <button
                          key={`pl-${p.name}-${p.lat}-${p.lng}`}
                          type="button"
                          onClick={() => goToPlace(p)}
                          className="block min-h-[44px] w-full px-3 py-2 text-left text-xs text-gray-800 hover:bg-gray-50"
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
        <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2">
          {/* Korte, stabile etiketter med vilje: den gamle «Skjul funn (minst
              6000)» brakk over tre linjer på mobil og dyttet alt under seg.
              Antallet bor nå i filterpanelet, der det leses i ro. */}
          <button
            type="button"
            onClick={toggleOccurrences}
            className={`${VERKTOYKNAPP} ${
              showOccurrences ? 'bg-forest-800 text-white hover:bg-forest-700' : 'bg-white/95 text-gray-800 hover:bg-white'
            }`}
          >
            {showOccurrences ? t('hideFindingsShort') : t('showFindingsShort')}
          </button>
          {showOccurrences ? (
            <button
              type="button"
              onClick={() => {
                setOccFiltersOpen((open) => !open);
                setToolsOpen(false);
                setOfflineOpen(false);
              }}
              aria-expanded={occFiltersOpen}
              aria-controls="map-occ-filters"
              aria-label={t('occFiltersLabel')}
              className={`inline-flex items-center gap-1 ${VERKTOYKNAPP} ${
                occFiltersOpen || occFilterCount > 0
                  ? 'bg-forest-800 text-white hover:bg-forest-700'
                  : 'bg-white/95 text-gray-800 hover:bg-white'
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              {occFilterCount > 0 ? <span className="font-semibold">{occFilterCount}</span> : null}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => (topSpots ? clearTopSpots() : void generateTopSpots())}
            disabled={topLoading}
            className={`${VERKTOYKNAPP} disabled:opacity-60 ${
              topSpots ? 'bg-forest-800 text-white hover:bg-forest-700' : 'bg-white/95 text-gray-800 hover:bg-white'
            }`}
          >
            {topLoading ? t('searching') : topSpots ? t('hideSpots') : t('promisingSpotsButton')}
          </button>
          {/* GPX-knappen sto her, som femte knapp. Kolonnen rommer to knapper
              i bredden på en telefon, så med lovende områder oppe ble det tre
              rader oppå kartet — akkurat når brukeren vil se områdene. Den
              ligger nå i «Mer», med hele navnet sitt. */}
          <button
            type="button"
            onClick={() => {
              setToolsOpen((open) => !open);
              setOfflineOpen(false);
              setOccFiltersOpen(false);
            }}
            aria-expanded={toolsOpen}
            aria-controls="map-more-tools"
            className={`inline-flex items-center gap-1 ${VERKTOYKNAPP} ${
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
          <div id="map-more-tools" className="min-h-0 w-full max-w-xs overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white/95 p-2 shadow-xl backdrop-blur">
            {/* mb-2, ikke mb-1: krysset er 44 px og når 8 px under raden sin.
                Med 4 px ville det ligget over den øverste menyraden. */}
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-xs font-semibold text-gray-900">{t('moreToolsHeading')}</p>
              <button
                type="button"
                onClick={() => setToolsOpen(false)}
                aria-label={t('closeTools')}
                className={LUKKEKNAPP_KLASSER}
              >
                <X className="h-4 w-4" aria-hidden />
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
                  className={`${MENYRAD} disabled:opacity-60`}
                >
                  {speciesLoading ? t('loading') : speciesSpots ? `📸 ${t('hidePhotos')}` : t('photosButton')}
                </button>
              ) : (
                <Link href="/pricing" className="block rounded-lg px-2 py-3.5 text-xs font-medium text-forest-900 hover:bg-gray-100">
                    ⭐ {kanFaaProve ? <ProveLofteTekst plan="premium" med={t('premiumTools')} utenProve={t('premiumToolsUtenProve')} /> : t('premiumToolsUtenProve')}
                  </Link>
              )}
              <button
                type="button"
                onClick={() => {
                  setToolsOpen(false);
                  setOfflineOpen(true);
                }}
                className={MENYRAD}
              >
                ⬇️ {t('offlineMap')}
              </button>
              {/* Bare når det finnes lovende områder å ta med. Lå før som egen
                  knapp i verktøyraden — se kommentaren der. */}
              {topSpots?.length && !topLoading ? (
                <button
                  type="button"
                  onClick={() => {
                    setToolsOpen(false);
                    eksporterTopSpotsGpx();
                  }}
                  aria-label={t('gpxTopSpotsLabel')}
                  className={MENYRAD}
                >
                  🧭 {t('gpxTopSpotsHeading')}
                </button>
              ) : null}
              {FLAGS.tripMode && !tripActive ? (
                <button
                  type="button"
                  onClick={() => {
                    setToolsOpen(false);
                    startTrip();
                  }}
                  className={MENYRAD}
                >
                  🎒 {t('trip')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {gpxTekst ? <GpxKopierModal tittel={t('gpxTopSpotsHeading')} gpx={gpxTekst} onClose={() => setGpxTekst(null)} /> : null}
        {visProvetilbud ? (
          <ProvGratisArk utloser={visProvetilbud} onIkkeNaa={() => setVisProvetilbud(null)} onStart={() => setVisProvetilbud(null)} />
        ) : null}
        {/* Synlig også i appen — prissiden selger via App Store der. Bak
            NonNativeOnly så ingen app-bruker dette (null prøveperioder, 9. sep 2026).
            Gratisuka loves bare når butikken har sagt den finnes (ProveLofteTekst),
            ellers motsier knappen arket rett over. */}
        {topAccess === 'free_limited' && topSpots ? (
          <Link
            href="/pricing"
            className={`relative flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-2.5 text-xs font-semibold text-forest-900 shadow-lg hover:bg-amber-500 ${TREFF_44}`}
          >
            🔒 {kanFaaProve ? <ProveLofteTekst med={t('seeAll12Premium')} utenProve={t('seeAll12PremiumUtenProve')} /> : t('seeAll12PremiumUtenProve')}
          </Link>
        ) : null}
        {FLAGS.tripMode && tripActive ? (
          <div className="flex items-center gap-2 rounded-full bg-amber-700 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
            <span>🎒 {t('tripFindsCount', { count: tripFinds.length })}</span>
            {/* Mørkere flate, ikke lysere: hvit tekst på amber-700 med 20 %
                hvitt over var 3,5:1. Med 20 % svart er den 7:1. */}
            <button
              type="button"
              onClick={endTrip}
              className={`relative rounded-full bg-black/20 px-2.5 py-1 font-semibold hover:bg-black/30 ${TREFF_44}`}
            >
              {t('endTrip')}
            </button>
          </div>
        ) : null}
        {/* Funnfiltrene lå før som tre ALLTID synlige rader (spiselighet,
            sesong, år) pluss et avkortingsbanner — sammen med søk og knapper
            dekket de en tredjedel av kartet på mobil. Nå bor de i et panel bak
            trakt-knappen: kartet er helten, filtrene er ett trykk unna. */}
        {showOccurrences && occFiltersOpen ? (
          <div id="map-occ-filters" className="min-h-0 w-full max-w-xs overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white/95 p-2 shadow-xl backdrop-blur">
            {/* Ingen px-1 på radene her (som menyen over har): de tre
                årsvalgene trenger 204 px, og med 4 px innrykk på hver side var
                det 203 igjen — den siste falt ned på en egen linje. */}
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-900">{t('occFiltersHeading')}</p>
              <button
                type="button"
                onClick={() => setOccFiltersOpen(false)}
                aria-label={t('closeOccFilters')}
                className={LUKKEKNAPP_KLASSER}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {/* Antallet (og «minst»-forbeholdet fra hentetaket) leses her i ro
                i stedet for å blåse opp knappen eller legge et eget banner
                over kartet. */}
            <p className="pb-1 text-[11px] text-gray-600">
              {occTruncated
                ? t('findingsTruncated', { count: OCCURRENCE_FETCH_LIMIT })
                : occCount
                  ? t('occCountShown', { count: occCount })
                  : null}
            </p>
            <div className="flex flex-wrap items-center gap-x-1 gap-y-2 pb-2">
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
                  className={`${FILTERVALG} ${
                    occEdibility === val ? 'bg-forest-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="pb-2">
              <button
                type="button"
                onClick={toggleOccSeason}
                className={`${FILTERVALG} ${
                  occSeason ? 'bg-amber-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {occSeason ? t('onlyInSeasonNow') : t('showAllTimes')}
              </button>
            </div>
            {/* Årsfilteret: ~72 % av punktene er fra før 2021, og gamle
                herbariebelegg rendret som ferske prikker skjuler datasettets
                sterkeste signal — datoene. */}
            <div className="flex flex-wrap items-center gap-x-1 gap-y-2 pb-1">
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
                  className={`${FILTERVALG} ${
                    occYear === val ? 'bg-forest-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* The prediction verdict + "hvorfor" + source credit now live in the
          consolidated HotspotPanel below — shown for every query, not just when
          a species is selected. */}

      {/* top-36: under søkefeltet og de to radene i verktøyraden, som nå er
          136 px høye til sammen (var 110, og panelet sto på top-28). */}
      {offlineOpen ? (
      <div className="absolute left-3 right-3 top-36 z-[1050] max-h-[calc(100%-10rem)] overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:left-auto sm:w-72">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900">{t('offlineMap')}</p>
          <div className="flex items-center gap-2">
            {billing.isLoading ? <span className="text-[11px] text-gray-500">{t('checkingPlan')}</span> : null}
            <button
              type="button"
              onClick={() => setOfflineOpen(false)}
              aria-label={t('hideOfflineMap')}
              className={LUKKEKNAPP_KLASSER}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {showOfflineUpsell ? (
          <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-2">
            <p className="text-xs text-amber-800">{t('offlineSaveRequiresPremium')}</p>
            <Link href="/pricing" className={`relative inline-block text-xs font-medium text-amber-900 underline ${TREFF_44}`}>
              {kanFaaProve ? <ProveLofteTekst med={t('upgradePlan')} utenProve={t('upgradePlanUtenProve')} /> : t('upgradePlanUtenProve')}
            </Link>
          </div>
        ) : null}

        <label htmlFor={offlineNameId} className="mt-2 block text-xs font-medium text-gray-700">
          {t('areaName')}
          <input
            id={offlineNameId}
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
          className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-1 rounded-lg bg-forest-800 px-2 py-2 text-xs font-medium text-white hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {offlineBusy ? t('saving') : t('saveMapArea')}
        </button>

        {offlineStatus ? <p className="mt-2 text-[11px] text-gray-700">{offlineStatus}</p> : null}

        <div className="mt-2 max-h-52 space-y-1 overflow-auto">
          {offlineAreas.map((area) => (
            <div key={area.id} className="rounded-lg border border-gray-200 bg-white p-2">
              <p className="truncate text-xs font-medium text-gray-900">{area.name}</p>
              <p className="text-[11px] text-gray-600">
                {t('tilesZoom', { tiles: area.cachedTiles, zoom: area.zoom })}
              </p>
              {/* «Slett» sto 4 px fra «Gå til», begge 26 px høye — og sletting
                  kan ikke gjøres om uten dekning. Større flater, mer luft, og
                  et spørsmål før kartet faktisk slettes. */}
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => focusSavedArea(area)}
                  className={`${PANELKNAPP} border-gray-300 text-gray-800 hover:bg-gray-50`}
                >
                  <Navigation className="h-3 w-3" />
                  {t('goTo')}
                </button>
                <ToTrinnsSletting
                  etikett={t('delete')}
                  sporsmal={t('deleteAreaConfirm', { name: area.name })}
                  bekreft={t('deleteAreaConfirmYes')}
                  avbryt={t('confirmCancel')}
                  onBekreft={() => deleteSavedArea(area.id)}
                  knappKlasser={`${PANELKNAPP} border-red-200 text-red-700 hover:bg-red-50`}
                />
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
          <div className="mt-1">
            <ToTrinnsSletting
              etikett={t('clearTileCache')}
              sporsmal={t('clearTileCacheConfirm')}
              bekreft={t('clearTileCacheConfirmYes')}
              avbryt={t('confirmCancel')}
              onBekreft={clearTileCache}
              knappKlasser={`${PANELKNAPP} border-gray-300 font-medium text-gray-800 hover:bg-gray-50`}
            />
          </div>
        </div>

        {/* /offline er den ene siden som kan åpnes uten dekning (precachet av
            public/sw.js). Lenken ligger her for at brukeren skal få sett hva
            som faktisk blir med ut i skogen — MENS det ennå er dekning. */}
        <a
          href="/offline"
          className={`mt-2 ${PANELKNAPP} border-gray-300 font-medium text-gray-800 hover:bg-gray-50`}
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
          const map = mapRef.current;
          const senter = map?.getCenter();
          setAddSheetKart(
            map && senter
              ? {
                  senter: { lat: senter.lat, lng: senter.lng },
                  flyttet: kartErFlyttet(
                    { lat: senter.lat, lng: senter.lng },
                    autoSenterRef.current,
                    flyttetoleranseMeter(senter.lat, map.getZoom())
                  )
                }
              : null
          );
          setShowAddSheet(true);
        }}
        className="absolute bottom-4 right-4 z-[1000] h-14 w-14 rounded-full bg-forest-800 text-3xl text-white shadow-xl transition-colors hover:bg-forest-700"
        aria-label={t('addFinding')}
      >
        +
      </button>

      {/* En ekte dialog (rolle, navn, Escape, fokus inn og tilbake) — se MapIntro. */}
      {showIntro ? <MapIntro onLukk={dismissIntro} /> : null}

      {showAddSheet ? (
        <AddFindingSheet
          kartsenter={addSheetKart?.senter ?? null}
          kartFlyttet={addSheetKart?.flyttet ?? false}
          onFerskPosisjon={(posisjon) => {
            sisteGpsRef.current = { lat: posisjon.lat, lng: posisjon.lng };
          }}
          initialSpeciesId={filters.speciesId}
          initialSpeciesName={selectedSpeciesName}
          onClose={() => setShowAddSheet(false)}
          onSaved={(speciesName, sharingMode) => {
            setShowAddSheet(false);
            if (sharingMode === 'private' && !filters.onlyMine) {
              // Et privat funn er usynlig i standardlaget (public_findings
              // ekskluderer private) — slå på «Kun mine funn» så brukeren SER
              // det de nettopp lagret. Filterendringen trigger loadFindings
              // via useEffect-en som avhenger av filters. setFilters setter
              // samtidig perioden til «alle» (nextMapFilters), så funnet synes
              // også når det er lagt inn i etterkant med en eldre dato.
              setFilters((f) => ({ ...f, onlyMine: true }));
            } else {
              void loadFindings();
            }
            if (tripActiveRef.current) addTripFind(speciesName);
          }}
        />
      ) : null}

      <HotspotPanel
        speciesId={filters.speciesId}
        kanFaaProve={kanFaaProve}
        data={panelData}
        explanations={explanationLines}
        isLoading={(prediction.isLoading || prediction.isFetching) && tileHotspots.length === 0}
        error={prediction.isError && tileHotspots.length === 0}
      />

    </div>
  );
}
