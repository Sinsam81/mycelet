'use client';

import Link from 'next/link';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { useModerationReports, useSetReportStatus } from '@/lib/hooks/useForum';
import { Button } from '@/components/ui/Button';

export default function ModerationPage() {
  const { data, isLoading, error } = useModerationReports();
  const setStatus = useSetReportStatus();

  return (
    <PageWrapper>
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Moderasjon</h1>

        <p className="text-sm text-gray-700">
          Hvis denne siden gir tilgangsfeil, mangler brukeren moderatorrettigheter/RLS-policy for globale rapporter.
        </p>

        {isLoading ? <p className="text-sm text-gray-700">Laster rapporter...</p> : null}
        {error ? <p className="text-sm text-red-600">Kunne ikke hente rapporter (sannsynligvis RLS-begrensning).</p> : null}

        <div className="space-y-2">
          {(data ?? []).map((report) => (
            <article key={report.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-sm font-medium text-gray-900">{report.reason}</p>
              <p className="text-sm text-gray-700">Status: {report.status}</p>
              {report.description ? <p className="text-sm text-gray-700">{report.description}</p> : null}
              <p className="mt-1 text-xs text-gray-500">{new Date(report.created_at).toLocaleString('nb-NO')}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ reportId: report.id, status: 'reviewed' })}>
                  Marker som gjennomgått
                </Button>
                <Button size="sm" onClick={() => setStatus.mutate({ reportId: report.id, status: 'resolved' })}>
                  Marker som løst
                </Button>
                <Button size="sm" variant="danger" onClick={() => setStatus.mutate({ reportId: report.id, status: 'dismissed' })}>
                  Avvis
                </Button>
              </div>
            </article>
          ))}
        </div>

        {!isLoading && (data?.length ?? 0) === 0 ? <p className="text-sm text-gray-700">Ingen rapporter tilgjengelig.</p> : null}

        <Link href="/forum" className="inline-flex text-sm font-medium text-forest-800 hover:underline">
          Tilbake til forum
        </Link>
        <Link href="/admin/forum-trust" className="inline-flex text-sm font-medium text-forest-800 hover:underline">
          Forum trust admin
        </Link>
      </section>
    </PageWrapper>
  );
}
