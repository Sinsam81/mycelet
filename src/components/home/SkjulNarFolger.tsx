'use client';

import type { ReactNode } from 'react';
import { useFolgerOmrade } from '@/components/home/folger-omrade-hendelse';

/**
 * Tar innholdet sitt bort i det brukeren begynner å følge et område fra
 * stripa i forsidekortet.
 *
 * Forsiden bruker den rundt «Slå på soppvarsel»-blokka (VarselCta). Blokka er
 * en serverkomponent og vet bare det serveren så da siden ble tegnet; denne
 * innpakningen er den lille biten som lytter i nettleseren. VarselCta selv er
 * urørt, så /soppforhold og områdesidene — der leseren ikke er innlogget og
 * ingen stripe finnes — tegner den som før.
 *
 * Se folger-omrade-hendelse.ts for hvorfor dette er en hendelse og ikke en
 * oppfriskning av siden.
 */
export function SkjulNarFolger({ children }: { children: ReactNode }) {
  return useFolgerOmrade(false) ? null : <>{children}</>;
}
