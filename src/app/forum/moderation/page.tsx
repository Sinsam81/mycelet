import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { createClient } from '@/lib/supabase/server';
import { ModerationConsole } from './ModerationConsole';

/**
 * Serverside-vakt foran moderasjonskonsollen.
 *
 * Siden var tidligere ren klientkode uten et eneste auth-kall: utlogget ga den
 * 200 med hele konsollen, knappene og en lenke inn i admin-området. Ingen data
 * lakk — RLS på `reports` gjelder uansett — men en side som viser
 * moderatorverktøy til hvem som helst leses som brutt tilgangskontroll, av en
 * Apple-reviewer så vel som av en nysgjerrig bruker.
 *
 * To lag nå, med vilje: middleware (PROTECTED_PATHS) sender utloggede til
 * innlogging, og denne sjekken hindrer at en innlogget ikke-moderator får
 * konsollen. Samme mønster som /admin/prediction.
 */
export default async function ModerationPage() {
  const t = await getTranslations('ForumModeration');
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?redirect=/forum/moderation');
  }

  const { data: roleRow, error: roleError } = await supabase
    .from('moderator_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  // Feilet oppslaget, vet vi ikke om brukeren er moderator. Da er svaret nei:
  // en feil skal aldri kunne leses som en tilgangserklæring.
  const role = roleError ? null : roleRow?.role ?? null;

  if (role !== 'moderator' && role !== 'admin') {
    return (
      <PageWrapper>
        <section className="space-y-3">
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('noAccess')}</p>
          <Link href="/forum" className="inline-flex text-sm font-medium text-forest-800 hover:underline">
            {t('backToForum')}
          </Link>
        </section>
      </PageWrapper>
    );
  }

  return <ModerationConsole />;
}
