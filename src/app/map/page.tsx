import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { createClient } from '@/lib/supabase/server';
import { MushroomMap } from '@/components/map/MushroomMapLazy';
import { logger } from '@/lib/log';

export default async function MapPage() {
  const t = await getTranslations('MapPage');
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Andre lås. Gatingen av /map hang utelukkende i middleware-matcheren, og
  // /map var den eneste beskyttede siden uten en egen sjekk — /profile, /admin
  // og /mine-steder har alle sin. Matcheren unntar allerede alt som slutter på
  // .svg/.png/.jpg/… ; endres den, eller flyttes ruta, ville appens dyreste og
  // mest betalingsnære flate blitt åpen uten at noe annet sa fra.
  if (!user) redirect('/auth/login?redirect=/map');

  let canViewPredictionAdmin = false;
  {
    const { data: roleRow, error: roleError } = await supabase
      .from('moderator_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    // Feiler oppslaget forsvinner admin-lenken stille. Ufarlig (fail closed),
    // men skal være mulig å finne igjen i loggen.
    if (roleError) {
      logger.warn('map.role_lookup_failed', { userId: user.id, message: roleError.message });
    }

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
