'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Bell, BellOff, Loader2 } from 'lucide-react';

/**
 * Slå på soppvarsel for ett område.
 *
 * Bevisst kjedelig: én nedtrekksliste og én knapp. Alt som gjør denne
 * funksjonen verdt noe ligger i src/lib/alerts/decision.ts — når e-posten
 * sendes — ikke her.
 *
 * Teksten lover det samme som e-posten og /soppforhold gjør: at vi sier fra når
 * FORHOLDENE snur i et område. Ikke at det står sopp der. Ikke skriv det om.
 */

interface Region {
  navn: string;
  land: 'NO' | 'SE';
}

interface Abonnement {
  region: string;
  active: boolean;
  last_notified_at: string | null;
}

export function SoppvarselCard() {
  const [regioner, setRegioner] = useState<Region[]>([]);
  const [valgt, setValgt] = useState<string>('');
  const [abonnement, setAbonnement] = useState<Abonnement | null>(null);
  const [laster, setLaster] = useState(true);
  const [lagrer, setLagrer] = useState(false);

  useEffect(() => {
    let avbrutt = false;
    fetch('/api/me/soppvarsel')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (avbrutt || !d) return;
        setRegioner(d.regioner ?? []);
        setAbonnement(d.abonnement ?? null);
        setValgt(d.abonnement?.region ?? '');
      })
      .catch(() => {})
      .finally(() => {
        if (!avbrutt) setLaster(false);
      });
    return () => {
      avbrutt = true;
    };
  }, []);

  async function lagre(active: boolean) {
    if (!valgt) return;
    setLagrer(true);
    try {
      const res = await fetch('/api/me/soppvarsel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: valgt, active })
      });
      if (!res.ok) throw new Error();
      setAbonnement({ region: valgt, active, last_notified_at: abonnement?.last_notified_at ?? null });
      toast.success(active ? `Varsel på for ${valgt}` : 'Varselet er slått av');
    } catch {
      toast.error('Kunne ikke lagre. Prøv igjen.');
    } finally {
      setLagrer(false);
    }
  }

  if (laster) return null;

  const paa = abonnement?.active === true;

  return (
    <article className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold text-forest-900">
          <Bell className="h-4 w-4 text-forest-700" aria-hidden="true" />
          Soppvarsel
        </h2>
        <p className="mt-1 text-sm text-gray-700">
          Få en e-post når soppforholdene snur i området ditt — ikke oftere enn én gang i uka, og
          bare når det faktisk har endret seg.
        </p>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-gray-800">Område</span>
        <select
          value={valgt}
          onChange={(e) => setValgt(e.target.value)}
          disabled={lagrer}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-forest-700 focus:outline-none"
        >
          <option value="">Velg område …</option>
          <optgroup label="Norge">
            {regioner.filter((r) => r.land === 'NO').map((r) => (
              <option key={r.navn} value={r.navn}>{r.navn}</option>
            ))}
          </optgroup>
          <optgroup label="Sverige">
            {regioner.filter((r) => r.land === 'SE').map((r) => (
              <option key={r.navn} value={r.navn}>{r.navn}</option>
            ))}
          </optgroup>
        </select>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void lagre(true)}
          disabled={lagrer || !valgt}
          className="inline-flex items-center gap-2 rounded-lg bg-forest-800 px-3 py-2 text-sm font-semibold text-white hover:bg-forest-700 disabled:opacity-60"
        >
          {lagrer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
          {paa && abonnement?.region === valgt ? 'Varselet er på' : 'Slå på varsel'}
        </button>

        {paa ? (
          <button
            type="button"
            onClick={() => void lagre(false)}
            disabled={lagrer}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <BellOff className="h-4 w-4" />
            Slå av
          </button>
        ) : null}
      </div>

      {/* Samme forbehold som e-posten og /soppforhold. Uten det lover kortet mer
          enn modellen kan holde. */}
      <p className="text-xs leading-relaxed text-gray-500">
        Varselet gjelder vær og sesong for et større område, ikke skogen der du står. Vi lover ikke
        at du finner sopp — bare at forholdene ligger til rette.
      </p>
    </article>
  );
}
