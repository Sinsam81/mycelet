import Link from 'next/link';
import { Camera, Calendar, CloudSun, Map, MessageSquare } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';

const seasonNow = ['Kantarell', 'Steinsopp', 'Karljohan', 'Traktkantarell'];

export default function HomePage() {
  return (
    <PageWrapper>
      <section className="space-y-4">
        <Link
          href="/identify"
          className="block rounded-xl bg-forest-800 p-5 text-white shadow-md transition hover:bg-forest-700"
        >
          <div className="flex items-center gap-3">
            <Camera className="h-5 w-5" />
            <div>
              <h1 className="text-lg font-semibold">Identifiser sopp</h1>
              <p className="text-sm text-white/90">Ta bilde eller søk i databasen</p>
            </div>
          </div>
        </Link>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-forest-800" />
            <h2 className="font-semibold">I sesong nå</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {seasonNow.map((name) => (
              <div key={name} className="rounded-lg bg-forest-50 p-3 text-sm font-medium text-forest-900">
                {name}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Map className="h-4 w-4 text-forest-800" />
            <h2 className="font-semibold">Siste funn</h2>
          </div>
          <p className="text-sm text-gray-700">Kommer i Sprint 4 med sanntidsdata fra kartet.</p>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <CloudSun className="h-4 w-4 text-forest-800" />
            <h2 className="font-semibold">Soppforhold i dag</h2>
          </div>
          <p className="text-sm text-gray-700">Værintegrasjon kobles i Sprint 7 via `/api/weather`.</p>
        </div>

        <Link
          href="/pricing"
          className="block rounded-xl border border-forest-100 bg-forest-50 p-4 text-sm font-medium text-forest-900 hover:bg-forest-100"
        >
          Oppgrader til Premium eller Sesongpass for ubegrenset AI-identifikasjon →
        </Link>

        <div className="grid grid-cols-2 gap-3">
          <Link href="/calendar" className="rounded-lg border border-gray-200 bg-white p-3 text-sm font-medium">
            <span className="inline-flex items-center gap-2"><Calendar className="h-4 w-4" /> Kalender</span>
          </Link>
          <Link href="/forum" className="rounded-lg border border-gray-200 bg-white p-3 text-sm font-medium">
            <span className="inline-flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Forum</span>
          </Link>
        </div>
      </section>
    </PageWrapper>
  );
}
