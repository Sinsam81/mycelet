import Link from 'next/link';
import { PageWrapper } from '@/components/layout/PageWrapper';

export default function ProfilePage() {
  return (
    <PageWrapper>
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Profil</h1>
        <p className="text-sm text-gray-700">Administrer konto, funn og abonnement.</p>

        <div className="space-y-2">
          <Link
            href="/pricing"
            className="block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-forest-800 hover:bg-forest-50"
          >
            Abonnement og betaling
          </Link>
          <Link
            href="/forum/reports"
            className="block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Mine rapporteringer
          </Link>
        </div>
      </section>
    </PageWrapper>
  );
}
