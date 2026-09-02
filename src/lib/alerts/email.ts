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
  /** Beste dag i 7-dagersutsikten — valgfri: mangler prognosen, mangler linja. */
  toppdag?: { dag: string; score: number; erIDag: boolean } | null;
  /** Ferdig lokaliserte artsnavn i sesong nå — valgfri, samme regel. */
  arter?: string[];
  /** Fasit for FORRIGE varsel i regionen — kun når tallene er modne (fasit.ts). */
  fasit?: { dato: string; ukenEtter: number; ukenFor: number } | null;
}

const COPY = {
  nb: {
    emne: (region: string, til: number) => `Soppforholdene i ${region} er på ${til} av 100`,
    tittel: (region: string) => `Det har snudd rundt ${region}`,
    endring: (fra: number, til: number) =>
      `Soppforholdene har gått fra <strong>${fra}</strong> til <strong>${til} av 100</strong> den siste uka.`,
    hvorfor:
      'Tallet er vær, sesong og skogtype for området: nedbøren de siste to ukene, hvor fuktig marka er, temperaturen, hvor vi er i sesongen for artene som vokser der, og om treslaget i området passer dem.',
    forbehold:
      'Det sier ingenting om skogen der du står. Gammel granskog med mose slår et høyt tall i feil terreng hver gang. Vi lover ikke at du finner sopp — vi sier at forholdene ligger til rette.',
    fasit: (dato: string, etter: number, foer: number) =>
      `Fasit for forrige varsel (${dato}): uken etter ble det registrert ${etter} sopfunn i området, mot ${foer} uken før. Kilder: Artsobservasjoner/GBIF og Mycelet-brukere. Vi publiserer fasiten uansett utfall — se hele loggen på mycelet.com/apenhet.`,
    toppdagIDag: (score: number) =>
      `Utsikten fremover: i dag ser ut til å bli ukas beste dag (${score} av 100).`,
    toppdag: (dag: string, score: number) =>
      `Utsikten fremover: best ${dag} (${score} av 100) — samme tall som 7-dagersstripa i appen.`,
    arter: (liste: string) => `I sesong nå: ${liste}.`,
    knapp: 'Se kartet for området ditt',
    sikkerhet:
      'Spis aldri en sopp du ikke har fått bestemt. Ingen app kan si at en sopp er trygg. Er du i tvil, la den stå — eller få den kontrollert.',
    avmeld: 'Vil du ikke ha flere varsler? Meld deg av her.',
    folgX: 'Omslagene og fasiten publiseres også åpent på X — følg @mycelet.',
    signatur: 'Mycelet — soppvarsel for Norge og Sverige'
  },
  sv: {
    emne: (region: string, til: number) => `Svampförhållandena i ${region} är på ${til} av 100`,
    tittel: (region: string) => `Det har vänt kring ${region}`,
    endring: (fra: number, til: number) =>
      `Svampförhållandena har gått från <strong>${fra}</strong> till <strong>${til} av 100</strong> den senaste veckan.`,
    hvorfor:
      'Talet är väder, säsong och skogstyp för området: nederbörden de senaste två veckorna, hur fuktig marken är, temperaturen, var vi är i säsongen för arterna som växer där, och om trädslaget i området passar dem.',
    forbehold:
      'Det säger ingenting om skogen där du står. Gammal granskog med mossa slår ett högt tal i fel terräng varje gång. Vi lovar inte att du hittar svamp — vi säger att förhållandena ligger rätt.',
    fasit: (dato: string, etter: number, foer: number) =>
      `Facit för förra varningen (${dato}): veckan efter registrerades ${etter} svampfynd i området, mot ${foer} veckan innan. Källor: Artsobservasjoner/GBIF och Mycelet-användare. Vi publicerar facit oavsett utfall — se hela loggen på mycelet.com/apenhet.`,
    toppdagIDag: (score: number) =>
      `Utsikten framöver: i dag ser ut att bli veckans bästa dag (${score} av 100).`,
    toppdag: (dag: string, score: number) =>
      `Utsikten framöver: bäst ${dag} (${score} av 100) — samma siffra som 7-dagarsremsan i appen.`,
    arter: (liste: string) => `I säsong nu: ${liste}.`,
    knapp: 'Se kartan för ditt område',
    sikkerhet:
      'Ät aldrig en svamp du inte fått bestämd. Ingen app kan säga att en svamp är säker. Är du osäker, låt den stå — eller få den kontrollerad.',
    avmeld: 'Vill du inte ha fler varningar? Avregistrera dig här.',
    folgX: 'Omslagen och facit publiceras också öppet på X — följ @mycelet.',
    signatur: 'Mycelet — svampvarning för Norge och Sverige'
  }
} as const;

const MND: Record<Locale, string[]> = {
  nb: ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'],
  sv: ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']
};

/** «2026-08-14» → «14. august» (nb) / «14 augusti» (sv). */
export function fasitDato(iso: string, locale: Locale): string {
  const [, m, d] = iso.split('-').map(Number);
  const navn = (MND[locale] ?? MND.nb)[(m ?? 1) - 1];
  return locale === 'sv' ? `${d} ${navn}` : `${d}. ${navn}`;
}

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

${
  args.fasit
    ? `\n    <p style="font-size: 13px; line-height: 1.55; color: #4b5563; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px;">📊 ${t.fasit(fasitDato(args.fasit.dato, args.locale), args.fasit.ukenEtter, args.fasit.ukenFor)}</p>`
    : ''
}
    <p style="font-size: 14px; line-height: 1.55;">${t.hvorfor}</p>
    <p style="font-size: 14px; line-height: 1.55; color: #4b5563;">${t.forbehold}</p>
${
  args.toppdag
    ? `\n    <p style="font-size: 14px; line-height: 1.55; font-weight: 600; color: #1A3409;">${
        args.toppdag.erIDag ? t.toppdagIDag(args.toppdag.score) : t.toppdag(args.toppdag.dag, args.toppdag.score)
      }</p>`
    : ''
}${
  args.arter && args.arter.length
    ? `\n    <p style="font-size: 14px; line-height: 1.55;">🍄 ${t.arter(args.arter.join(', '))}</p>`
    : ''
}

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
      <a href="https://x.com/mycelet" style="color: #6b7280;">${t.folgX}</a>
    </p>
    <p style="font-size: 12px; color: #6b7280;">
      <a href="${args.avmeldingsUrl}" style="color: #6b7280;">${t.avmeld}</a>
    </p>
    <p style="font-size: 12px; color: #9ca3af;">${t.signatur}</p>
  </body>
</html>`;

  // Ren tekst uten HTML-taggene fra endring().
  const endringRen = t.endring(args.fra, args.til).replace(/<\/?strong>/g, '');

  const fasitLinje = args.fasit
    ? `\n${t.fasit(fasitDato(args.fasit.dato, args.locale), args.fasit.ukenEtter, args.fasit.ukenFor)}\n`
    : '';
  const toppdagLinje = args.toppdag
    ? `\n${args.toppdag.erIDag ? t.toppdagIDag(args.toppdag.score) : t.toppdag(args.toppdag.dag, args.toppdag.score)}\n`
    : '';
  const arterLinje = args.arter && args.arter.length ? `\n${t.arter(args.arter.join(', '))}\n` : '';

  const tekst = `${t.tittel(args.region)}

${endringRen}
${fasitLinje}
${t.hvorfor}

${t.forbehold}
${toppdagLinje}${arterLinje}
${t.knapp}: ${kartUrl}

${t.sikkerhet}

---
${t.folgX} https://x.com/mycelet
${t.avmeld}
${args.avmeldingsUrl}

${t.signatur}`;

  return { emne: t.emne(args.region, args.til), html, tekst };
}

interface BekreftelsesEpostArgs {
  region: string;
  locale: Locale;
  bekreftUrl: string;
}

/**
 * Bekreftelses-eposten for konto-løse påmeldinger (dobbel opt-in, migrasjon
 * 057). Uten dette steget kunne hvem som helst meldt på andres adresser — og
 * avsender-omdømmet på send.mycelet.com er for dyrt kjøpt til å risikere det.
 * Samme visuelle språk som selve varselet, så bekreftelsen føles som en
 * forsmak, ikke et fremmedelement.
 */
const BEKREFT_COPY = {
  nb: {
    emne: (region: string) => `Bekreft soppvarselet ditt for ${region}`,
    tittel: 'Ett trykk igjen',
    brodtekst: (region: string) =>
      `Du (eller noen med adressen din) ba om soppvarsel for <strong>${region}</strong>. Trykk på knappen for å bekrefte — så sier vi fra når forholdene snur, maks én e-post i uka.`,
    knapp: 'Bekreft soppvarselet',
    ikkeDeg: 'Var det ikke deg? Da kan du trygt ignorere denne e-posten — uten bekreftelse sendes ingenting.',
    signatur: 'Mycelet — soppvarsel for Norge og Sverige'
  },
  sv: {
    emne: (region: string) => `Bekräfta din svampvarning för ${region}`,
    tittel: 'Ett tryck kvar',
    brodtekst: (region: string) =>
      `Du (eller någon med din adress) bad om svampvarning för <strong>${region}</strong>. Tryck på knappen för att bekräfta — så säger vi till när förhållandena vänder, max ett mejl i veckan.`,
    knapp: 'Bekräfta svampvarningen',
    ikkeDeg: 'Var det inte du? Då kan du tryggt ignorera det här mejlet — utan bekräftelse skickas ingenting.',
    signatur: 'Mycelet — svampvarning för Norge och Sverige'
  }
} as const;

export function byggBekreftelsesEpost(args: BekreftelsesEpostArgs) {
  const t = BEKREFT_COPY[args.locale] ?? BEKREFT_COPY.nb;

  const html = `<!doctype html>
<html lang="${args.locale}">
  <body style="font-family: -apple-system, system-ui, sans-serif; color: #1f2937; max-width: 560px; margin: 24px auto; padding: 0 16px;">
    <h1 style="font-size: 20px; font-weight: 600; color: #1A3409; margin-bottom: 8px;">${t.tittel}</h1>
    <p style="font-size: 14px; line-height: 1.55;">${t.brodtekst(args.region)}</p>
    <p style="margin: 26px 0;">
      <a href="${args.bekreftUrl}" style="background: #1A3409; color: #ffffff; padding: 12px 22px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 600;">
        ${t.knapp}
      </a>
    </p>
    <p style="font-size: 13px; color: #6b7280;">${t.ikkeDeg}</p>
    <hr style="margin: 28px 0; border: none; border-top: 1px solid #e5e7eb;">
    <p style="font-size: 12px; color: #9ca3af;">${t.signatur}</p>
  </body>
</html>`;

  const tekst = `${t.tittel}

${t.brodtekst(args.region).replace(/<\/?strong>/g, '')}

${t.knapp}: ${args.bekreftUrl}

${t.ikkeDeg}

${t.signatur}`;

  return { emne: t.emne(args.region), html, tekst };
}
