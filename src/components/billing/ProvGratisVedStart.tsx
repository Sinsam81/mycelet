'use client';

import { useEffect, useState } from 'react';
import { readLocal, writeLocal } from '@/lib/utils/safe-storage';
import { PROVETILBUD_NOKKEL, PROVETILBUD_START_NOKKEL, registrerVisning, tolkProvetilbud } from '@/lib/billing/provetilbud';
import { ProvGratisArk } from './ProvGratisArk';

/**
 * Tilbudet ved første innlogging: én gang, på forsiden, for gratisbrukere som
 * kan få gratisuka (avgjort på serveren — komponenten rendres bare da).
 *
 * «Start gratis uke» og «Fortsett gratis» er like store; ingen låses ute.
 * Visningen deler teller med kartarket (PROVETILBUD_NOKKEL), så kartet venter
 * et døgn etter dette i stedet for å vise det samme igjen samme kveld.
 */
export function ProvGratisVedStart() {
  const [vis, setVis] = useState(false);
  useEffect(() => {
    if (readLocal(PROVETILBUD_START_NOKKEL)) return;
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;
    // Neste tick, ikke synkront i effekten: lokal lagring finnes ikke på
    // serveren, så første klientrender må matche HTML-en (ikke noe ark).
    const id = setTimeout(() => {
      writeLocal(PROVETILBUD_START_NOKKEL, new Date().toISOString());
      writeLocal(PROVETILBUD_NOKKEL, JSON.stringify(registrerVisning(tolkProvetilbud(readLocal(PROVETILBUD_NOKKEL)), Date.now())));
      setVis(true);
    }, 800);
    return () => clearTimeout(id);
  }, []);
  if (!vis) return null;
  return <ProvGratisArk variant="start" onIkkeNaa={() => setVis(false)} onStart={() => setVis(false)} />;
}
