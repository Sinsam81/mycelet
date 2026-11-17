'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { useModerationAction, useModerationReports, type ModerationFilter } from '@/lib/hooks/useForum';
import { Button } from '@/components/ui/Button';
import { erAapenRapport, type FunnVisning, type ModerationAction, type ModerationReportItem } from '@/lib/moderation/moderering';
import { reportReasonLabelKey } from '@/lib/moderation/report-reasons';
import { intlLocale } from '@/lib/utils/intl-locale';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';

/**
 * Selve konsollen. Rendres kun av server-siden i page.tsx, og bare for en
 * innlogget bruker med moderator- eller admin-rolle.
 *
 * Viser HVA som er meldt (utdrag, bilder, forfatter) og lar moderatoren skjule
 * det. Utdraget kommer fra serveren og ikke fra en lenke til tråden: et skjult
 * innlegg er usynlig for alle gjennom RLS, moderatoren medregnet, så lenken
 * vises bare mens tråden fortsatt kan åpnes.
 */
export function ModerationConsole() {
  const t = useTranslations('ForumModeration');
  const tReason = useTranslations('ReportButton');
  const tStatus = useTranslations('ForumReports');
  const locale = useLocale();
  const [filter, setFilter] = useState<ModerationFilter>('pending');
  const { data, isLoading, error } = useModerationReports(filter);
  const moderate = useModerationAction();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const statusLabel: Record<string, string> = {
    pending: tStatus('statusPending'),
    reviewed: tStatus('statusReviewed'),
    resolved: tStatus('statusResolved'),
    dismissed: tStatus('statusDismissed')
  };

  const doneMessage: Record<ModerationAction, string> = {
    hide: t('doneHide'),
    unhide: t('doneUnhide'),
    dismiss: t('doneDismiss'),
    reviewed: t('doneReviewed'),
    resolve: t('doneResolve')
  };

  // Hvordan funnet vises for andre. Koordinatene sendes aldri hit, så dette
  // og sonenavnet er det moderatoren har å vurdere en personvernmelding på.
  const shownLabel: Record<FunnVisning, string> = {
    public: t('findingShownPublic'),
    approximate: t('findingShownApproximate'),
    zone: t('findingShownZone'),
    private: t('findingShownPrivate')
  };

  const run = async (reportId: string, action: ModerationAction) => {
    setPendingId(reportId);
    try {
      await moderate.mutateAsync({ reportId, action });
      toast.success(doneMessage[action]);
    } catch {
      toast.error(t('actionError'));
    } finally {
      setPendingId(null);
    }
  };

  const reports = data?.reports ?? [];
  const pending = data?.pending;

  const typeLabel = (report: ModerationReportItem) =>
    report.target.type === 'post' ? t('typePost') : report.target.type === 'comment' ? t('typeComment') : t('typeFinding');

  const findingLine = (report: ModerationReportItem) => {
    const { species, speciesOverride, foundAt } = report.target;
    const name = (species ? getSpeciesDisplayName(species, locale) : '') || speciesOverride || t('unknownSpecies');
    return foundAt ? `${name} · ${new Date(foundAt).toLocaleDateString(intlLocale(locale))}` : name;
  };

  return (
    <PageWrapper>
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">{t('title')}</h1>

        {/* null = tellingen feilet. Da vet vi ikke om noe har ligget over
            døgnfristen, så banneret sier det i stedet for å forsvinne som
            ved «0 åpne». */}
        {pending === null ? (
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {t('openNotMeasured')} {t('overdue')}
          </p>
        ) : pending && pending.antall > 0 ? (
          <p
            className={`rounded px-3 py-2 text-sm ${
              pending.over24t ? 'bg-red-50 font-medium text-red-800' : 'bg-amber-50 text-amber-800'
            }`}
          >
            {t('openSummary', { count: pending.antall, hours: pending.eldsteTimer ?? 0 })}
            {pending.over24t ? ` ${t('overdue')}` : ''}
          </p>
        ) : null}

        <div className="flex gap-2">
          {(['pending', 'all'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                filter === value ? 'bg-forest-800 text-white' : 'border border-gray-300 bg-white text-gray-800 hover:border-forest-400'
              }`}
            >
              {value === 'pending' ? t('filterPending') : t('filterAll')}
            </button>
          ))}
        </div>

        {isLoading ? <p className="text-sm text-gray-700">{t('loading')}</p> : null}
        {error ? <p className="text-sm text-red-600">{t('loadError')}</p> : null}

        <div className="space-y-2">
          {reports.map((report) => {
            const { target } = report;
            const reasonKey = reportReasonLabelKey(report.reason);
            const busy = pendingId === report.id;
            const open = erAapenRapport(report.status);
            // Funn kan ikke skjules herfra, og må de fjernes, skjer det i
            // databasen. Da må raden kunne finnes: brukernavn, art og dato er
            // ikke entydig når noen har lagret flere funn av samme art samme dag.
            const findingId =
              target.type === 'finding' && target.id ? (
                <p className="mt-1 text-xs text-gray-600">
                  {t('findingId')} <code className="select-all break-all rounded bg-gray-100 px-1 py-0.5 text-gray-900">{target.id}</code>
                </p>
              ) : null;

            return (
              <article key={report.id} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">{reasonKey ? tReason(reasonKey) : report.reason}</p>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-800">{typeLabel(report)}</span>
                  {target.isHidden ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">{t('hiddenBadge')}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {t('statusLabel')} {statusLabel[report.status] ?? report.status} · {new Date(report.createdAt).toLocaleString(intlLocale(locale))}
                </p>
                {report.description ? (
                  <p className="mt-1 text-sm text-gray-700">
                    {t('reporterNote')} {report.description}
                  </p>
                ) : null}

                <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
                  {target.missing ? (
                    <>
                      <p className="text-sm text-gray-700">{t('contentMissing')}</p>
                      {findingId}
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500">{t('author', { name: target.authorUsername ?? t('unknownUser') })}</p>
                      {target.type === 'finding' ? <p className="mt-1 text-sm font-medium text-gray-900">{findingLine(report)}</p> : null}
                      {target.shownAs ? (
                        <p className="mt-1 text-xs text-gray-600">
                          {shownLabel[target.shownAs]}
                          {target.zoneLabel ? ` ${t('findingZone', { zone: target.zoneLabel })}` : ''}
                        </p>
                      ) : null}
                      {target.title ? (
                        <p className="mt-1 text-sm font-medium text-gray-900">
                          {target.type === 'comment' ? t('inThread', { title: target.title }) : target.title}
                        </p>
                      ) : null}
                      {target.excerpt ? <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800">{target.excerpt}</p> : null}
                      {target.images.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {target.images.map((url, idx) => (
                            <img key={`${url}-${idx}`} src={url} alt="" className="h-20 w-20 rounded object-cover" />
                          ))}
                        </div>
                      ) : null}
                      {target.postId && target.threadVisible ? (
                        <Link href={`/forum/${target.postId}`} className="mt-2 inline-flex text-xs font-medium text-forest-800 hover:underline">
                          {t('openThread')}
                        </Link>
                      ) : null}
                      {target.type === 'finding' ? <p className="mt-2 text-xs text-gray-600">{t('findingNote')}</p> : null}
                      {findingId}
                    </>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {target.canHide && !target.isHidden ? (
                    <Button size="sm" variant="danger" loading={busy} onClick={() => void run(report.id, 'hide')}>
                      {t('hide')}
                    </Button>
                  ) : null}
                  {target.canHide && target.isHidden ? (
                    <Button size="sm" variant="outline" loading={busy} onClick={() => void run(report.id, 'unhide')}>
                      {t('unhide')}
                    </Button>
                  ) : null}
                  {report.status === 'pending' ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(report.id, 'reviewed')}>
                      {t('markReviewed')}
                    </Button>
                  ) : null}
                  {open ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(report.id, 'resolve')}>
                      {t('markResolved')}
                    </Button>
                  ) : null}
                  {open ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(report.id, 'dismiss')}>
                      {t('dismiss')}
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        {!isLoading && !error && reports.length === 0 ? (
          <p className="text-sm text-gray-700">{filter === 'pending' ? t('noOpenReports') : t('noReports')}</p>
        ) : null}

        <div className="flex flex-wrap gap-4">
          <Link href="/forum" className="inline-flex text-sm font-medium text-forest-800 hover:underline">
            {t('backToForum')}
          </Link>
          <Link href="/admin/forum-trust" className="inline-flex text-sm font-medium text-forest-800 hover:underline">
            {t('forumTrustAdmin')}
          </Link>
        </div>
      </section>
    </PageWrapper>
  );
}
