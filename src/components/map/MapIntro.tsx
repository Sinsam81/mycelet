'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useDialogFokus } from '@/components/ui/useDialogFokus';

interface MapIntroProps {
  /** «Skjønner!», et trykk på sløret og Escape går alle hit. Kartet husker at introen er sett. */
  onLukk: () => void;
}

/**
 * Introen første gang kartet åpnes: hva funnene, de lovende stedene,
 * satellittlaget og posisjonsknappen er.
 *
 * Den var et slør med en boks oppå — uten rolle, uten navn og uten noe av det
 * de andre arkene i appen fikk med useDialogFokus. For en skjermleser var den
 * fire løse linjer et sted på siden mens kartet bak fortsatt lot seg nå, og på
 * nett gjorde Escape ingenting. Nå er den en dialog: fokus flyttes inn når den
 * åpnes, Tab blir inne i den, Escape lukker den, og fokus går tilbake etterpå.
 *
 * Boksen ruller når den er høyere enn kartet, og «Skjønner!» står fast
 * nederst i den (sticky) så knappen alltid er synlig. På de minste skjermene
 * er kartet under 350 px høyt og innholdet over 450: da lå overskriften og de
 * første punktene utenfor kartets kant, uten noen måte å få dem fram på. Det
 * er selve boksen som ruller — den har fokus, så piltastene ruller den også.
 *
 * Bor i sin egen fil fordi MushroomMap ikke lar seg laste i en test (Leaflet +
 * DOM). Her kan dialogen prøves for seg — se __tests__/MapIntro.test.tsx.
 */
export function MapIntro({ onLukk }: MapIntroProps) {
  const t = useTranslations('MushroomMap');
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFokus(panelRef, { aapen: true, onLukk });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kartintro-tittel"
      className="absolute inset-0 z-[1100] flex items-end justify-center bg-black/30 p-4 sm:items-center"
      onClick={onLukk}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="max-h-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl bg-white px-5 pt-5 shadow-2xl outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="kartintro-tittel" className="text-base font-semibold text-gray-900">
          {t('introTitle')}
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-gray-700">
          <li>📍 {t.rich('introFindings', { b: (chunks) => <b>{chunks}</b> })}</li>
          <li>⭐ {t.rich('introSpots', { b: (chunks) => <b>{chunks}</b> })}</li>
          <li>🛰️ {t.rich('introSatellite', { b: (chunks) => <b>{chunks}</b> })}</li>
          <li>{t.rich('introLocate', { b: (chunks) => <b>{chunks}</b> })}</li>
        </ul>
        {/* Foten bærer boksens polstring nederst (pb-5) og luften over
            knappen (pt-4), og har hvit bunn: når boksen ruller, står den fast
            og teksten går under den. */}
        <div className="sticky bottom-0 bg-white pb-5 pt-4">
          <button
            type="button"
            onClick={onLukk}
            className="min-h-[44px] w-full rounded-full bg-forest-800 px-4 py-2 text-sm font-medium text-white hover:bg-forest-700"
          >
            {t('introGotIt')}
          </button>
        </div>
      </div>
    </div>
  );
}
