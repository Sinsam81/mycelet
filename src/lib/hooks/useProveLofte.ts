'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isNativePlatform } from '@/lib/native/platform';
import {
  PROVE_LOFTE_INGEN,
  PROVE_LOFTE_UKJENT,
  PROVE_LOFTE_WEB,
  lofteFraTilbud,
  type ProveLofte
} from '@/lib/billing/prove-lofte';

export type { ProveLofte } from '@/lib/billing/prove-lofte';

/**
 * Henter butikkens svar på om gratisuka finnes (typen og valget av tilbud
 * ligger i src/lib/billing/prove-lofte.ts — rent og testet).
 *
 * Svaret huskes for økten når butikken faktisk svarte; feil og tomme svar
 * huskes ikke, så neste visning prøver igjen.
 */
let husket: Promise<ProveLofte> | null = null;

/** Henter (og husker) svaret. Kall gjerne tidlig, så arket har det når det vises. */
export function hentProveLofte(): Promise<ProveLofte> {
  if (!isNativePlatform()) return Promise.resolve(PROVE_LOFTE_WEB);
  if (husket) return husket;
  const forsok = (async (): Promise<ProveLofte> => {
    try {
      const { data } = await createClient().auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return PROVE_LOFTE_INGEN;
      const { configurePurchases, getIapOffers } = await import('@/lib/native/purchases');
      if (!(await configurePurchases(userId))) return PROVE_LOFTE_INGEN;
      return lofteFraTilbud(await getIapOffers());
    } catch {
      return PROVE_LOFTE_INGEN;
    }
  })();
  husket = forsok;
  void forsok.then((svar) => {
    // Bare et ekte butikksvar er verdt å huske.
    if (svar === PROVE_LOFTE_INGEN && husket === forsok) husket = null;
  });
  return forsok;
}

/** Til tester: glem det huskede svaret. */
export function glemProveLofte() {
  husket = null;
}

export function useProveLofte(): ProveLofte {
  // Nett er kjent synkront, så arket aldri blinker fra «uten løfte» til «7 dager gratis».
  const [lofte, setLofte] = useState<ProveLofte>(() => (isNativePlatform() ? PROVE_LOFTE_UKJENT : PROVE_LOFTE_WEB));
  useEffect(() => {
    let avbrutt = false;
    hentProveLofte().then((svar) => {
      if (!avbrutt) setLofte(svar);
    });
    return () => {
      avbrutt = true;
    };
  }, []);
  return lofte;
}
