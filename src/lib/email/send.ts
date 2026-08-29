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
 * OPPSETT — GJORT 2026-08-10:
 *   Resend-konto på post@mycelet.com, region Irland (eu-west-1).
 *   Verifisert domene: send.mycelet.com. Nøkkel med «Sending access» alene.
 *   Vercel (Production): RESEND_API_KEY + RESEND_FROM=varsel@send.mycelet.com
 *
 * ⚠️ HVORFOR ET UNDERDOMENE OG IKKE mycelet.com
 *
 * mycelet.com hadde allerede SPF: «v=spf1 include:_spf.domeneshop.no ~all»,
 * fordi post@mycelet.com ligger hos Domeneshop. Standarden tillater ÉN
 * SPF-oppføring per navn — en til, og SPF slutter å virke for hele domenet.
 * Da ville support-adressen, og adressen Apple har, begynt å havne i
 * søppelposten.
 *
 * Med send.mycelet.com havner Resends SPF på send.send.mycelet.com, og roten
 * røres ikke. Verifisert etter oppsettet: mycelet.com har fortsatt nøyaktig én
 * SPF-oppføring. Det gir også reputasjonsskille — en spam-markering på et
 * soppvarsel smitter ikke over på e-post fra mennesker.
 *
 * Avsenderadressen MÅ ligge på det verifiserte domenet. varsel@mycelet.com
 * ville blitt avvist av Resend.
 *
 * (Deno-utgaven i supabase/functions/_shared/email.ts har fortsatt et utdatert
 * notat om mycelet.no. Den sender slettevarsler og er ikke satt opp ennå.)
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

/**
 * Hvilke e-postvariabler mangler? Tom liste betyr at utsending er konfigurert.
 *
 * Egen eksport fordi den stille feilen må kunne oppdages ANDRE steder enn inne
 * i selve sendingen. Soppvarselets nattjobb slår alarm på denne før den i det
 * hele tatt begynner å sende — se src/app/api/cron/soppvarsel/route.ts.
 *
 * Navnene står dermed ett sted i sendekjeden, så en omdøpt variabel ikke
 * etterlater seg en alarm som leter etter noe som ikke finnes lenger.
 */
export function manglendeEpostKonfig(): string[] {
  return (['RESEND_API_KEY', 'RESEND_FROM'] as const).filter((v) => !process.env[v]);
}

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
