import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { bearerSecretMatches } from '@/lib/security/secret-compare';
import { manglendeEpostKonfig, sendEpost } from '@/lib/email/send';
import { billingTierLabel } from '@/lib/billing/copy';
import { byggAppProvePaaminnelseEpost, sprakFraMetadata } from '@/lib/billing/prove-paaminnelse';
import {
  ALLE_GRUNNER,
  PAAMINNELSE_KANAL,
  bestemAppProvePaaminnelse,
  erGratisuke,
  sendtNokkel,
  type AppProveRad
} from '@/lib/billing/prove-paaminnelse-app';
import { lagProveSvarToken, proveSvarHemmelighet, proveSvarUrl } from '@/lib/billing/prove-svar-token';
import { osloDag } from '@/lib/bruk/bruksdag';

/**
 * Påminnelse før første belastning for prøver kjøpt i App Store
 * (migrasjon 072). Går hver morgen 06:30 UTC (08:30 Oslo).
 *
 * Apple sender ingen påminnelse før et introduksjonstilbud blir til et
 * trekk, så dagen regnes ut her: prøver som RevenueCat eier, står som
 * trialing, ikke er sandkasse og ikke alt er avsluttet, får e-posten når
 * det er 3 dager igjen — eller 2, hvis 3 gikk tapt. Reglene og teksten er
 * rene og testet (src/lib/billing/prove-paaminnelse-app.ts og
 * prove-paaminnelse.ts); her er bare I/O-en.
 *
 *   1. Les alle trialing-rader (få; alt annet siles i beslutningen).
 *   2. Les prove_paaminnelser. Svarer ikke tabellen (migrasjonen ikke
 *      kjørt), sendes INGENTING: uten sendt-merket kan vi ikke love «én
 *      gang», og to påminnelser er verre enn én dag for sent.
 *   3. Per rad: beslutning → adresse og språk fra auth → e-post →
 *      RESERVER sendt-raden → send → ved feil: frigi reservasjonen.
 *
 * ── RESERVASJON FØR SENDING, IKKE MERKE ETTER ───────────────────────────────
 *
 * Sendt-raden (user_id, kanal, prove_slutt) settes inn FØR e-posten går.
 * Slår innsettingen feil på nøkkelen (23505), har en annen kjøring alt
 * tatt denne prøven — hopp over. Slår den feil av annen grunn, sendes
 * ingenting: uten merke kan «én gang» ikke loves. Feiler sendingen, slettes
 * raden igjen, så neste morgen prøver på nytt (innenfor vinduet: høyst én
 * gang til). Lar raden seg ikke slette, står den — kunden får da ingen
 * påminnelse, og det logges som feil; det er den riktige siden å feile på.
 *
 * Merket kunne ikke ligge bak sendingen: gikk e-posten og innsettingen
 * feilet, ville neste morgen (2 dager igjen) sendt igjen. Resend-nøkkelen
 * rc/prove-slutt/<user_id>/<prove_slutt> holder et døgn, og cronen går
 * hvert døgn — om den neste sendingen ble avvist eller levert, hang på
 * sekunders slingring. Nøkkelen sendes fortsatt, som et nett til, men
 * tabellen er garantien.
 *
 * Loggen får tall, aldri adresser. Bruker-ID-er er interne og passerer.
 */

export const maxDuration = 60;

interface SendtRad {
  user_id: string;
  prove_slutt: string;
}

/** Postgres unique_violation — nøkkelen finnes alt. */
const NOKKEL_FINNES = '23505';

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  if (!bearerSecretMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Ikke autorisert' }, { status: 401 });
  }

  const mangler = manglendeEpostKonfig();
  if (mangler.length > 0) {
    log.warn('prove_paaminnelse_app.epost_ikke_konfigurert', { mangler });
    return NextResponse.json({ ok: false, grunn: 'e-post er ikke konfigurert', mangler });
  }
  const hemmelighet = proveSvarHemmelighet();
  if (!hemmelighet) {
    log.error('prove_paaminnelse_app.hemmelighet_mangler');
    return NextResponse.json({ ok: false, grunn: 'tjenestenøkkel mangler' }, { status: 500 });
  }

  const db = createAdminClient();
  const naa = new Date();
  const iDag = osloDag(naa);
  const sendtSek = Math.floor(naa.getTime() / 1000);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mycelet.com';

  const { data: rader, error: lesFeil } = await db
    .from('billing_subscriptions')
    .select('user_id,tier,status,current_period_start,current_period_end,cancel_at_period_end,metadata')
    .eq('status', 'trialing');
  if (lesFeil) {
    log.error('prove_paaminnelse_app.les_feilet', { message: lesFeil.message });
    return NextResponse.json({ ok: false, grunn: 'Kunne ikke lese billing_subscriptions' }, { status: 500 });
  }

  const { data: sendte, error: sendtFeil } = await db.from('prove_paaminnelser').select('user_id,prove_slutt').eq('kanal', PAAMINNELSE_KANAL);
  if (sendtFeil) {
    // Uten sendt-tabellen kan «én gang» ikke loves. Advar og gjør ingenting.
    log.warn('prove_paaminnelse_app.sendt_tabell_svarte_ikke', { message: sendtFeil.message });
    return NextResponse.json({ ok: false, grunn: 'prove_paaminnelser svarte ikke — ingenting sendt' });
  }
  const sendt = new Set(((sendte ?? []) as SendtRad[]).map((r) => sendtNokkel(r.user_id, r.prove_slutt)));

  const telling = { sendt: 0, feilet: 0, hoppetOver: Object.fromEntries(ALLE_GRUNNER.map((g) => [g, 0])) as Record<string, number> };

  for (const rad of (rader ?? []) as AppProveRad[]) {
    const beslutning = bestemAppProvePaaminnelse(rad, iDag, sendt);
    if (!beslutning.send) {
      telling.hoppetOver[beslutning.grunn] += 1;
      continue;
    }

    const { data, error } = await db.auth.admin.getUserById(rad.user_id);
    const email = data?.user?.email;
    if (error || !email) {
      log.warn('prove_paaminnelse_app.ingen_epostadresse', { userId: rad.user_id, message: error?.message });
      telling.feilet += 1;
      continue;
    }
    const locale = sprakFraMetadata(data.user.user_metadata);
    // Plannavnet i teksten. En trialing-rad uten betalt tier finnes ikke i
    // praksis (webhooken ack-er ukjente produkter); «Premium» er reserven.
    const tier = rad.tier === 'season_pass' ? 'season_pass' : 'premium';
    const token = lagProveSvarToken(rad.user_id, beslutning.proveSlutt, sendtSek, hemmelighet);
    const epost = byggAppProvePaaminnelseEpost({
      locale,
      plan: billingTierLabel(tier, locale),
      dagerIgjen: beslutning.dagerIgjen,
      sluttMs: beslutning.proveSluttMs,
      gratisuke: erGratisuke(beslutning.proveLengdeDager),
      svarLenker: {
        omrader: proveSvarUrl(appUrl, token, 'omrader', locale),
        offline: proveSvarUrl(appUrl, token, 'offline', locale),
        ai: proveSvarUrl(appUrl, token, 'ai', locale)
      }
    });

    const nokkel = { user_id: rad.user_id, kanal: PAAMINNELSE_KANAL, prove_slutt: beslutning.proveSlutt };
    const { error: reservasjonFeil } = await db.from('prove_paaminnelser').insert(nokkel);
    if (reservasjonFeil) {
      if (reservasjonFeil.code === NOKKEL_FINNES) {
        log.info('prove_paaminnelse_app.reservert_av_annen', { userId: rad.user_id, proveSlutt: beslutning.proveSlutt });
        telling.hoppetOver['allerede-sendt'] += 1;
      } else {
        log.error('prove_paaminnelse_app.reservasjon_feilet', { userId: rad.user_id, proveSlutt: beslutning.proveSlutt, message: reservasjonFeil.message });
        telling.feilet += 1;
      }
      continue;
    }
    sendt.add(sendtNokkel(rad.user_id, beslutning.proveSlutt));

    let ok = false;
    let detalj = '';
    try {
      const res = await sendEpost({ til: email, ...epost, idempotensNokkel: `rc/prove-slutt/${rad.user_id}/${beslutning.proveSlutt}` });
      ok = res.ok;
      detalj = res.detalj;
    } catch (err) {
      detalj = err instanceof Error ? err.message : 'ukjent';
    }
    if (!ok) {
      log.warn('prove_paaminnelse_app.sending_feilet', { userId: rad.user_id, proveSlutt: beslutning.proveSlutt, detalj });
      telling.feilet += 1;
      const { error: frigiFeil } = await db
        .from('prove_paaminnelser')
        .delete()
        .eq('user_id', nokkel.user_id)
        .eq('kanal', nokkel.kanal)
        .eq('prove_slutt', nokkel.prove_slutt);
      if (frigiFeil) {
        // Raden står, så kunden får ingen påminnelse for denne prøven. Bedre enn to.
        log.error('prove_paaminnelse_app.reservasjon_ikke_frigitt', { userId: rad.user_id, proveSlutt: beslutning.proveSlutt, message: frigiFeil.message });
      }
      continue;
    }

    telling.sendt += 1;
    log.info('prove_paaminnelse_app.sendt', {
      userId: rad.user_id,
      proveSlutt: beslutning.proveSlutt,
      dagerIgjen: beslutning.dagerIgjen,
      proveLengdeDager: beslutning.proveLengdeDager,
      locale
    });
  }

  log.info('prove_paaminnelse_app.ferdig', { iDag, rader: (rader ?? []).length, ...telling });
  return NextResponse.json({ ok: true, iDag, rader: (rader ?? []).length, ...telling });
}
