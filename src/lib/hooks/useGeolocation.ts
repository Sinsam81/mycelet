'use client';

import { useEffect, useState } from 'react';

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  loading: boolean;
  error: string | null;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({ latitude: null, longitude: null, loading: false, error: 'Geolocation støttes ikke i nettleseren.' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          loading: false,
          error: null
        });
      },
      (error) => {
        setState({
          latitude: null,
          longitude: null,
          loading: false,
          error: error.message
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 120_000
      }
    );
  }, []);

  return state;
}
