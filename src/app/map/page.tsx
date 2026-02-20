import dynamic from 'next/dynamic';
import Link from 'next/link';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { createClient } from '@/lib/supabase/server';

const MushroomMap = dynamic(
  () => import('@/components/map/MushroomMap').then((mod) => mod.MushroomMap),
  { ssr: false, loading: () => <p className="text-sm text-gray-700">Laster kart...</p> }
);

export default async function MapPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  let canViewPredictionAdmin = false;
  if (user) {
    const { data: roleRow } = await supabase
      .from('moderator_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    canViewPredictionAdmin = roleRow?.role === 'moderator' || roleRow?.role === 'admin';
  }

  return (
    <PageWrapper>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">SoppKart</h1>
          {canViewPredictionAdmin ? (
            <Link href="/admin/prediction" className="text-xs font-medium text-forest-800 hover:underline">
              Prediction admin
            </Link>
          ) : null}
        </div>
        <MushroomMap />
      </div>
    </PageWrapper>
  );
}
