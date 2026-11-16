'use client';

import { type ReactNode, useState } from 'react';
import { Trash2 } from 'lucide-react';

/**
 * En sletteknapp som spør før den sletter — inne i flaten, ikke i en
 * nettleserdialog.
 *
 * «Slett» på et lagret offline-område og «Tøm kartcachen» fjernet nedlastede
 * kart på ett trykk, og de kan ikke hentes igjen uten dekning — som er nøyaktig
 * der brukeren står når hen oppdager det. Samme mønster som slettingen i
 * kartets funnpopup (FindingPopup): første trykk viser spørsmålet og to
 * knapper, «Avbryt» lukker, og først bekreftelsen gjør noe. Ingen `confirm()`:
 * den blokkerer hele siden, ser forskjellig ut i appen og nettleseren, og kan
 * ikke oversettes.
 *
 * Tekstene kommer ferdig oversatt fra kallstedet, så komponenten kan brukes
 * for begge handlingene med hver sin ordlyd.
 */
export function ToTrinnsSletting({
  etikett,
  sporsmal,
  bekreft,
  avbryt,
  onBekreft,
  knappKlasser,
  ikon = <Trash2 className="h-3 w-3" aria-hidden />
}: {
  /** Teksten på knappen før den er trykket («Slett», «Tøm kartcachen»). */
  etikett: string;
  /** Spørsmålet som står over de to knappene — sier hva som går tapt. */
  sporsmal: string;
  /** Bekreftelsesknappen («Ja, slett»). */
  bekreft: string;
  avbryt: string;
  onBekreft: () => void | Promise<void>;
  /** Klassene til den første knappen, så den ser ut som før. */
  knappKlasser: string;
  ikon?: ReactNode;
}) {
  const [sporres, setSporres] = useState(false);
  const [arbeider, setArbeider] = useState(false);

  if (!sporres) {
    return (
      <button type="button" onClick={() => setSporres(true)} className={knappKlasser}>
        {ikon}
        {etikett}
      </button>
    );
  }

  const utfor = async () => {
    setArbeider(true);
    try {
      await onBekreft();
    } finally {
      // Raden kan være borte når dette kjører (området er slettet); da er
      // komponenten avmontert og React ignorerer oppdateringen.
      setArbeider(false);
      setSporres(false);
    }
  };

  return (
    <div role="group" aria-label={sporsmal} className="w-full space-y-1">
      <p className="text-[11px] font-medium text-gray-900">{sporsmal}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void utfor()}
          disabled={arbeider}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-red-600 px-3 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {ikon}
          {bekreft}
        </button>
        <button
          type="button"
          onClick={() => setSporres(false)}
          disabled={arbeider}
          className="inline-flex min-h-[44px] items-center rounded-full border border-gray-300 px-3 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {avbryt}
        </button>
      </div>
    </div>
  );
}
