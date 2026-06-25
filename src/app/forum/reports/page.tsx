'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { useMyReports } from '@/lib/hooks/useForum';

export default function ForumReportsPage() {
  const t = useTranslations('ForumReports');
  const { data, isLoading, error } = useMyReports();

  const statusLabel: Record<string, string> = {
    pending: t('statusPending'),
    reviewed: t('statusReviewed'),
    resolved: t('statusResolved'),
    dismissed: t('statusDismissed')
  };

  return (
    <PageWrapper>
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">{t('title')}</h1>

        {isLoading ? <p className="text-sm text-gray-700">{t('loading')}</p> : null}
        {error ? <p className="text-sm text-red-600">{t('loadError')}</p> : null}

        <div className="space-y-2">
          {(data ?? []).map((report) => (
            <article key={report.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-sm font-medium text-gray-900">{t('reason')} {report.reason}</p>
              <p className="mt-1 text-sm text-gray-700">{t('status')} {statusLabel[report.status] ?? report.status}</p>
              {report.description ? <p className="mt-1 text-sm text-gray-700">{t('note')} {report.description}</p> : null}
              <p className="mt-1 text-xs text-gray-500">{new Date(report.created_at).toLocaleString('nb-NO')}</p>
            </article>
          ))}
        </div>

        {!isLoading && (data?.length ?? 0) === 0 ? <p className="text-sm text-gray-700">{t('empty')}</p> : null}

        <Link href="/forum" className="inline-flex text-sm font-medium text-forest-800 hover:underline">
          {t('backToForum')}
        </Link>
      </section>
    </PageWrapper>
  );
}
