'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isNativePlatform } from '@/lib/native/platform';
import { STRIPE_PROVEDAGER } from '@/lib/billing/plans';

/**
 * Finnes gratisuka for denne brukeren — og hvor lang er den?
 *
 * På nett er svaret kjent med én gang: Stripe gir STRIPE_PROVEDAGER dager
 * til førstegangskjøpere (checkout-ruta), og arket vises bare til dem
 * (kanFaaProveperiode). I appen er det App Store som avgjør, per produkt og
 * per Apple-ID, så svaret må hentes fra RevenueCat (IapOffer.harProve).
 *
 * Til det er hentet, sier arket ingenting om en gratis uke. Et ark som lover
 * «7 dager gratis» til en som blir belastet på dag én, er verre enn et ark
 * uten løftet — det er en refusjon og en anmeldelse i vente.
 *
 * Svaret huskes for økten når butikken faktisk svarte; feil og tomme svar
 * huskes ikke, så neste visning prøver igjen.
 */
export type ProveLofte =
  | { kjent: false }
  | {
      kjent: true;
      harProve: boolean;
      proveDager: number | null;
      /** Butikkens formaterte månedspris («kr 79,00»), når vi har den. */
      pris: string | null;
    };

const WEB: ProveLofte = { kjent: true, harProve: true, proveDager: STRIPE_PROVEDAGER, pris: null };
const UKJENT: ProveLofte = { kjent: false };
const INGEN: ProveLofte = { kjent: true, harProve: false, proveDager: null, pris: null };

let husket: Promise<ProveLofte> | null = null;

/** Henter (og husker) svaret. Kall gjerne tidlig, så arket har det når det vises. */
export function hentProveLofte(): Promise<ProveLofte> {
  if (!isNativePlatform()) return Promise.resolve(WEB);
  if (husket) return husket;
  const forsok = (async (): Promise<ProveLofte> => {
    try {
      const { data } = await createClient().auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return INGEN;
      const { configurePurchases, getIapOffers } = await import('@/lib/native/purchases');
      if (!(await configurePurchases(userId))) return INGEN;
      const offers = await getIapOffers();
      // Arket selger Premium (månedlig); finnes ikke den pakken, gjelder det
      // tilbudet som faktisk har en gratisuke, og ellers det første.
      const valgt = offers.find((o) => o.plan === 'premium') ?? offers.find((o) => o.harProve) ?? offers[0];
      if (!valgt) return INGEN;
      return { kjent: true, harProve: valgt.harProve, proveDager: valgt.proveDager, pris: valgt.priceString };
    } catch {
      return INGEN;
    }
  })();
  husket = forsok;
  void forsok.then((svar) => {
    // Bare et ekte butikksvar er verdt å huske.
    if (svar === INGEN && husket === forsok) husket = null;
  });
  return forsok;
}

/** Til tester: glem det huskede svaret. */
export function glemProveLofte() {
  husket = null;
}

export function useProveLofte(): ProveLofte {
  // Nett er kjent synkront, så arket aldri blinker fra «uten løfte» til «7 dager gratis».
  const [lofte, setLofte] = useState<ProveLofte>(() => (isNativePlatform() ? UKJENT : WEB));
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
