'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
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
 * FORHOLDENE snur i et område. Ikke at det står sopp der. Ikke skriv det om —
 * og hold nb og sv i messages/-katalogene i takt når den justeres.
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
  const t = useTranslations('SoppvarselCard');
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
      toast.success(active ? t('toastOn', { region: valgt }) : t('toastOff'));
    } catch {
      toast.error(t('toastError'));
    } finally {
      setLagrer(false);
    }
  }

  // Lenker fra /soppforhold («Slå på soppvarsel») peker hit. Rull kortet inn i
  // syne når parameteren er satt — det ligger under bretten på profilsiden, og
  // en knapp som lander på toppen av en annen side leverer ikke det den lovte.
  // Leses fra window (ikke useSearchParams) så kortet ikke trenger Suspense.
  useEffect(() => {
    if (laster) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('vis') === 'soppvarsel' || window.location.hash === '#soppvarsel') {
      document.getElementById('soppvarsel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [laster]);

  // Skjelett i stedet for null mens vi laster: ankeret #soppvarsel må finnes i
  // DOM-en fra første rendring for at innrulling (og vanlige #-lenker) skal
  // treffe, og siden hopper mindre når kortet ikke dukker opp av intet.
  if (laster) {
    return (
      <article id="soppvarsel" className="scroll-mt-20 rounded-xl border border-gray-200 bg-white p-4">
        <div className="h-5 w-32 animate-pulse rounded bg-gray-100" />
        <div className="mt-3 h-4 w-full animate-pulse rounded bg-gray-100" />
      </article>
    );
  }

  const paa = abonnement?.active === true;

  return (
    // id-en er lenkemål fra /soppforhold («Slå på soppvarsel» → /profile#soppvarsel).
    <article id="soppvarsel" className="space-y-3 scroll-mt-20 rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold text-forest-900">
          <Bell className="h-4 w-4 text-forest-700" aria-hidden="true" />
          {t('heading')}
        </h2>
        <p className="mt-1 text-sm text-gray-700">{t('intro')}</p>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-gray-800">{t('areaLabel')}</span>
        <select
          value={valgt}
          onChange={(e) => setValgt(e.target.value)}
          disabled={lagrer}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-forest-700 focus:outline-none"
        >
          <option value="">{t('chooseArea')}</option>
          <optgroup label={t('norway')}>
            {regioner.filter((r) => r.land === 'NO').map((r) => (
              <option key={r.navn} value={r.navn}>{r.navn}</option>
            ))}
          </optgroup>
          <optgroup label={t('sweden')}>
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
          {paa && abonnement?.region === valgt ? t('isOn') : t('turnOn')}
        </button>

        {paa ? (
          <button
            type="button"
            onClick={() => void lagre(false)}
            disabled={lagrer}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <BellOff className="h-4 w-4" />
            {t('turnOff')}
          </button>
        ) : null}
      </div>

      {/* Samme forbehold som e-posten og /soppforhold. Uten det lover kortet mer
          enn modellen kan holde. */}
      <p className="text-xs leading-relaxed text-gray-500">{t('disclaimer')}</p>
    </article>
  );
}
