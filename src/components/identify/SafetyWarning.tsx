'use client';

import Link from 'next/link';
import { AlertTriangle, Info, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface SafetyWarningProps {
  level: 'info' | 'caution' | 'danger';
  edibility?: string;
}

export function SafetyWarning({ level, edibility }: SafetyWarningProps) {
  const t = useTranslations('SafetyWarning');
  const s = useTranslations('Safety');

  // Digital kontroll er det handlingsrettede rådet i identify-øyeblikket: brukeren
  // står med soppen i hånda NÅ, og et bilde kan vurderes av soppsakkyndige samme
  // dag — en fysisk kontroll kan være dager unna. Norge har appen Digital
  // soppkontroll (soppkontroll.no); Sverige har ingen nasjonal motsvarighet, så
  // der er nøklene tomme og bare den vanlige kontroll-lenken vises. (Presisert
  // etter innspill fra BSNF 2026-08-12 — ikke slå digital og fysisk sammen.)
  const digitalUrl = s('digitalControlUrl');
  const digitalLabel = t('digitalCheck');
  const visDigital = digitalUrl.length > 0 && digitalLabel.length > 0;
  // 'unknown' = unproven/unmapped edibility → treat as dangerous (show the red
  // warning + Giftinformasjonen), never the soft caution banner.
  if (level === 'danger' || edibility === 'deadly' || edibility === 'toxic' || edibility === 'unknown') {
    return (
      <div className="mb-4 rounded-xl border-2 border-red-500 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-6 w-6 flex-shrink-0 text-red-600" />
          <div>
            <h3 className="text-lg font-bold text-red-800">{t('dangerHeading')}</h3>
            <p className="mt-1 text-red-700">
              {t('dangerBody')}
            </p>
            <div className="mt-3 flex items-center gap-2 text-red-700">
              <Phone className="h-4 w-4" />
              <span className="text-sm font-medium">{s('poisonDisplay')}</span>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {visDigital ? (
                <Link href={digitalUrl} target="_blank" rel="noreferrer" className="inline-block text-sm font-semibold text-red-800 underline">
                  {digitalLabel}
                </Link>
              ) : null}
              <Link href={s('controlUrl')} target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-red-800 underline">
                {t('getAssessment')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
        <div>
          <h3 className="font-semibold text-amber-800">{t('cautionHeading')}</h3>
          <p className="mt-1 text-sm text-amber-700">
            {t('cautionBody')}
          </p>
          <div className="mt-2 flex flex-col gap-1">
            {visDigital ? (
              <Link href={digitalUrl} target="_blank" rel="noreferrer" className="inline-block text-sm font-semibold text-amber-800 underline">
                {digitalLabel}
              </Link>
            ) : null}
            <Link href={s('controlUrl')} target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-amber-800 underline">
              {t('checkWithControl')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
