'use client';

import { useEffect, useState } from 'react';
import { isNativePlatform } from '@/lib/native/platform';

// Returns false on the first render (matching SSR / static prerender) and flips
// to the real value after mount, so gating UI on native never causes a
// hydration mismatch.
export function useIsNative(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(isNativePlatform());
  }, []);
  return native;
}
