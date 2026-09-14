'use client';

import { useEffect, useState } from 'react';
import { readLocal, writeLocal } from '@/lib/utils/safe-storage';
import {
  PROVETILBUD_MIN_MELLOMROM_MS,
  PROVETILBUD_NOKKEL,
  PROVETILBUD_START_NOKKEL,
  registrerVisning,
  tolkProvetilbud
} from '@/lib/billing/provetilbud';
import {
  FORSIDEKORT_FRIST_MS,
  FORSIDEKORT_KLAR_EVENT,
  PROVETILBUD_PUSTEROM_MS,
  klarTilArk,
  nesteVenting,
  startVenting
} from '@/lib/billing/provetilbud-venting';
import { ONBOARDING_DONE_EVENT, ONBOARDING_STORAGE_KEY } from '@/components/onboarding/OnboardingIntro';
import { hentProveLofte } from '@/lib/hooks/useProveLofte';
import { ProvGratisArk } from './ProvGratisArk';

/**
 * Tilbudet ved første innlogging: én gang, på forsiden, for gratisbrukere som
 * kan få gratisuka (avgjort på serveren — komponenten rendres bare da).
 *
 * «Start gratis uke» og «Fortsett gratis» er like store; ingen låses ute.
 * Visningen deler teller med kartarket (PROVETILBUD_NOKKEL), så kartet venter
 * et døgn etter dette i stedet for å vise det samme igjen samme kveld.
 *
 * NÅR: ikke før velkomstintroen er ferdig og forsidekortet har data (regler
 * i provetilbud-venting.ts). Med en fast timer la arket seg oppå introen før
 * kortet viste noe — det første en ny bruker så, var et salgsark. Dag null er
 * fortsatt riktig dag: begge prøveperiodene til nå kom 3–4 minutter etter
 * registreringen.
 */
export function ProvGratisVedStart() {
  const [vis, setVis] = useState(false);
  useEffect(() => {
    if (readLocal(PROVETILBUD_START_NOKKEL)) return;
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;
    // Samme døgnregel som kartarket: har brukeren nettopp fått tilbudet der,
    // venter forsiden til neste besøk etter et døgn (start-nøkkelen settes
    // først når arket faktisk vises).
    const delt = tolkProvetilbud(readLocal(PROVETILBUD_NOKKEL));
    if (delt.sistVistMs !== null && Date.now() - delt.sistVistMs < PROVETILBUD_MIN_MELLOMROM_MS) return;

    // Butikkens svar på om gratisuka finnes hentes nå, så arket har det når det vises.
    void hentProveLofte();

    // Lokal lagring finnes ikke på serveren, så første klientrender må matche
    // HTML-en (ikke noe ark) — alt under skjer i lyttere og timere.
    let venting = startVenting(readLocal(ONBOARDING_STORAGE_KEY));
    let pust: ReturnType<typeof setTimeout> | null = null;
    const vurder = () => {
      if (pust !== null || !klarTilArk(venting)) return;
      pust = setTimeout(() => {
        writeLocal(PROVETILBUD_START_NOKKEL, new Date().toISOString());
        writeLocal(PROVETILBUD_NOKKEL, JSON.stringify(registrerVisning(tolkProvetilbud(readLocal(PROVETILBUD_NOKKEL)), Date.now())));
        setVis(true);
      }, PROVETILBUD_PUSTEROM_MS);
    };
    const paaIntroFerdig = () => {
      venting = nesteVenting(venting, 'intro-ferdig');
      vurder();
    };
    const paaKortKlar = () => {
      venting = nesteVenting(venting, 'kort-klar');
      vurder();
    };
    window.addEventListener(ONBOARDING_DONE_EVENT, paaIntroFerdig);
    window.addEventListener(FORSIDEKORT_KLAR_EVENT, paaKortKlar);
    // Får kortet aldri data (nettfeil, tom prognose), skal tilbudet likevel komme.
    const frist = setTimeout(() => {
      venting = nesteVenting(venting, 'kort-frist');
      vurder();
    }, FORSIDEKORT_FRIST_MS);
    return () => {
      window.removeEventListener(ONBOARDING_DONE_EVENT, paaIntroFerdig);
      window.removeEventListener(FORSIDEKORT_KLAR_EVENT, paaKortKlar);
      clearTimeout(frist);
      if (pust !== null) clearTimeout(pust);
    };
  }, []);
  if (!vis) return null;
  return <ProvGratisArk utloser="start" onIkkeNaa={() => setVis(false)} onStart={() => setVis(false)} />;
}
