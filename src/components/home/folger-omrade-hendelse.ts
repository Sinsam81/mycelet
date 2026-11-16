'use client';

import { useEffect, useState } from 'react';

/**
 * «Brukeren følger nå et område» — beskjeden fra stripa i forsidekortet til
 * resten av forsiden.
 *
 * Om brukeren følger et område leses på SERVEREN når forsiden tegnes. Stripa
 * «Følg området ditt» (FolgOmrade) melder brukeren på fra nettleseren, uten å
 * laste siden på nytt — så rett under en grønn «Du følger Oslo» sto det
 * fortsatt en hel blokk «Slå på soppvarsel» og en lenke «Få varsel på e-post».
 * Å bli bedt om noe sekunder etter at du gjorde det, ser ut som om trykket
 * ikke virket.
 *
 * Hendelsen sendes også når stripas eget oppslag viser at brukeren ALT følger
 * et område serveren ikke så: en kontoløs påmelding på samme e-post blir
 * adoptert i det kallet (src/lib/alerts/adopsjon.ts).
 *
 * Bevisst en hendelse og ikke router.refresh(): en oppfriskning henter hele
 * forsiden på nytt og kan montere prognosekortet om igjen — med ny henting,
 * ny «kortet har data»-hendelse og bekreftelsen brukeren nettopp fikk, borte.
 *
 * Samme mønster som FORSIDEKORT_KLAR_EVENT. Lytterne står på samme side og er
 * montert lenge før et trykk eller et nettverkssvar kan sende noe.
 */
export const FOLGER_OMRADE_EVENT = 'mycelet:folger-omrade';

/** Kalles av stripa når påmeldingen er lagret, eller viste seg å finnes fra før. */
export function meldFolgerOmrade(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(FOLGER_OMRADE_EVENT));
}

/**
 * Følger brukeren et område? Sann når serveren så det (`fraServer`), eller så
 * snart stripa har meldt fra i denne visningen. Blir aldri usann igjen: å
 * slutte å følge skjer på profilen, og forsiden tegnes på nytt etterpå.
 */
export function useFolgerOmrade(fraServer: boolean): boolean {
  const [meldt, setMeldt] = useState(false);
  useEffect(() => {
    const paaMeldt = () => setMeldt(true);
    window.addEventListener(FOLGER_OMRADE_EVENT, paaMeldt);
    return () => window.removeEventListener(FOLGER_OMRADE_EVENT, paaMeldt);
  }, []);
  return fraServer || meldt;
}
