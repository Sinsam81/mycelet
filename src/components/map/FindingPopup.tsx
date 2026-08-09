'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { MapFinding } from '@/types/finding';
import { intlLocale } from '@/lib/utils/intl-locale';

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
  const locale = useLocale();
  const name = displayName ?? finding.norwegian_name ?? t('unknownSpecies');

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
      {finding.thumbnail_url ? (
        <img src={finding.thumbnail_url} alt={name} className="h-32 w-full rounded-lg object-cover" />
      ) : null}

      <div>
        <h3 className="font-semibold text-gray-900">{name}</h3>
        <p className="text-xs italic text-gray-600">{finding.latin_name ?? t('notProvided')}</p>
        {/* Arten er OPPGITT av den som la inn funnet — den er ikke kontrollert
            av noen. Uten denne linja leses artsnavnet (og markørfargen, som er
            satt av artskatalogens spiselighet) som en bestemmelse Mycelet står
            inne for. `verification_status` finnes på raden, men settes ikke av
            noe i dag, så vi merker alt som ikke er uttrykkelig verifisert. */}
        {finding.verification_status !== 'verified' ? (
          <p className="mt-0.5 text-xs font-medium text-amber-800">{t('unverifiedClaim')}</p>
        ) : null}
        <p className="mt-1 text-xs text-gray-600">
          {finding.username} • {new Date(finding.found_at).toLocaleDateString(intlLocale(locale))}
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

      {/* Sto som «Se mer», men lenka åpner skrivebildet i forumet — den viser
          ingenting mer om funnet. Verre: koblingsfeltet der inne lister bare
          DINE egne funn, så trykker du på en annen brukers nål, får du et tomt
          skjema. Kartet er den første skjermen en anmelder trykker på. */}
      <Link href={`/forum/new?findingId=${finding.id}`} className="inline-flex text-sm font-medium text-forest-800 hover:underline">
        {t('shareInForum')}
      </Link>
    </div>
  );
}
