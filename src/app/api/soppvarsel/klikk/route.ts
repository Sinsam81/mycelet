import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { regionFromSlug, regionSlug } from '@/lib/prediction/region-slug';

/**
 * Klikk fra varsel-e-posten → områdesiden, med ett notat på veien.
 *
 * Aktivering («abonnenten åpnet områdets prognose etter et varsel») er det
 * ene tallet som skiller en varsling som virker fra en som bare sendes.
 * Kvitteringssiden teller ikke; dette gjør det. Tokenet er det samme som
 * avmeldingslenka i samme e-post bærer, så lenka røper ingenting nytt.
 *
 * Ukjent token → samme videresending, uten notat: ruta skal ikke være et
 * orakel for gyldige tokens. Feiler databasen, sendes leseren videre likevel
 * — hen skal aldri strande på en målelinje.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const token = request.nextUrl.searchParams.get('t') ?? '';
  const slug = request.nextUrl.searchParams.get('r') ?? '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  const region = regionFromSlug(slug);
  const mal = region ? `${appUrl}/soppforhold/${regionSlug(region.name)}` : `${appUrl}/soppforhold`;

  if (UUID.test(token)) {
    try {
      const db = createAdminClient();
      const naa = new Date().toISOString();
      const { error: sistErr } = await db.from('alert_subscriptions').update({ sist_apnet_at: naa }).eq('unsubscribe_token', token);
      const { error: forsteErr } = await db
        .from('alert_subscriptions')
        .update({ forste_apnet_at: naa })
        .eq('unsubscribe_token', token)
        .is('forste_apnet_at', null);
      if (sistErr || forsteErr) log.warn('varselklikk.ikke_lagret', { message: (sistErr ?? forsteErr)?.message });
      else log.info('varselklikk.ok', { region: region?.name ?? null });
    } catch (e) {
      log.warn('varselklikk.feilet', { message: e instanceof Error ? e.message : 'ukjent' });
    }
  }

  return NextResponse.redirect(mal, 303);
}
