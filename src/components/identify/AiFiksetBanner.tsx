'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AI_FIKSET_BANNER_KEY, skalViseAiFiksetBanner } from '@/lib/bruk/ai-fikset-banner';
import { osloDag } from '@/lib/bruk/bruksdag';

/**
 * «AI-soppkjenneren er fikset» — se src/lib/bruk/ai-fikset-banner.ts for
 * hvorfor og hvor lenge. Lukkes per enhet. På serveren og under hydrering
 * renderes ingenting (useSyncExternalStore med serverøyeblikk «skjult»), så
 * det blinker ikke og hydreringen stemmer; etterpå leses localStorage og
 * dagens dato. `medLenke` bare på forsiden — på /identify står brukeren der
 * allerede.
 */
function lesLukket(): string | null {
  try {
    return window.localStorage.getItem(AI_FIKSET_BANNER_KEY);
  } catch {
    // Privat modus eller blokkert lagring: vis, og la lukk-knappen bare gjelde denne siden.
    return null;
  }
}

const ingenAbonnement = () => () => {};

export function AiFiksetBanner({ medLenke = false }: { medLenke?: boolean }) {
  const t = useTranslations('AiFiksetBanner');
  const [lukketNaa, setLukketNaa] = useState(false);
  const vis = useSyncExternalStore(
    ingenAbonnement,
    () => !lukketNaa && skalViseAiFiksetBanner(osloDag(new Date()), lesLukket()),
    () => false
  );

  if (!vis) return null;

  const lukk = () => {
    try {
      window.localStorage.setItem(AI_FIKSET_BANNER_KEY, '1');
    } catch {
      // Ingen lagring — banneret kommer igjen neste gang, det er greit.
    }
    setLukketNaa(true);
  };

  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-forest-200 bg-forest-50 p-4">
      <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-forest-700" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold text-forest-900">{t('title')}</p>
        <p className="text-sm text-forest-800">{t('body')}</p>
        {medLenke ? (
          <Link href="/identify" className="inline-block pt-1 text-sm font-semibold text-forest-800 underline">
            {t('cta')} →
          </Link>
        ) : null}
      </div>
      <button
        type="button"
        onClick={lukk}
        aria-label={t('dismiss')}
        className="shrink-0 rounded-md p-1 text-forest-700 hover:bg-forest-100"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
