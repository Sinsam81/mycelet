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
  // `data-web-only` gjør jobben FØR React rekker det.
  //
  // useIsNative() må returnere false på første render — ellers spriker
  // hydreringen fra HTML-en serveren sendte. Følgen var at alt her inne faktisk
  // ble tegnet i iOS-skallet og først forsvant etter mount. På en treg
  // forbindelse betyr det at «Fortsett med Google» står synlig på
  // innloggingssiden i appen — en tredjepartspålogging uten Logg inn med Apple
  // ved siden av, altså retningslinje 4.8, tydelig nok til å havne på et
  // skjermbilde hos en anmelder.
  //
  // Skriptet øverst i <body> (src/app/layout.tsx) setter data-native på <html>
  // før noe males, og regelen i globals.css skjuler denne beholderen med en
  // gang. `display: contents` gjør at wrapperen ellers er usynlig for
  // oppsettet, så flex- og grid-rader ser ut som før på nett.
  return (
    <div data-web-only className="contents">
      {children}
    </div>
  );
}
