'use client';

import type { ReactNode } from 'react';
import { useIsNative } from '@/lib/hooks/useIsNative';

/**
 * Motstykket til NonNativeOnly: rendrer children BARE inne i det native
 * iOS/Android-skallet.
 *
 * Brukes der web og app har ulik sannhet, ikke bare ulikt utvalg — f.eks.
 * personvernsiden, som på web tilbyr et analysevalg og i App Store-bygget
 * skal si at det ikke finnes noe analyseverktøy å velge bort.
 */
export function NativeOnly({ children }: { children: ReactNode }) {
  const native = useIsNative();
  if (!native) return null;
  return <>{children}</>;
}
