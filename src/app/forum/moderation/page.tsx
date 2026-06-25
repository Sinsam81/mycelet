'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { useModerationReports, useSetReportStatus } from '@/lib/hooks/useForum';
import { Button } from '@/components/ui/Button';

export default function ModerationPage() {
  const t = useTranslations('ForumModeration');
  const { data, isLoading, error } = useModerationReports();
  const setStatus = useSetReportStatus();

  return (
    <PageWrapper>
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">{t('title')}</h1>

        <p className="text-sm text-gray-700">
          {t('accessHint')}
        </p>

        {isLoading ? <p className="text-sm text-gray-700">{t('loading')}</p> : null}
        {error ? <p className="text-sm text-red-600">{t('loadError')}</p> : null}

        <div className="space-y-2">
          {(data ?? []).map((report) => (
            <article key={report.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-sm font-medium text-gray-900">{report.reason}</p>
              <p className="text-sm text-gray-700">{t('statusLabel')} {report.status}</p>
              {report.description ? <p className="text-sm text-gray-700">{report.description}</p> : null}
              <p className="mt-1 text-xs text-gray-500">{new Date(report.created_at).toLocaleString('nb-NO')}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ reportId: report.id, status: 'reviewed' })}>
                  {t('markReviewed')}
                </Button>
                <Button size="sm" onClick={() => setStatus.mutate({ reportId: report.id, status: 'resolved' })}>
                  {t('markResolved')}
                </Button>
                <Button size="sm" variant="danger" onClick={() => setStatus.mutate({ reportId: report.id, status: 'dismissed' })}>
                  {t('dismiss')}
                </Button>
              </div>
            </article>
          ))}
        </div>

        {!isLoading && (data?.length ?? 0) === 0 ? <p className="text-sm text-gray-700">{t('noReports')}</p> : null}

        <Link href="/forum" className="inline-flex text-sm font-medium text-forest-800 hover:underline">
          {t('backToForum')}
        </Link>
        <Link href="/admin/forum-trust" className="inline-flex text-sm font-medium text-forest-800 hover:underline">
          {t('forumTrustAdmin')}
        </Link>
      </section>
    </PageWrapper>
  );
}
