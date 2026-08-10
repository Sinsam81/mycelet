import { logger } from '@/lib/log';

/**
 * Resend-utsending fra selve appen.
 *
 * Søsteren til supabase/functions/_shared/email.ts, som gjør det samme fra Deno
 * for slettevarslene. To kopier er ikke ideelt, men de kjører i hver sin runtime
 * med hver sin måte å lese hemmeligheter på (Deno.env mot process.env), og
 * Supabase-funksjonene kan ikke importere fra src/. Kallet er ren fetch mot ett
 * REST-endepunkt, så duplikatet er lite og stabilt — men endrer du oppsettet ett
 * sted, se over det andre.
 *
 * ⚠️ INERT UTEN NØKKEL, MED VILJE. Uten RESEND_API_KEY returnerer funksjonen
 * { ok: false } og logger en advarsel. Cron-jobben fullfører som normalt, raden
 * oppdateres ikke, og brukeren får e-posten neste gang forholdene snur. Samme
 * mønster som RevenueCat-koden: alt skal kunne deployes og testes før
 * kontoen er satt opp.
 *
 * OPPSETT (Sindre, ~10 min):
 *   1. Lag konto på https://resend.com — gratis, 3000 e-poster i måneden
 *   2. Verifiser domenet mycelet.com med DNS-oppføringene Resend gir deg
 *      (SPF + DKIM). DNS ligger hos Domeneshop.
 *   3. Lag en API-nøkkel
 *   4. Vercel → Settings → Environment Variables, Production:
 *        RESEND_API_KEY   = re_...
 *        RESEND_FROM      = varsel@mycelet.com
 *
 *   NB: notatet i Deno-utgaven sier mycelet.no. Det er utdatert — nettstedet er
 *   mycelet.com, og avsenderadressen må ligge på et domene Resend har verifisert.
 */

export interface EpostArgs {
  til: string;
  emne: string;
  html: string;
  tekst: string;
  /**
   * List-Unsubscribe-hodet. Gmail og Outlook viser da en innebygd
   * avmeldingsknapp, og det er den beste forsikringen mot at folk trykker
   * «søppelpost» i stedet — som rammer leveringen for alle andre e-poster også.
   */
  avmeldingsUrl?: string;
}

export interface EpostResultat {
  ok: boolean;
  detalj: string;
}

const RESEND_URL = 'https://api.resend.com/emails';

export async function sendEpost(args: EpostArgs): Promise<EpostResultat> {
  const nokkel = process.env.RESEND_API_KEY;
  const fra = process.env.RESEND_FROM;

  if (!nokkel || !fra) {
    logger.warn('epost.ikke-konfigurert', { emne: args.emne });
    return { ok: false, detalj: 'RESEND_API_KEY eller RESEND_FROM mangler' };
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${nokkel}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Mycelet <${fra}>`,
        to: [args.til],
        subject: args.emne,
        html: args.html,
        text: args.tekst,
        ...(args.avmeldingsUrl
          ? {
              headers: {
                'List-Unsubscribe': `<${args.avmeldingsUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
              }
            }
          : {})
      })
    });

    if (!res.ok) {
      const tekst = await res.text();
      // Ikke logg mottakeradressen — loggeren maskerer e-post, men svaret fra
      // Resend kan inneholde den i klartekst.
      logger.warn('epost.avvist', { status: res.status, detalj: tekst.slice(0, 200) });
      return { ok: false, detalj: `Resend ${res.status}` };
    }

    const data = (await res.json()) as { id?: string };
    return { ok: true, detalj: data?.id ?? 'sendt' };
  } catch (err) {
    logger.error('epost.feilet', { feil: err instanceof Error ? err.message : 'ukjent' });
    return { ok: false, detalj: err instanceof Error ? err.message : 'ukjent feil' };
  }
}
