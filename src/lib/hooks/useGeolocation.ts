'use client';

import { useEffect, useState } from 'react';
import { isNativePlatform } from '@/lib/native/platform';

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  loading: boolean;
  error: string | null;
}

/** Pluginens og nettleserens egen timeout for et vanlig oppslag. */
export const POSISJON_TIMEOUT_MS = 10_000;

const POSITION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: POSISJON_TIMEOUT_MS,
  maximumAge: 120_000
};

/**
 * Grov, rask og stille — til forsidekortet og kalenderen. Prognosen der er
 * regional, så ~1 km holder, og en ti minutter gammel posisjon er like god som
 * en fersk. Fire sekunder: kortet skal ikke stå og vente på en kald GPS.
 */
const SILENT_POSITION_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 4_000,
  maximumAge: 600_000
};

export interface Fix {
  latitude: number;
  longitude: number;
}

/**
 * En posisjon med tiden plattformen sier den ble målt. Bare getOptionalPosition
 * gir den ut (identifiseringen trenger den, se medPosisjonstid i
 * src/lib/identifications/okt-resultat.ts); de andre engangsoppslagene gir
 * bare koordinatene, som før.
 */
export interface MaaltFix extends Fix {
  /**
   * Når målingen ble gjort, i millisekunder siden epoken — samme enhet på alle
   * plattformer: GeolocationPosition.timestamp i nettleseren (EpochTimeStamp),
   * og `timestamp` fra @capacitor/geolocation 8.2.0 i skallet, som iOS fyller
   * fra CLLocation.timestamp (millisecondsSinceUnixEpoch) og Android fra
   * Location.time. Mangler når plattformen ikke oppga et brukbart tall.
   *
   * I iOS-skallet ser pluginen bort fra maximumAge, og CoreLocation kan svare
   * med sin sist kjente posisjon — da er dette langt eldre enn kallet. Det er
   * grunnen til at feltet finnes.
   */
  timestamp?: number;
}

/** Plattformens tidsstempel, når det er et brukbart tall. */
function brukbarMaaletid(timestamp: unknown): number | undefined {
  return typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
}

function somMaaltFix(coords: { latitude: number; longitude: number }, timestamp: unknown): MaaltFix {
  const fix: MaaltFix = { latitude: coords.latitude, longitude: coords.longitude };
  const maaletid = brukbarMaaletid(timestamp);
  if (maaletid !== undefined) fix.timestamp = maaletid;
  return fix;
}

/** Bare koordinatene — det getCurrentPositionOnce og getCurrentPositionIfGranted alltid har gitt. */
function koordinater({ latitude, longitude }: Fix): Fix {
  return { latitude, longitude };
}

/**
 * Pluginen lastes én gang og gjenbrukes — men det er MODULEN som mellomlagres,
 * aldri selve tillegget i et løfte.
 *
 * ⚠️ Et Capacitor-tillegg er en Proxy som svarer på ALLE egenskapsnavn, også
 * `then` (@capacitor/core, registerPlugin). Løses et løfte med tillegget —
 * `.then((m) => m.Geolocation)`, eller `return Geolocation` fra en async
 * funksjon — tror JavaScript at tillegget selv er et løfte og kaller
 * `Geolocation.then(resolve, reject)`. Det blir et kall til en native metode
 * som ikke finnes: «"Geolocation.then()" is not implemented on ios» som
 * ubehandlet feil, og løftet blir ALDRI avgjort. 17. okt 2026 gjorde det hvert
 * posisjonsoppslag i appen hengende i en time (PR #284, rettet i neste PR).
 * Samme felle som loadPlugin i src/lib/native/purchases.ts (PR #157).
 *
 * Derfor: kallerne destrukturerer `{ Geolocation }` fra modulen etter await —
 * et modulobjekt har ingen `then` — og ingen funksjon her returnerer tillegget.
 * Lastingen har en frist, så heller ikke en treg nettforbindelse kan holde et
 * oppslag for alltid.
 */
/** Lasting av GPS-modulen (en JS-del) — over dette er noe galt med nettet eller bygget. */
const MODUL_FRIST_MS = 10_000;

let geolocationModul: Promise<typeof import('@capacitor/geolocation')> | null = null;
function hentGeolocationModul(): Promise<typeof import('@capacitor/geolocation')> {
  geolocationModul ??= import('@capacitor/geolocation').catch((feil) => {
    // En mislykket lasting (f.eks. en deploy midt i økta) skal prøves igjen
    // neste gang, ikke huskes som en permanent feil.
    geolocationModul = null;
    throw feil;
  });
  return medFrist(geolocationModul, MODUL_FRIST_MS);
}

/** Et posisjonsoppslag fikk ikke svar innen fristen vår. */
export class PosisjonTidsavbrudd extends Error {
  constructor(fristMs: number) {
    super(`Posisjonen kom ikke innen ${fristMs} ms.`);
    this.name = 'PosisjonTidsavbrudd';
  }
}

/** Avvis med PosisjonTidsavbrudd hvis løftet ikke er avgjort innen fristen. */
export function medFrist<T>(lofte: Promise<T>, fristMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PosisjonTidsavbrudd(fristMs)), fristMs);
    lofte.then(
      (verdi) => {
        clearTimeout(timer);
        resolve(verdi);
      },
      (feil) => {
        clearTimeout(timer);
        reject(feil);
      }
    );
  });
}

/**
 * Margin oppå pluginens egen timeout: kommer pluginens svar (eller dens egen
 * timeout-feil), vinner det. Vår frist slår bare til når pluginen tier.
 */
export const NATIV_FRIST_MARGIN_MS = 2_000;

/** Watch-ID som ikke finnes — se nullstillNativPosisjon. */
export const NULLSTILL_WATCH_ID = 'mycelet-nullstill-posisjon';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HVORFOR APPENS POSISJONSOPPSLAG HAR EN EGEN FRIST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @capacitor/geolocation 8.2.0 (i alle App Store-bygg til og med 1.0.2 / 5)
 * kobler seg til posisjonsstrømmen ÉN gang. Første gang CoreLocation svarer med
 * en feil (innendørs, svak dekning, appen i bakgrunnen), bytter pluginens
 * `.catch` strømmen ut med en tom en — abonnementet er dødt, men flagget som
 * sier «koblet til» står fortsatt. Hvert senere getCurrentPosition() ber om en
 * posisjon, får den, men svaret havner i den døde strømmen, og pluginens egen
 * timeout er allerede avbrutt. Løftet blir aldri avgjort: ingen posisjon, ingen
 * feil, til appen tvangslukkes. Rettet oppstrøms i 8.2.1 (6. aug 2026,
 * RMET-5383: «A failure terminates this subscription; re-bind or later
 * callbacks are dropped») — package.json tillater 8.2.1 (^8.2.0), men
 * låsefila og alle bygg står på 8.2.0. Neste native bygg bør oppgradere; denne
 * omveien er sikkerhetsnettet for byggene som alt er ute.
 *
 * Følgen her: «Identifiser» ventet på posisjonen før bildene ble sendt, og
 * ingenting skjedde — ingen spinner, ingen feil, ingen rad, ingen logg. Det
 * rammet den som bruker appen mest (17. okt 2026: eieren hadde ett vellykket
 * forsøk siden 29. sep, mens 13 andre iOS-brukere fikk svar). Lagring av funn,
 * «Bruk min posisjon» på forsiden og i kalenderen, og kartets sentrering hang
 * på samme måte.
 *
 * Derfor: en JS-frist rundt hvert native oppslag, og når oppslaget feiler eller
 * fristen går ut, nullstilles pluginen med clearWatch på en watch-ID som ikke
 * finnes. Med ingen aktive watcher setter pluginens clearWatch flagget tilbake
 * og river den døde strømmen (GeolocationPlugin.swift, clearWatch), så neste
 * oppslag kobler seg til på nytt. Går en watch («Min posisjon» på kartet), gjør
 * kallet ingenting.
 *
 * ── NULLSTILLINGEN ER SAMORDNET ─────────────────────────────────────────────
 *
 * clearWatch ser bare på aktive watcher, ikke på ventende engangsoppslag, og
 * river strømmen for alle. Nullstilte vi midt i et annet oppslag — forsidekortets
 * stille oppslag går ut på fristen mens brukeren nettopp har trykket «Bruk min
 * posisjon» — ville det andre oppslagets posisjon gått tapt (funnet av Codex,
 * 17. okt 2026). Derfor: et mislykket oppslag MERKER at strømmen kan være død;
 * selve nullstillingen kjøres først når ingen oppslag venter, og nye oppslag
 * venter til en pågående nullstilling er ferdig. Et vellykket oppslag fjerner
 * merket — da lever strømmen.
 */
const nativTilstand = {
  /** Native engangsoppslag som venter på svar akkurat nå. */
  pagaende: 0,
  /** Et oppslag har feilet eller gått ut på tid siden sist strømmen leverte. */
  trengerNullstilling: false,
  nullstilling: null as Promise<void> | null
};

type NativPlugin = typeof import('@capacitor/geolocation').Geolocation;

function startNullstilling(Geolocation: NativPlugin): Promise<void> {
  nativTilstand.nullstilling ??= (async () => {
    try {
      await medFrist(Geolocation.clearWatch({ id: NULLSTILL_WATCH_ID }), NATIV_FRIST_MARGIN_MS);
      nativTilstand.trengerNullstilling = false;
    } catch {
      // Beste forsøk: merket står, og neste oppslag prøver igjen.
    } finally {
      nativTilstand.nullstilling = null;
    }
  })();
  return nativTilstand.nullstilling;
}

async function nativtOppslag(Geolocation: NativPlugin, options: typeof POSITION_OPTIONS) {
  // Står merket og ingen andre venter: nullstill først. Pågår en nullstilling
  // alt, gir startNullstilling den samme, så dette oppslaget venter på den.
  if (nativTilstand.trengerNullstilling && nativTilstand.pagaende === 0) await startNullstilling(Geolocation);
  nativTilstand.pagaende += 1;
  try {
    const position = await medFrist(Geolocation.getCurrentPosition(options), options.timeout + NATIV_FRIST_MARGIN_MS);
    nativTilstand.trengerNullstilling = false;
    return position;
  } catch (feil) {
    nativTilstand.trengerNullstilling = true;
    throw feil;
  } finally {
    nativTilstand.pagaende -= 1;
    if (nativTilstand.trengerNullstilling && nativTilstand.pagaende === 0) void startNullstilling(Geolocation);
  }
}

/** Selve oppslaget, uten tillatelsesspørsmål — kalleren har avklart tillatelsen først. */
async function readCurrentPosition(options: typeof POSITION_OPTIONS): Promise<MaaltFix> {
  if (isNativePlatform()) {
    const { Geolocation } = await hentGeolocationModul();
    // Frist og samordnet nullstilling — se over.
    const position = await nativtOppslag(Geolocation, options);
    return somMaaltFix(position.coords, position.timestamp);
  }

  if (!navigator.geolocation) {
    throw new Error('Geolocation støttes ikke i nettleseren.');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(somMaaltFix(position.coords, position.timestamp)),
      (error) => reject(new Error(error.message)),
      options
    );
  });
}

/**
 * One-shot current position that works in BOTH the browser and the native
 * (Capacitor) shell. iOS WKWebView does not implement `navigator.geolocation`,
 * so the native shell must go through the Capacitor Geolocation plugin. Use this
 * everywhere instead of calling `navigator.geolocation` directly (which silently
 * does nothing in the iOS app).
 *
 * PROMPTS for permission when it has not been decided yet — right for the map
 * and for an explicit «Min posisjon» tap. Surfaces that must never prompt on
 * their own (the home card, the calendar) use `getCurrentPositionIfGranted`.
 */
export async function getCurrentPositionOnce(): Promise<Fix> {
  if (isNativePlatform()) {
    const { Geolocation } = await hentGeolocationModul();
    const permission = await Geolocation.requestPermissions();
    if (permission.location === 'denied') {
      throw new Error('Posisjonstilgang er avslått. Slå den på i Innstillinger for å bruke kartet.');
    }
  }
  return koordinater(await readCurrentPosition(POSITION_OPTIONS));
}

/** Hvor lenge et menneske kan bruke på en tillatelsesdialog før vi går videre uten. */
export const TILLATELSE_FRIST_MS = 60_000;

/**
 * Posisjon som HJELP, aldri som sperre — til identifiseringen. Gir aldri feil.
 *
 * Samme oppslag som getCurrentPositionOnce, med pluginens egen timeout: en
 * frisk, men treg GPS gir seg etter POSISJON_TIMEOUT_MS som før, og
 * koordinatene brukes både til artsvektingen og der funnet lagres, så de er
 * verdt de sekundene. Bare når pluginen TIER forbi sin egen timeout pluss
 * margin, slår vår frist til — da er `tidsavbrudd` sann, og det er nettopp
 * 8.2.0-hengen (se over), som skal synes i Sentry. På nett er
 * `tidsavbrudd` aldri sann: der finnes ikke den hengen.
 *
 * Tillatelsesdialogen (iOS eller nettleser) får TILLATELSE_FRIST_MS, så et
 * menneske rekker å lese den, men en dialog som aldri besvares (en lukket
 * dørhenger i Firefox) ikke kan holde knappen for alltid.
 *
 * Fixet bærer tiden plattformen sier det ble målt (`timestamp`, se MaaltFix).
 * Identifiseringen legger den i resultatet, så resultatsiden kan se at en
 * lagret iOS-posisjon er gammel i stedet for å tro at den er fra trykket.
 */
export async function getOptionalPosition(): Promise<{ fix: MaaltFix | null; tidsavbrudd: boolean }> {
  try {
    if (isNativePlatform()) {
      const { Geolocation } = await hentGeolocationModul();
      // En dialog som ikke besvares, er et menneske — ikke pluginen som tier.
      const permission = await medFrist(Geolocation.requestPermissions(), TILLATELSE_FRIST_MS).catch(() => null);
      if (!permission || permission.location === 'denied') return { fix: null, tidsavbrudd: false };
      return { fix: await readCurrentPosition(POSITION_OPTIONS), tidsavbrudd: false };
    }
    // Nettleserens timeout teller ikke tiden dialogen står åpen; taket gjør det.
    return { fix: await medFrist(readCurrentPosition(POSITION_OPTIONS), TILLATELSE_FRIST_MS), tidsavbrudd: false };
  } catch (feil) {
    return { fix: null, tidsavbrudd: isNativePlatform() && feil instanceof PosisjonTidsavbrudd };
  }
}

/** Finnes det en posisjonskilde å be om i det hele tatt? I skallet alltid (Capacitor), på nett bare med navigator.geolocation. */
export function isGeolocationAvailable(): boolean {
  return isNativePlatform() || (typeof navigator !== 'undefined' && !!navigator.geolocation);
}

/**
 * Er posisjonstilgang ALLEREDE gitt? Spør aldri. I skallet via Capacitors
 * checkPermissions (iOS: «while using»/«always» = granted); på nett via
 * Permissions API. Safari mangler den for geolocation og kaster — det teller
 * som «vet ikke», altså false, og da står den huskede posisjonen for tur.
 */
export async function hasGeolocationPermission(): Promise<boolean> {
  try {
    if (isNativePlatform()) {
      const { Geolocation } = await hentGeolocationModul();
      const status = await Geolocation.checkPermissions();
      return status.location === 'granted' || status.coarseLocation === 'granted';
    }
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return false;
    const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return perm.state === 'granted';
  } catch {
    return false;
  }
}

/**
 * Posisjon uten å spørre: null hvis tilgangen ikke alt er gitt, hvis oppslaget
 * feiler, eller hvis det tar mer enn fire sekunder. Grov nøyaktighet — den som
 * kaller, regner regionalt. Dette er stien forsidekortet og kalenderen bruker
 * ved hver åpning; de får aldri vise en tillatelsesdialog selv.
 */
export async function getCurrentPositionIfGranted(): Promise<Fix | null> {
  if (!(await hasGeolocationPermission())) return null;
  try {
    return koordinater(await readCurrentPosition(SILENT_POSITION_OPTIONS));
  } catch {
    return null;
  }
}

export interface AccurateFix {
  latitude: number;
  longitude: number;
  /** Reported horizontal accuracy in meters (smaller is better). */
  accuracy: number;
  /**
   * Når plattformen sier målingen ble gjort (ms siden epoke).
   *
   * Finnes fordi `maximumAge: 0` under IKKE holder i iOS-skallet: pluginen
   * leser bare enableHighAccuracy og timeout der, og CoreLocation leverer
   * gjerne sin sist kjente posisjon først — den kan være mange minutter
   * gammel og ha god nøyaktighet. Den som trenger «der jeg står NÅ» (lagring
   * av funn, «Finn meg»), må se på denne. Se src/lib/map/fersk-posisjon.ts.
   */
  timestamp?: number;
}

interface WatchRefineOptions {
  /** Stop early once a fix is at least this accurate (meters). Default 25. */
  targetAccuracyM?: number;
  /** Overall ceiling before resolving with the best fix so far (ms). Default 12000. */
  timeoutMs?: number;
  /** Called for every intermediate fix so the UI can live-recenter + shrink the circle. */
  onUpdate?: (fix: AccurateFix) => void;
  /**
   * Called once, when the watch itself starts — `timeoutMs` counts from here.
   * In the native shell that is AFTER the plugin has loaded and the permission
   * question is answered, and a person can take a long time over that dialog
   * (iOS asks again after «Allow Once»). A caller that keeps its own deadline
   * on the search must start it here, not when it calls.
   */
  onStart?: () => void;
  /**
   * Abort the search (e.g. on unmount or a fresh locate tap). Honoured in
   * every phase: an abort while the plugin loads or the permission dialog is
   * open rejects as soon as that step is over, and no watch is started.
   */
  signal?: AbortSignal;
}

/**
 * Watch-and-refine current position — much better at "finding where you are"
 * than a single getCurrentPosition: it opens a position watch (web OR Capacitor
 * native), keeps the BEST (lowest-accuracy-meters) fix as the GPS sharpens, and
 * resolves early once accuracy <= target or when the timeout fires (with the best
 * fix seen). Rejects only if no fix arrived (or it was aborted) before resolving.
 * Always tears the watch down (clearWatch). `maximumAge: 0` → a fresh fix in
 * the browser and on Android, never the stale cache `getCurrentPositionOnce`
 * accepts. ⚠️ NOT on iOS: the plugin ignores maximumAge there, so the first fix
 * can be CoreLocation's cached last-known position. Every fix therefore carries
 * its `timestamp`; callers that need «here and now» go through
 * `finnFerskPosisjon` (src/lib/map/fersk-posisjon.ts), which filters on it.
 *
 * Capacitor API verified against @capacitor/geolocation@8.2.0:
 *   watchPosition(options, (position: Position | null, err?) => void): Promise<string>
 *   clearWatch({ id }): Promise<void>
 */
export async function watchPositionUntilAccurate(opts: WatchRefineOptions = {}): Promise<AccurateFix> {
  const { targetAccuracyM = 25, timeoutMs = 12_000, onUpdate, onStart, signal } = opts;
  const options = { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 };

  if (signal?.aborted) throw new Error('Posisjonssøk avbrutt.');

  if (isNativePlatform()) {
    const { Geolocation } = await hentGeolocationModul();
    // Aborted while the module loaded: do not put a permission dialog in front
    // of someone who has already closed what asked for it.
    if (signal?.aborted) throw new Error('Posisjonssøk avbrutt.');
    const permission = await Geolocation.requestPermissions();
    // The abort listener is registered further down, with the watch. An abort
    // that fired during the awaits above dispatched its event to nobody —
    // `signal.aborted` at the top was the only check, so the watch started
    // anyway and ran to its timeout for a caller that was gone (and
    // `finnFerskPosisjon`, which had aborted, dropped every fix it delivered).
    if (signal?.aborted) throw new Error('Posisjonssøk avbrutt.');
    if (permission.location === 'denied') {
      throw new Error('Posisjonstilgang er avslått. Slå den på i Innstillinger for å bruke kartet.');
    }
    onStart?.();
    return new Promise<AccurateFix>((resolve, reject) => {
      // Declare ALL state up-front so an early callback can't hit a `let` in its
      // temporal dead zone (the bug the review caught).
      let settled = false;
      let best: AccurateFix | null = null;
      let watchId: string | null = null;
      let clearRequested = false; // teardown requested before the id promise resolved
      let timer: ReturnType<typeof setTimeout> | null = null;

      const stopWatch = () => {
        if (watchId != null) {
          void Geolocation.clearWatch({ id: watchId });
          watchId = null;
        } else {
          clearRequested = true;
        }
      };
      const finish = (run: () => void) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        stopWatch();
        run();
      };
      const onAbort = () => finish(() => reject(new Error('Posisjonssøk avbrutt.')));
      signal?.addEventListener('abort', onAbort);

      timer = setTimeout(
        () => finish(() => (best ? resolve(best) : reject(new Error('Fant ikke posisjonen din i tide.')))),
        timeoutMs
      );

      const consider = (lat: number, lng: number, accuracy: number, timestamp?: number) => {
        const fix: AccurateFix = { latitude: lat, longitude: lng, accuracy, timestamp };
        if (!best || accuracy < best.accuracy) best = fix;
        onUpdate?.(fix);
        if (accuracy <= targetAccuracyM) finish(() => resolve(fix));
      };

      Geolocation.watchPosition(options, (position, err) => {
        if (settled) return;
        if (err || !position) return; // transient watch error — keep waiting for the timeout
        consider(position.coords.latitude, position.coords.longitude, position.coords.accuracy, position.timestamp);
      })
        .then((id) => {
          watchId = id;
          if (clearRequested || settled) {
            void Geolocation.clearWatch({ id });
            watchId = null;
          }
        })
        .catch((e) => finish(() => reject(e instanceof Error ? e : new Error('Kunne ikke starte posisjonssporing.'))));
    });
  }

  if (!navigator.geolocation) throw new Error('Geolocation støttes ikke i nettleseren.');

  // No separate phase before the watch here: the browser asks for permission
  // as part of watchPosition itself.
  onStart?.();
  return new Promise<AccurateFix>((resolve, reject) => {
    // All state declared BEFORE starting the watch (TDZ-safe).
    let settled = false;
    let best: AccurateFix | null = null;
    let lastErr: GeolocationPositionError | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let watchId: number | null = null;

    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      run();
    };
    const onAbort = () => finish(() => reject(new Error('Posisjonssøk avbrutt.')));
    signal?.addEventListener('abort', onAbort);

    const consider = (lat: number, lng: number, accuracy: number, timestamp?: number) => {
      const fix: AccurateFix = { latitude: lat, longitude: lng, accuracy, timestamp };
      if (!best || accuracy < best.accuracy) best = fix;
      onUpdate?.(fix);
      if (accuracy <= targetAccuracyM) finish(() => resolve(fix));
    };

    timer = setTimeout(
      () => finish(() => (best ? resolve(best) : reject(new Error(lastErr?.message ?? 'Fant ikke posisjonen din i tide.')))),
      timeoutMs
    );

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (settled) return;
        consider(position.coords.latitude, position.coords.longitude, position.coords.accuracy, position.timestamp);
      },
      (error) => {
        lastErr = error;
      },
      options
    );
  });
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    let cancelled = false;

    getCurrentPositionOnce()
      .then(({ latitude, longitude }) => {
        if (!cancelled) setState({ latitude, longitude, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            latitude: null,
            longitude: null,
            loading: false,
            error: err instanceof Error ? err.message : 'Kunne ikke hente posisjon.'
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
