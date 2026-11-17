'use client';

import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Flag, Settings2, Trash2, UserX } from 'lucide-react';
import { MapFinding } from '@/types/finding';
import type { ReportReason } from '@/types/forum';
import { REPORT_REASONS } from '@/lib/moderation/report-reasons';
import { intlLocale } from '@/lib/utils/intl-locale';
import { visbarTekst } from '@/lib/map/visbar-feil';
import { TREFF_44 } from './trykkflate';

/** Det popupen sender til kartet når et funn meldes. */
export interface FindingReportPayload {
  reason: ReportReason;
  description?: string;
}

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
   * feilmeldingen og lar brukeren prøve igjen — meldingen bare når den er en
   * VisbarFeil (src/lib/map/visbar-feil.ts), ellers popupens egen tekst. Det
   * samme gjelder onReport og onBlock.
   */
  onDelete?: (findingId: string) => Promise<void>;
  /**
   * Melder funnet til moderatorene. Kartet sender den bare inn for en
   * innlogget leser på ANDRES funn, og eier kallet (samme lagring som
   * forumets «Rapporter»). Kaster den, viser popupen feilen — ferdig oversatt
   * av kartet — og lar skjemaet stå.
   */
  onReport?: (findingId: string, payload: FindingReportPayload) => Promise<void>;
  /**
   * Blokkerer den som la inn funnet. Kartet eier også dette: det er kartet som
   * må ta brukerens funn ut av laget og lukke popupen. Kaster den, viser
   * popupen feilen og lar brukeren prøve igjen.
   */
  onBlock?: (finding: MapFinding) => Promise<void>;
}

export function FindingPopup({ finding, displayName, canDelete, onDelete, onReport, onBlock }: FindingPopupProps) {
  const t = useTranslations('FindingPopup');
  // Meldegrunnene og blokkeringstekstene er forumets egne: én ordlyd for samme
  // handling, og grunnene holdes i takt med databasen ett sted (REPORT_REASONS).
  const tReport = useTranslations('ReportButton');
  const tBlock = useTranslations('BlockUser');
  const tBlocked = useTranslations('BlockedUsers');
  const locale = useLocale();
  const name = displayName ?? finding.norwegian_name ?? t('unknownSpecies');
  // To-trinns bekreftelse inne i popupen, ikke en modal. Popupen lever i en
  // løsrevet React-rot som Leaflet eier; en modal derfra havner inne i
  // kartets stablingskontekst og under kartkontrollene.
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Melding og blokkering. Ett av de to er åpent om gangen: begge åpne ville
  // gjort popupen høyere enn kartet på en liten telefon.
  const [panel, setPanel] = useState<'report' | 'block' | null>(null);
  const [reason, setReason] = useState<ReportReason>('misinformation');
  const [description, setDescription] = useState('');
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reportSent, setReportSent] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const reportPanelId = useId();
  const blockPanelId = useId();
  const reasonId = useId();
  const descriptionId = useId();
  const statusRef = useRef<HTMLDivElement | null>(null);
  const author = finding.username?.trim() || tBlocked('unknown');

  // Knappen som hadde fokus forsvinner sammen med skjemaet når meldingen er
  // sendt. Kvitteringen får fokuset, så tastatur og skjermleser står på svaret
  // og ikke ved starten av siden. preventScroll: et fokus som ruller, kan dra
  // hele kartflata ut av stilling.
  useEffect(() => {
    if (reportSent) statusRef.current?.focus({ preventScroll: true });
  }, [reportSent]);

  const togglePanel = (next: 'report' | 'block') => {
    setActionError(null);
    setPanel((current) => (current === next ? null : next));
  };

  const handleReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onReport) return;
    setWorking(true);
    setActionError(null);
    try {
      await onReport(finding.id, { reason, description: description.trim() || undefined });
      setReportSent(true);
      setPanel(null);
      setDescription('');
    } catch (error) {
      setActionError(visbarTekst(error, tReport('submitError')));
    } finally {
      setWorking(false);
    }
  };

  const handleBlock = async () => {
    if (!onBlock) return;
    setWorking(true);
    setActionError(null);
    try {
      await onBlock(finding);
      // Kartet lukker popupen og tar funnene ut av laget. Skulle popupen
      // likevel bli stående, viser den kvitteringen i stedet for knappene.
      setBlocked(true);
      setPanel(null);
    } catch (error) {
      setActionError(visbarTekst(error, tBlock('failed')));
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(finding.id);
      // Ingen opprydding etterpå: kartet fjerner markøren, og hele denne
      // roten med den.
    } catch (error) {
      // Bare tekst kartet har merket som trygg (VisbarFeil); alt annet kan
      // være nettleserens engelske «Load failed».
      setDeleteError(visbarTekst(error, t('deleteFailed')));
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
      <Link
        href={`/forum/new?findingId=${finding.id}`}
        className={`relative inline-flex text-sm font-medium text-forest-800 hover:underline ${TREFF_44}`}
      >
        {t('shareInForum')}
      </Link>

      {/* Sletting av eget funn. Fram til nå fantes det ingen vei ut av et
          feilregistrert funn — feil koordinat, feil art, dobbeltregistrering —
          annet enn å slette hele kontoen. RLS har tillatt det siden migrasjon
          001; det var grensesnittet som manglet. */}
      {canDelete && onDelete ? (
        <div className="border-t border-gray-200 pt-2">
          {/* Deling og notat endres på Mine steder, ikke her. Popupen lever i
              en løsrevet React-rot, og «Endre deling» der (EndreDelingArk) er
              bygget på radene siden henter selv — karantenetidspunktet blant
              dem, som kartets lag ikke har. Lenka åpner stedet med dette
              funnet, så det er ett trykk unna. Bare id-en går i adressen,
              aldri en posisjon. Samme regler gjelder der: privat går alltid,
              åpnere deling har karantene, posisjonen kan ikke endres. */}
          {!confirming ? (
            <Link
              href={`/mine-steder?funn=${encodeURIComponent(finding.id)}`}
              className="mb-2 flex min-h-[44px] w-fit items-center gap-1.5 text-sm font-medium text-forest-800 hover:underline"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden /> {t('manageFinding')}
            </Link>
          ) : null}
          {deleteError ? <p className="mb-2 text-xs text-red-600">{deleteError}</p> : null}

          {confirming ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">{t('deleteConfirmQuestion')}</p>
              {/* Angremuligheten står HER, før klikket. Etterpå er varselet
                  det eneste som forteller om den, og det rekker ikke alle. */}
              <p className="text-xs text-gray-600">{t('deleteConfirmHint')}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="min-h-[44px] rounded-full bg-red-600 px-4 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {deleting ? t('deleting') : t('deleteConfirm')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  className="min-h-[44px] rounded-full border border-gray-300 px-4 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {t('deleteCancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className={`relative inline-flex items-center gap-1.5 text-sm font-medium text-red-700 hover:underline ${TREFF_44}`}
            >
              <Trash2 className="h-3.5 w-3.5" /> {t('delete')}
            </button>
          )}
        </div>
      ) : null}

      {/* Melding og blokkering av ANDRES funn. Kartet er appens hovedflate og
          det første en anmelder trykker på, og et funn med et støtende bilde,
          en rødlistet art eller noens private eiendom kunne ikke meldes der
          det ble sett — bare i forumet. «Blokker» lot dessuten den blokkertes
          funn stå igjen på kartet.

          Forumets egne knapper passer ikke her: BlockUserButton trenger en
          QueryClient, som denne løsrevne roten ikke har, og ReportButton har
          felt uten etikett, en 16 px høy knapp og en åpen/lukket-tilstand vi
          ikke kan styre. Derfor egen visning — med forumets meldegrunner,
          forumets tekster og forumets lagring (kartet kaller den).

          <div>, ikke <p>, for tekstene: Leaflet gir alle <p> i en popup 1,3em
          marg over og under, og den regelen slår Tailwinds klasser. */}
      {!canDelete && (onReport || onBlock) ? (
        <div className="border-t border-gray-200 pt-4">
          {blocked ? (
            <div role="status" className="text-xs text-gray-700">
              {tBlock('blocked', { name: author })}
            </div>
          ) : (
            <>
              {/* Korte, synlige ord (forumets egne) så de to får plass ved siden
                  av hverandre også i den smaleste popupen — brøt raden, ville
                  treffflatene ligget oppå hverandre. Det opplest navnet sier
                  hele handlingen: «Rapporter funnet», «Blokker brukeren». */}
              <div className="flex items-center gap-x-5">
                {onReport && !reportSent ? (
                  <button
                    type="button"
                    onClick={() => togglePanel('report')}
                    aria-label={t('report')}
                    aria-expanded={panel === 'report'}
                    aria-controls={reportPanelId}
                    className={`relative inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-red-700 hover:underline ${TREFF_44}`}
                  >
                    <Flag className="h-3.5 w-3.5" aria-hidden /> {tReport('report')}
                  </button>
                ) : null}
                {onBlock ? (
                  <button
                    type="button"
                    onClick={() => togglePanel('block')}
                    aria-label={t('block')}
                    aria-expanded={panel === 'block'}
                    aria-controls={blockPanelId}
                    className={`relative inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-gray-600 hover:text-gray-900 hover:underline ${TREFF_44}`}
                  >
                    <UserX className="h-3.5 w-3.5" aria-hidden /> {tBlock('block')}
                  </button>
                ) : null}
              </div>

              {reportSent ? (
                <div ref={statusRef} tabIndex={-1} role="status" className="mt-1 text-xs text-emerald-700 outline-none">
                  {tReport('success')}
                </div>
              ) : null}

              {actionError ? (
                <div role="alert" className="mt-2 text-xs text-red-700">
                  {actionError}
                </div>
              ) : null}

              {panel === 'report' ? (
                <form
                  id={reportPanelId}
                  onSubmit={handleReport}
                  className="mt-2 space-y-2 rounded-lg border border-red-200 bg-red-50 p-2"
                >
                  <label htmlFor={reasonId} className="block text-xs font-medium text-gray-800">
                    {t('reportReason')}
                    <select
                      id={reasonId}
                      value={reason}
                      onChange={(event) => setReason(event.target.value as ReportReason)}
                      className="mt-1 h-11 w-full rounded border border-red-200 bg-white px-2 text-sm text-gray-900"
                    >
                      {REPORT_REASONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {tReport(item.labelKey)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor={descriptionId} className="block text-xs font-medium text-gray-800">
                    {tReport('descriptionPlaceholder')}
                    <textarea
                      id={descriptionId}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={2}
                      className="mt-1 w-full rounded border border-red-200 bg-white px-2 py-1.5 text-sm text-gray-900"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={working}
                      className="min-h-[44px] rounded-full bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                    >
                      {working ? t('reportSending') : tReport('submit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePanel('report')}
                      disabled={working}
                      className="min-h-[44px] rounded-full border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      {t('reportCancel')}
                    </button>
                  </div>
                </form>
              ) : null}

              {/* To trinn, som slettingen: blokkering er usynlig for den som
                  blokkeres, og knappen står rett ved siden av «Rapporter». */}
              {panel === 'block' ? (
                <div id={blockPanelId} className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs">
                  <div className="font-medium text-gray-900">{tBlock('confirm', { name: author })}</div>
                  <div className="mt-1 text-gray-600">{tBlock('explain')}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleBlock}
                      disabled={working}
                      className="min-h-[44px] rounded-full bg-gray-900 px-3 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
                    >
                      {working ? tBlock('blocking') : tBlock('confirmYes')}
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePanel('block')}
                      disabled={working}
                      className="min-h-[44px] rounded-full border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      {tBlock('cancel')}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
