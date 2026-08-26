'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
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
  /**
   * Er funnet leserens eget? Kartet avgjør det (finding.user_id mot den
   * innloggede brukeren) — popupen gjetter ikke selv.
   */
  canDelete?: boolean;
  /**
   * Utfører slettingen. Kartet eier den: det er kartet som må fjerne markøren,
   * vise angre-varselet og laste laget på nytt. Kaster den, viser popupen
   * feilmeldingen og lar brukeren prøve igjen.
   */
  onDelete?: (findingId: string) => Promise<void>;
}

export function FindingPopup({ finding, displayName, canDelete, onDelete }: FindingPopupProps) {
  const t = useTranslations('FindingPopup');
  const locale = useLocale();
  const name = displayName ?? finding.norwegian_name ?? t('unknownSpecies');
  // To-trinns bekreftelse inne i popupen, ikke en modal. Popupen lever i en
  // løsrevet React-rot som Leaflet eier; en modal derfra havner inne i
  // kartets stablingskontekst og under kartkontrollene.
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(finding.id);
      // Ingen opprydding etterpå: kartet fjerner markøren, og hele denne
      // roten med den.
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : t('deleteFailed'));
      setDeleting(false);
      setConfirming(false);
    }
  };

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

      {/* Sletting av eget funn. Fram til nå fantes det ingen vei ut av et
          feilregistrert funn — feil koordinat, feil art, dobbeltregistrering —
          annet enn å slette hele kontoen. RLS har tillatt det siden migrasjon
          001; det var grensesnittet som manglet. */}
      {canDelete && onDelete ? (
        <div className="border-t border-gray-200 pt-2">
          {deleteError ? <p className="mb-2 text-xs text-red-600">{deleteError}</p> : null}

          {confirming ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">{t('deleteConfirmQuestion')}</p>
              {/* Angremuligheten står HER, før klikket. Etterpå er varselet
                  det eneste som forteller om den, og det rekker ikke alle. */}
              <p className="text-xs text-gray-600">{t('deleteConfirmHint')}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {deleting ? t('deleting') : t('deleteConfirm')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {t('deleteCancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700 hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t('delete')}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
