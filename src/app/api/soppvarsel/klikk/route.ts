import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { regionFromSlug, regionSlug } from '@/lib/prediction/region-slug';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey } from '@/lib/rate-limit/route';
import { AKTIVERING_MIN_MS } from '@/lib/rapport/dagsrapport';

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

  // Samme tak som avmeldingsruta: anonym GET som skriver til databasen skal
  // ikke kunne kjøres i tusentall. Over taket: bare videresend.
  const rl = checkRateLimit(`soppvarsel-klikk:${getClientKey(request, null)}`, 60, 60);

  if (rl.allowed && UUID.test(token)) {
    try {
      const db = createAdminClient();
      const naa = new Date();
      const naaIso = naa.toISOString();
      // Skanner eller menneske avgjøres HER, mot varselet klikket hører til —
      // ikke i rapporten. E-postskannere (Safe Links o.l.) følger lenka innen
      // sekunder etter levering; et klikk minst ti minutter etter utsendingen
      // er et menneske. forste_apnet_at settes derfor først ved et slikt klikk,
      // så et skannerklikk aldri låser raden — verken som «aktivert» ved neste
      // varsel eller som «ikke aktivert» for alltid.
      const { data: rad } = await db
        .from('alert_subscriptions')
        .select('last_notified_at,forste_apnet_at')
        .eq('unsubscribe_token', token)
        .maybeSingle();
      if (rad) {
        const sendt = rad.last_notified_at ? Date.parse(rad.last_notified_at as string) : null;
        const menneske = sendt !== null && naa.getTime() - sendt >= AKTIVERING_MIN_MS;
        const { error } = await db
          .from('alert_subscriptions')
          .update({ sist_apnet_at: naaIso, ...(menneske && !rad.forste_apnet_at ? { forste_apnet_at: naaIso } : {}) })
          .eq('unsubscribe_token', token);
        if (error) log.warn('varselklikk.ikke_lagret', { message: error.message });
        else log.info('varselklikk.ok', { region: region?.name ?? null, menneske });
      }
    } catch (e) {
      log.warn('varselklikk.feilet', { message: e instanceof Error ? e.message : 'ukjent' });
    }
  }

  // ?fra=varsel: middleware skal ikke lese Referer (webmail-verten) som kilde
  // på siden leseren lander på.
  return NextResponse.redirect(`${mal}?fra=varsel`, 303);
}
