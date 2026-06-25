import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { createClient } from '@/lib/supabase/server';
import { MushroomMap } from '@/components/map/MushroomMapLazy';

export default async function MapPage() {
  const t = await getTranslations('MapPage');
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
          <h1 className="font-serif text-2xl font-bold tracking-tight text-forest-900">{t('title')}</h1>
          {canViewPredictionAdmin ? (
            <Link href="/admin/prediction" className="text-xs font-medium text-forest-800 hover:underline">
              {t('predictionAdmin')}
            </Link>
          ) : null}
        </div>
        <MushroomMap />
      </div>
    </PageWrapper>
  );
}
