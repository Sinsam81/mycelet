'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MapFinding } from '@/types/finding';

interface FindingPopupProps {
  finding: MapFinding;
  /**
   * Artsnavnet på leserens språk. Kartet slår det opp i `speciesNamesRef`, som
   * allerede er fylt via getSpeciesDisplayName(..., locale) — så en svensk
   * bruker får «Kantarell» og ikke det norske navnet.
   *
   * `finding.norwegian_name` kommer rått fra `public_findings`-viewet og er
   * alltid norsk. Den beholdes som reserve for funn uten art.
   */
  displayName?: string;
}

export function FindingPopup({ finding, displayName }: FindingPopupProps) {
  const t = useTranslations('FindingPopup');
  const name = displayName ?? finding.norwegian_name ?? t('unknownSpecies');

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
      {finding.thumbnail_url ? (
        <img src={finding.thumbnail_url} alt={name} className="h-32 w-full rounded-lg object-cover" />
      ) : null}

      <div>
        <h3 className="font-semibold text-gray-900">{name}</h3>
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
