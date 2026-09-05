'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';

/**
 * «Send til en turvenn». Deler den rene områdelenka (uten søkeparametre) —
 * en offentlig side som aldri røper private steder. Web Share der den finnes
 * (mobil), ellers kopi til utklippstavla. Ingen rabatt, ingen poeng: bare en
 * lenke som er verdt å sende.
 */
const COPY = {
  NO: { knapp: 'Del', tekst: (navn: string) => `Soppforholdene i ${navn} i dag — oppdatert hver morgen`, kopiert: 'Lenke kopiert', feilet: 'Kunne ikke dele' },
  SE: { knapp: 'Dela', tekst: (navn: string) => `Svampläget i ${navn} idag — uppdateras varje morgon`, kopiert: 'Länk kopierad', feilet: 'Kunde inte dela' }
} as const;

export function DelOmrade({ navn, land }: { navn: string; land: 'NO' | 'SE' }) {
  const t = COPY[land];
  const [melding, setMelding] = useState<string | null>(null);
  const [pagar, setPagar] = useState(false);

  async function del() {
    // Dobbelttrykk mens delingsarket er på vei opp gir InvalidStateError fra
    // det andre kallet — og «Kunne ikke dele» ved siden av et åpent ark.
    if (pagar) return;
    setPagar(true);
    setMelding(null);
    const url = `${window.location.origin}${window.location.pathname}`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: t.tekst(navn), text: t.tekst(navn), url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setMelding(t.kopiert);
    } catch (e) {
      // Avbrutt eller allerede pågående deling er ikke en feil.
      if (e instanceof Error && (e.name === 'AbortError' || e.name === 'InvalidStateError')) return;
      setMelding(t.feilet);
    } finally {
      setPagar(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={del}
        disabled={pagar}
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-forest-800 hover:bg-forest-50"
      >
        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
        {t.knapp}
      </button>
      {melding ? (
        <span className="text-xs text-gray-500" role="status">
          {melding}
        </span>
      ) : null}
    </span>
  );
}
