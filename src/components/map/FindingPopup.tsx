'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MapFinding } from '@/types/finding';

interface FindingPopupProps {
  finding: MapFinding;
}

export function FindingPopup({ finding }: FindingPopupProps) {
  const t = useTranslations('FindingPopup');

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
      {finding.thumbnail_url ? (
        <img src={finding.thumbnail_url} alt={finding.norwegian_name ?? t('unknownSpecies')} className="h-32 w-full rounded-lg object-cover" />
      ) : null}

      <div>
        <h3 className="font-semibold text-gray-900">{finding.norwegian_name ?? t('unknownSpecies')}</h3>
        <p className="text-xs italic text-gray-600">{finding.latin_name ?? t('notProvided')}</p>
        <p className="mt-1 text-xs text-gray-600">
          {finding.username} • {new Date(finding.found_at).toLocaleDateString('nb-NO')}
        </p>
        {finding.is_zone_finding ? (
          <p className="mt-1 text-xs font-medium text-amber-800">
            {finding.zone_label
              ? t('zoneFindingLabeled', { label: finding.zone_label, km: finding.zone_precision_km ?? 5 })
              : t('zoneFinding', { km: finding.zone_precision_km ?? 5 })}
          </p>
        ) : null}
      </div>

      {finding.notes ? <p className="text-sm text-gray-700">{finding.notes}</p> : null}

      <Link href={`/forum/new?findingId=${finding.id}`} className="inline-flex text-sm font-medium text-forest-800 hover:underline">
        {t('seeMore')}
      </Link>
    </div>
  );
}
