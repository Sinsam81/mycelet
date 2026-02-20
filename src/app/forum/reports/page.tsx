'use client';

import Link from 'next/link';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { useMyReports } from '@/lib/hooks/useForum';

const statusLabel: Record<string, string> = {
  pending: 'Venter behandling',
  reviewed: 'Gjennomgått',
  resolved: 'Løst',
  dismissed: 'Avvist'
};

export default function ForumReportsPage() {
  const { data, isLoading, error } = useMyReports();

  return (
    <PageWrapper>
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Mine rapporter</h1>

        {isLoading ? <p className="text-sm text-gray-700">Laster rapporter...</p> : null}
        {error ? <p className="text-sm text-red-600">Kunne ikke hente rapporter.</p> : null}

        <div className="space-y-2">
          {(data ?? []).map((report) => (
            <article key={report.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-sm font-medium text-gray-900">Årsak: {report.reason}</p>
              <p className="mt-1 text-sm text-gray-700">Status: {statusLabel[report.status] ?? report.status}</p>
              {report.description ? <p className="mt-1 text-sm text-gray-700">Notat: {report.description}</p> : null}
              <p className="mt-1 text-xs text-gray-500">{new Date(report.created_at).toLocaleString('nb-NO')}</p>
            </article>
          ))}
        </div>

        {!isLoading && (data?.length ?? 0) === 0 ? <p className="text-sm text-gray-700">Du har ingen rapporter ennå.</p> : null}

        <Link href="/forum" className="inline-flex text-sm font-medium text-forest-800 hover:underline">
          Tilbake til forum
        </Link>
      </section>
    </PageWrapper>
  );
}
