/**
 * Purremail til kontoer som aldri bekreftet e-posten sin.
 *
 * Bakgrunnen (målt 22.08.2026): 3 av 7 nyregistrerte de siste ti dagene
 * bekreftet aldri e-posten — de ville inn, men falt av før de kom i gang.
 * Supabase sender bekreftelsen fra sin egen avsender, som oftere havner i
 * søppelpost enn vårt verifiserte send.mycelet.com. Denne purringen går via
 * Resend med god leveringshistorikk, og lenker til vår egen /auth/confirm —
 * som løser inn et engangs-token server-side og markerer e-posten som
 * bekreftet, UTEN å logge noen inn (adressen er per definisjon ubekreftet og
 * kan tilhøre feil person — se kommentaren i auth/confirm/route.ts).
 *
 * Reglene er bevisst forsiktige:
 *  · ÉN purring per konto, aldri flere (app_metadata.purremail_sendt).
 *  · Tidligst 24 timer etter registrering — Supabases egen e-post skal få
 *    sjansen først.
 *  · Senest 10 døgn etter — eldre kontoer purres ikke; det ville vært mas,
 *    ikke hjelp.
 *
 * Dette er en transaksjonell påminnelse om en handling brukeren selv startet
 * (fullføre sin egen registrering), ikke markedsføring. E-posten sier
 * eksplisitt at den kan ignoreres hvis registreringen ikke var deres.
 *
 * Språket er det kontoen ble opprettet på (user_metadata.sprak) — se
 * byggPurreEpost.
 */

import type { Locale } from '@/i18n/config';

export interface UbekreftetKandidat {
  id: string;
  email?: string;
  created_at?: string;
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
  /**
   * Fra GoTrue-svaret, som alltid har hatt feltet — typen skjulte det bare.
   * Cronen leser `sprak` herfra (satt ved registrering siden 14.09.2026) for å
   * velge språk på e-posten.
   */
  user_metadata?: Record<string, unknown> | null;
}

export const PURRE_TIDLIGST_TIMER = 24;
export const PURRE_SENEST_DOGN = 10;
/** Markøren i app_metadata — server-styrt felt brukeren ikke kan endre selv. */
export const PURRE_MARKOR = 'purremail_sendt';

/**
 * Fristen for hvert enkelt kall cronen gjør mot Supabase Admin-API-et. Uten
 * den holdt et kall som hang hele kjøringen til plattformen drepte den.
 */
export const PURRE_KALL_FRIST_MS = 10_000;

/**
 * Etter så lang tid starter cronen ikke på en ny kandidat. Verste fall for én
 * kandidat er lenke + merking + utsending (10 + 10 + 15 s), og det skal få
 * plass før rutas maxDuration (120 s). De som står igjen er ikke merket, og
 * tas neste dag.
 */
export const PURRE_KJORETID_FRIST_MS = 75_000;

/** Supabase gir av og til 5-sifrede brøkdeler som Date ellers takler fint. */
function tid(s?: string | null): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/**
 * Hvilke kontoer skal purres akkurat nå? Ren funksjon over admin-lista.
 */
export function velgUbekreftede(brukere: UbekreftetKandidat[], naa: Date): UbekreftetKandidat[] {
  const naaMs = naa.getTime();
  const tidligst = PURRE_TIDLIGST_TIMER * 60 * 60 * 1000;
  const senest = PURRE_SENEST_DOGN * 24 * 60 * 60 * 1000;

  return brukere.filter((b) => {
    if (!b.email) return false;
    if (b.email_confirmed_at) return false;
    // Interne kontoer skal aldri purres (de er våre egne).
    if (b.email.endsWith('@mycelet.com')) return false;
    if (b.app_metadata && b.app_metadata[PURRE_MARKOR]) return false;
    const opprettet = tid(b.created_at);
    if (opprettet == null) return false;
    const alder = naaMs - opprettet;
    return alder >= tidligst && alder <= senest;
  });
}

export interface PurreEpost {
  emne: string;
  html: string;
  tekst: string;
}

interface Tekster {
  lang: string;
  emne: string;
  overskrift: string;
  hei: string;
  intro: string;
  knapp: string;
  /** Ren tekst: linja rett over lenka. */
  lenkeIntro: string;
  /** Ren tekst: hva en gjør når lenka har sluttet å virke. */
  utlopt: string;
  /** HTML: de samme to opplysningene under knappen, før og etter lenka til nettstedet. */
  varighetFor: string;
  varighetEtter: string;
  ikkeDeg: string;
  hilsen: string;
}

/**
 * ⚠️ «Glemt passord?» / ”Glömt lösenord?” er KNAPPETEKSTEN på innloggingssiden
 * (AuthLogin.forgotPassword i messages/nb.json og sv.json). E-posten ber mottakeren
 * se etter den, så ordlyden må være den som faktisk står der — testen i
 * __tests__/purre.test.ts sammenligner dem.
 */
const COPY: Record<Locale, Tekster> = {
  nb: {
    lang: 'nb',
    emne: 'Fullfør registreringen din hos Mycelet',
    overskrift: 'Fullfør registreringen din',
    hei: 'Hei!',
    intro:
      'Du opprettet nylig en konto hos Mycelet — soppvarsel, soppkart og artsbibliotek for Norge og Sverige. E-postadressen din ble aldri bekreftet, så kontoen står og venter på deg.',
    knapp: 'Bekreft e-postadressen min',
    lenkeIntro: 'Bekreft e-postadressen din med denne lenken (personlig, kan brukes én gang):',
    utlopt: 'Har lenken sluttet å virke, kan du når som helst bruke «Glemt passord?» på www.mycelet.com — da får du en ny.',
    varighetFor: 'Lenken er personlig og kan brukes én gang. Har den sluttet å virke, bruk «Glemt passord?» på',
    varighetEtter: '— da får du en ny.',
    ikkeDeg:
      'Var det ikke deg som registrerte kontoen, kan du se bort fra denne e-posten — da skjer det ingenting mer.',
    hilsen: 'Skogshilsen,'
  },
  sv: {
    lang: 'sv',
    emne: 'Slutför din registrering hos Mycelet',
    overskrift: 'Slutför din registrering',
    hei: 'Hej!',
    intro:
      'Du skapade nyligen ett konto hos Mycelet — svampprognos, svampkarta och artbibliotek för Norge och Sverige. Din e-postadress bekräftades aldrig, så kontot står och väntar på dig.',
    knapp: 'Bekräfta min e-postadress',
    lenkeIntro: 'Bekräfta din e-postadress med den här länken (personlig, kan användas en gång):',
    utlopt: 'Har länken slutat fungera kan du när som helst använda ”Glömt lösenord?” på www.mycelet.com — då får du en ny.',
    varighetFor: 'Länken är personlig och kan användas en gång. Har den slutat fungera, använd ”Glömt lösenord?” på',
    varighetEtter: '— då får du en ny.',
    ikkeDeg:
      'Var det inte du som registrerade kontot kan du bortse från det här mejlet — då händer inget mer.',
    hilsen: 'Skogshälsningar,'
  }
};

/**
 * Selve e-posten, på språket kontoen ble opprettet på.
 *
 * Den var bare norsk, med begrunnelsen «locale lagres ikke per bruker». Det
 * stemmer ikke lenger: hver registrering siden 14.09.2026 lagrer
 * `user_metadata.sprak`, og prøvepåminnelsene leser det allerede. En svenske
 * som registrerte seg på svensk og aldri bekreftet, fikk den ENE e-posten vi
 * sender for å hente hen inn igjen på norsk, fra en avsender hen ikke kjenner —
 * og en påminnelse på feil språk er verre enn ingen.
 *
 * Språket sendes inn (cronen leser det med sprakFraMetadata). Standard er
 * norsk: kontoer fra før 14.09.2026 har ikke feltet, og det samme gjelder en
 * ugyldig verdi. Språket gjettes ALDRI fra tidssonen — en norskspråklig bruker
 * i Stockholm skal ha norsk.
 *
 * Ingen ny utsending følger av dette: samme ene e-post, samme regler.
 */
export function byggPurreEpost(bekreftLenke: string, locale: Locale = 'nb'): PurreEpost {
  const c = COPY[locale] ?? COPY.nb;

  const tekst = [
    c.hei,
    '',
    c.intro,
    '',
    c.lenkeIntro,
    bekreftLenke,
    '',
    c.utlopt,
    '',
    c.ikkeDeg,
    '',
    c.hilsen,
    'Mycelet',
    'post@mycelet.com'
  ].join('\n');

  const html = `<!doctype html>
<html lang="${c.lang}"><body style="margin:0;padding:0;background:#f5f1e8;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2a22">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
  <p style="font-size:22px;font-weight:700;color:#1a3a24;margin:0 0 20px">🍄 Mycelet</p>
  <div style="background:#ffffff;border-radius:16px;padding:28px 24px">
    <h1 style="font-size:19px;color:#1a3a24;margin:0 0 12px">${c.overskrift}</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px">
      ${c.intro}
    </p>
    <p style="margin:22px 0">
      <a href="${bekreftLenke}"
         style="display:inline-block;background:#2d5016;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:999px">
        ${c.knapp}
      </a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#5b6660;margin:0 0 8px">
      ${c.varighetFor} <a href="https://www.mycelet.com/auth/login" style="color:#2d5016">mycelet.com</a>
      ${c.varighetEtter}
    </p>
    <p style="font-size:13px;line-height:1.6;color:#5b6660;margin:0">
      ${c.ikkeDeg}
    </p>
  </div>
  <p style="font-size:12px;color:#8a938c;margin:18px 0 0">
    Mycelet · <a href="mailto:post@mycelet.com" style="color:#8a938c">post@mycelet.com</a>
  </p>
</div>
</body></html>`;

  return { emne: c.emne, html, tekst };
}
