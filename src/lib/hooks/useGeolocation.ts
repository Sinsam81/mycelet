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

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    let cancelled = false;

    const succeed = (latitude: number, longitude: number) => {
      if (!cancelled) setState({ latitude, longitude, loading: false, error: null });
    };
    const fail = (error: string) => {
      if (!cancelled) setState({ latitude: null, longitude: null, loading: false, error });
    };

    async function locate() {
      // iOS WKWebView does not implement navigator.geolocation, so the native
      // shell must go through the Capacitor Geolocation plugin instead.
      if (isNativePlatform()) {
        try {
          const { Geolocation } = await import('@capacitor/geolocation');
          const permission = await Geolocation.requestPermissions();
          if (permission.location === 'denied') {
            fail('Posisjonstilgang er avslått. Slå den på i Innstillinger for å bruke kartet.');
            return;
          }
          const position = await Geolocation.getCurrentPosition(POSITION_OPTIONS);
          succeed(position.coords.latitude, position.coords.longitude);
        } catch (err) {
          fail(err instanceof Error ? err.message : 'Kunne ikke hente posisjon.');
        }
        return;
      }

      if (!navigator.geolocation) {
        fail('Geolocation støttes ikke i nettleseren.');
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => succeed(position.coords.latitude, position.coords.longitude),
        (error) => fail(error.message),
        POSITION_OPTIONS
      );
    }

    void locate();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
