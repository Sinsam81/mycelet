import { useEffect, useRef, type RefObject } from 'react';

/**
 * Sann så lenge komponenten står på skjermen. For asynkrone handlinger som
 * skal navigere eller vise noe når de er ferdige: har brukeren gått videre i
 * mellomtiden, skal de ikke dra brukeren tilbake.
 *
 * Settes i effekten (ikke bare i useRef-startverdien) så React StrictMode sin
 * monter–avmonter–monter i utvikling ender på `true`.
 */
export function useErMontert(): RefObject<boolean> {
  const montert = useRef(false);
  useEffect(() => {
    montert.current = true;
    return () => {
      montert.current = false;
    };
  }, []);
  return montert;
}
