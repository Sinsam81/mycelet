'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Tastatur og fokus for appens dialoger og ark — ett sted, ikke ett per ark.
 *
 * Hvert ark var en håndskrevet <div role="dialog"> uten noe av dette: Escape
 * gjorde ingenting, fokus ble stående på knappen bak bakteppet, Tab vandret
 * videre i siden under (også under «Slett kontoen»), og etter lukking var
 * fokus borte.
 *
 * Kroken gjør fire ting mens `aapen` er sann:
 *  1. Flytter fokus til PANELET (tabIndex={-1}), ikke til første felt. Fokus
 *     på et tekstfelt drar opp iOS-tastaturet — se tastaturForstyrrer() i
 *     OnboardingIntro — og i slettedialogen ville første stopp vært en
 *     destruktiv kontroll.
 *  2. Escape kaller `onLukk`, men bare når `kanLukkes` er sann og dialogen er
 *     den øverste. Tilbudsarket kan ligge oppå introen; da lukkes ett om gangen.
 *  3. Tab og Shift+Tab går i ring inne i panelet.
 *  4. Gir fokus tilbake til elementet som hadde det, når dialogen lukkes.
 *
 * Bevisst IKKE `inert` eller aria-hidden på resten av siden: `aria-modal`
 * dekker skjermlesere, og `inert` ville tatt toasteren (GPX-arket bruker den),
 * ark som ligger oppå hverandre, og løftet i OnboardingIntro om at et slør
 * aldri skal kunne sperre appen. Kroken lytter bare på tastaturet — et trykk
 * går alltid gjennom som før.
 */

const FOKUSERBARE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Lukkeknappen (X) i et ark: 44 × 44 px treffflate rundt et 20 px ikon. Den
 * negative margen holder krysset der det sto, så overskriften ikke flytter seg.
 */
export const LUKKEKNAPP_KLASSER =
  '-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50';

/** Åpne dialoger, eldste først. Den siste er den øverste. */
const stabel: object[] = [];

/** Tekstfelt får ikke fokus tilbake: på iOS ville det dratt tastaturet opp igjen. */
function erTekstfelt(el: HTMLElement): boolean {
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'file'].includes(el.type);
}

export function fokuserbareI(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOKUSERBARE));
}

export function useDialogFokus(
  panelRef: RefObject<HTMLElement | null>,
  {
    aapen,
    onLukk,
    kanLukkes = true
  }: {
    aapen: boolean;
    onLukk: () => void;
    kanLukkes?: boolean;
  }
) {
  // Kallstedene sender nye funksjoner hver gjengivelse. Effekten skal likevel
  // bare kjøre når dialogen åpnes og lukkes — ellers ville fokus hoppet tilbake
  // til panelet for hvert tastetrykk i et felt.
  const onLukkRef = useRef(onLukk);
  const kanLukkesRef = useRef(kanLukkes);
  useEffect(() => {
    onLukkRef.current = onLukk;
    kanLukkesRef.current = kanLukkes;
  });

  useEffect(() => {
    if (!aapen) return;
    const id = {};
    const forrige = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stabel.push(id);
    panelRef.current?.focus({ preventScroll: true });

    const paaTast = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (stabel[stabel.length - 1] !== id) return;
      const panel = panelRef.current;
      if (!panel) return;

      if (e.key === 'Escape') {
        if (!kanLukkesRef.current) return;
        e.preventDefault();
        onLukkRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const mulige = fokuserbareI(panel);
      if (mulige.length === 0) {
        e.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const forste = mulige[0];
      const siste = mulige[mulige.length - 1];
      const aktiv = document.activeElement;
      const utenfor = !(aktiv instanceof Node) || !panel.contains(aktiv);

      if (e.shiftKey) {
        if (utenfor || aktiv === forste || aktiv === panel) {
          e.preventDefault();
          siste.focus({ preventScroll: true });
        }
      } else if (utenfor || aktiv === siste) {
        e.preventDefault();
        forste.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', paaTast);
    return () => {
      document.removeEventListener('keydown', paaTast);
      const i = stabel.lastIndexOf(id);
      if (i >= 0) stabel.splice(i, 1);
      if (forrige && document.contains(forrige) && !erTekstfelt(forrige)) {
        forrige.focus({ preventScroll: true });
      }
    };
  }, [aapen, panelRef]);
}
