import type { Locale } from '@/i18n/config';

/**
 * Selve soppvarselet.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ÆRLIGHETEN ER HELE PRODUKTET HER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * En e-post som sier «nå er det sopp i skogen din» og så ikke er det, er verre
 * enn ingen e-post: den brenner tilliten som er hele grunnen til at noen ville
 * betale for dette. Konkurrentene selger kart som lover HVOR. Vi selger NÅR, og
 * det er det eneste vi faktisk kan måle.
 *
 * Derfor sier teksten tre ting eksplisitt:
 *   · tallet gjelder et OMRÅDE, ikke skogen der du står
 *   · vi lover ikke funn, vi sier at forholdene ligger til rette
 *   · ingen app kan si at en sopp er trygg å spise
 *
 * ⚠️ Ikke skriv om dette til noe som lover mer. Samme regel som på /soppforhold
 * (se filhodet der) — posisjonen tåler at noen har flere brukere enn oss, men
 * bare så lenge vi faktisk holder oss til den.
 *
 * ── HVORFOR ETT SPRÅK PER E-POST ────────────────────────────────────────────
 *
 * Slettevarselet i supabase/functions/_shared/email.ts sender begge språk i
 * samme e-post, fordi vi ikke lagrer språk per bruker og cron-jobben aldri kan
 * se MYCELET_LOCALE-cookien. For varsler slipper vi det: språket ble lagret da
 * abonnementet ble satt opp (alert_subscriptions.locale). En svensk mottaker
 * skal ikke måtte rulle forbi norsk tekst for å finne sin egen.
 */

interface VarselEpostArgs {
  region: string;
  fra: number;
  til: number;
  locale: Locale;
  appUrl: string;
  avmeldingsUrl: string;
}

const COPY = {
  nb: {
    emne: (region: string, til: number) => `Soppforholdene i ${region} er på ${til} av 100`,
    tittel: (region: string) => `Det har snudd rundt ${region}`,
    endring: (fra: number, til: number) =>
      `Soppforholdene har gått fra <strong>${fra}</strong> til <strong>${til} av 100</strong> den siste uka.`,
    hvorfor:
      'Tallet er vær og sesong for området: nedbøren de siste to ukene, hvor fuktig marka er, temperaturen, og hvor vi er i sesongen for artene som vokser der.',
    forbehold:
      'Det sier ingenting om skogen der du står. Gammel granskog med mose slår et høyt tall i feil terreng hver gang. Vi lover ikke at du finner sopp — vi sier at forholdene ligger til rette.',
    knapp: 'Se kartet for området ditt',
    sikkerhet:
      'Spis aldri en sopp du ikke har fått bestemt. Ingen app kan si at en sopp er trygg. Er du i tvil, la den stå — eller få den kontrollert.',
    avmeld: 'Vil du ikke ha flere varsler? Meld deg av her.',
    signatur: 'Mycelet — soppvarsel for Norge og Sverige'
  },
  sv: {
    emne: (region: string, til: number) => `Svampförhållandena i ${region} är på ${til} av 100`,
    tittel: (region: string) => `Det har vänt kring ${region}`,
    endring: (fra: number, til: number) =>
      `Svampförhållandena har gått från <strong>${fra}</strong> till <strong>${til} av 100</strong> den senaste veckan.`,
    hvorfor:
      'Talet är väder och säsong för området: nederbörden de senaste två veckorna, hur fuktig marken är, temperaturen, och var vi är i säsongen för arterna som växer där.',
    forbehold:
      'Det säger ingenting om skogen där du står. Gammal granskog med mossa slår ett högt tal i fel terräng varje gång. Vi lovar inte att du hittar svamp — vi säger att förhållandena ligger rätt.',
    knapp: 'Se kartan för ditt område',
    sikkerhet:
      'Ät aldrig en svamp du inte fått bestämd. Ingen app kan säga att en svamp är säker. Är du osäker, låt den stå — eller få den kontrollerad.',
    avmeld: 'Vill du inte ha fler varningar? Avregistrera dig här.',
    signatur: 'Mycelet — svampvarning för Norge och Sverige'
  }
} as const;

export function byggVarselEpost(args: VarselEpostArgs) {
  const t = COPY[args.locale] ?? COPY.nb;
  const kartUrl = `${args.appUrl}/map`;

  const html = `<!doctype html>
<html lang="${args.locale}">
  <body style="font-family: -apple-system, system-ui, sans-serif; color: #1f2937; max-width: 560px; margin: 24px auto; padding: 0 16px;">
    <h1 style="font-size: 20px; font-weight: 600; color: #1A3409; margin-bottom: 8px;">${t.tittel(args.region)}</h1>

    <p style="background: #f0f5ec; padding: 14px; border-radius: 10px; border: 1px solid #cfe0c2; font-size: 16px;">
      ${t.endring(args.fra, args.til)}
    </p>

    <p style="font-size: 14px; line-height: 1.55;">${t.hvorfor}</p>
    <p style="font-size: 14px; line-height: 1.55; color: #4b5563;">${t.forbehold}</p>

    <p style="margin: 26px 0;">
      <a href="${kartUrl}" style="background: #1A3409; color: #ffffff; padding: 12px 22px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 600;">
        ${t.knapp}
      </a>
    </p>

    <p style="background: #fffbeb; border: 1px solid #fbbf24; border-radius: 8px; padding: 12px; font-size: 13px; color: #78350f;">
      ${t.sikkerhet}
    </p>

    <hr style="margin: 28px 0; border: none; border-top: 1px solid #e5e7eb;">
    <p style="font-size: 12px; color: #6b7280;">
      <a href="${args.avmeldingsUrl}" style="color: #6b7280;">${t.avmeld}</a>
    </p>
    <p style="font-size: 12px; color: #9ca3af;">${t.signatur}</p>
  </body>
</html>`;

  // Ren tekst uten HTML-taggene fra endring().
  const endringRen = t.endring(args.fra, args.til).replace(/<\/?strong>/g, '');

  const tekst = `${t.tittel(args.region)}

${endringRen}

${t.hvorfor}

${t.forbehold}

${t.knapp}: ${kartUrl}

${t.sikkerhet}

---
${t.avmeld}
${args.avmeldingsUrl}

${t.signatur}`;

  return { emne: t.emne(args.region, args.til), html, tekst };
}
