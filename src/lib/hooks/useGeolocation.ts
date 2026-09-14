'use client';

import { useEffect, useState } from 'react';
import { isNativePlatform } from '@/lib/native/platform';

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  loading: boolean;
  error: string | null;
}

const POSITION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10_000,
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

/** Selve oppslaget, uten tillatelsesspørsmål — kalleren har avklart tillatelsen først. */
async function readCurrentPosition(options: typeof POSITION_OPTIONS): Promise<Fix> {
  if (isNativePlatform()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    const position = await Geolocation.getCurrentPosition(options);
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  }

  if (!navigator.geolocation) {
    throw new Error('Geolocation støttes ikke i nettleseren.');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
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
    const { Geolocation } = await import('@capacitor/geolocation');
    const permission = await Geolocation.requestPermissions();
    if (permission.location === 'denied') {
      throw new Error('Posisjonstilgang er avslått. Slå den på i Innstillinger for å bruke kartet.');
    }
  }
  return readCurrentPosition(POSITION_OPTIONS);
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
      const { Geolocation } = await import('@capacitor/geolocation');
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
    return await readCurrentPosition(SILENT_POSITION_OPTIONS);
  } catch {
    return null;
  }
}

export interface AccurateFix {
  latitude: number;
  longitude: number;
  /** Reported horizontal accuracy in meters (smaller is better). */
  accuracy: number;
}

interface WatchRefineOptions {
  /** Stop early once a fix is at least this accurate (meters). Default 25. */
  targetAccuracyM?: number;
  /** Overall ceiling before resolving with the best fix so far (ms). Default 12000. */
  timeoutMs?: number;
  /** Called for every intermediate fix so the UI can live-recenter + shrink the circle. */
  onUpdate?: (fix: AccurateFix) => void;
  /** Abort the watch early (e.g. on unmount or a fresh locate tap). */
  signal?: AbortSignal;
}

/**
 * Watch-and-refine current position — much better at "finding where you are"
 * than a single getCurrentPosition: it opens a position watch (web OR Capacitor
 * native), keeps the BEST (lowest-accuracy-meters) fix as the GPS sharpens, and
 * resolves early once accuracy <= target or when the timeout fires (with the best
 * fix seen). Rejects only if no fix arrived (or it was aborted) before resolving.
 * Always tears the watch down (clearWatch). `maximumAge: 0` → always a fresh fix,
 * never the stale cache `getCurrentPositionOnce` accepts.
 *
 * Capacitor API verified against @capacitor/geolocation@8.2.0:
 *   watchPosition(options, (position: Position | null, err?) => void): Promise<string>
 *   clearWatch({ id }): Promise<void>
 */
export async function watchPositionUntilAccurate(opts: WatchRefineOptions = {}): Promise<AccurateFix> {
  const { targetAccuracyM = 25, timeoutMs = 12_000, onUpdate, signal } = opts;
  const options = { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 };

  if (signal?.aborted) throw new Error('Posisjonssøk avbrutt.');

  if (isNativePlatform()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    const permission = await Geolocation.requestPermissions();
    if (permission.location === 'denied') {
      throw new Error('Posisjonstilgang er avslått. Slå den på i Innstillinger for å bruke kartet.');
    }
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

      const consider = (lat: number, lng: number, accuracy: number) => {
        const fix: AccurateFix = { latitude: lat, longitude: lng, accuracy };
        if (!best || accuracy < best.accuracy) best = fix;
        onUpdate?.(fix);
        if (accuracy <= targetAccuracyM) finish(() => resolve(fix));
      };

      Geolocation.watchPosition(options, (position, err) => {
        if (settled) return;
        if (err || !position) return; // transient watch error — keep waiting for the timeout
        consider(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
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

    const consider = (lat: number, lng: number, accuracy: number) => {
      const fix: AccurateFix = { latitude: lat, longitude: lng, accuracy };
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
        consider(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
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
