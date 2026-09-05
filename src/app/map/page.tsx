import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { createClient } from '@/lib/supabase/server';
import { MushroomMap } from '@/components/map/MushroomMapLazy';
import { RegistrerBruksdag } from '@/components/bruk/RegistrerBruksdag';
import { logger } from '@/lib/log';
import { parseMapViewParams, parseSpeciesParam } from '@/lib/utils/map-view-params';

export default async function MapPage({
  searchParams
}: {
  searchParams: Promise<{ mine?: string; lat?: string; lng?: string; zoom?: string; sted?: string; art?: string; artnavn?: string }>;
}) {
  const t = await getTranslations('MapPage');
  // ?mine=1 settes av lagringsflytene: kartet skal åpne med «Kun mine funn»
  // på, så funnet som nettopp ble lagret faktisk synes (private funn er
  // usynlige i standardlaget).
  const sp = await searchParams;
  const { mine, lat, lng, zoom, sted, art, artnavn } = sp;
  // «Best i landet i dag» på forsiden lenker hit med koordinatene til området
  // brukeren trykket på. Ruta deklarerte tidligere bare `mine`, så lat/lng ble
  // forkastet i stillhet og kartet åpnet på brukerens egen posisjon i stedet.
  const initialView = parseMapViewParams({ lat, lng, zoom, sted });
  // «Let etter denne arten» fra artsiden — kartet åpner med arten valgt.
  const initialSpecies = parseSpeciesParam({ art, artnavn });
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Andre lås. Gatingen av /map hang utelukkende i middleware-matcheren, og
  // /map var den eneste beskyttede siden uten en egen sjekk — /profile, /admin
  // og /mine-steder har alle sin. Matcheren unntar allerede alt som slutter på
  // .svg/.png/.jpg/… ; endres den, eller flyttes ruta, ville appens dyreste og
  // mest betalingsnære flate blitt åpen uten at noe annet sa fra.
  if (!user) {
    // Ta med dyplenkens parametre gjennom innloggingen — en utlogget leser som
    // trykker «Let etter denne arten» på den offentlige artsiden skal lande på
    // kartet med arten valgt, ikke på et tomt kart.
    const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === 'string')).toString();
    redirect(`/auth/login?redirect=${encodeURIComponent(qs ? `/map?${qs}` : '/map')}`);
  }

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
        <MushroomMap startWithOnlyMine={mine === '1'} initialView={initialView} initialSpecies={initialSpecies} />
        <RegistrerBruksdag flate="kart" />
      </div>
    </PageWrapper>
  );
}
