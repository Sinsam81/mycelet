'use client';

import type { ReactNode } from 'react';
import { useIsNative } from '@/lib/hooks/useIsNative';

/**
 * Renders children everywhere EXCEPT inside the native iOS/Android shell.
 * Used to hide web-only flows (Stripe purchases, Google login) that violate
 * App Store rules 3.1.1 (external payment) and 4.8 (Sign in with Apple) —
 * until in-app purchase + Sign in with Apple are added.
 */
export function NonNativeOnly({ children }: { children: ReactNode }) {
  const native = useIsNative();
  if (native) return null;
  return <>{children}</>;
}
