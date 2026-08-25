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
 */

export interface UbekreftetKandidat {
  id: string;
  email?: string;
  created_at?: string;
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
}

export const PURRE_TIDLIGST_TIMER = 24;
export const PURRE_SENEST_DOGN = 10;
/** Markøren i app_metadata — server-styrt felt brukeren ikke kan endre selv. */
export const PURRE_MARKOR = 'purremail_sendt';

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

/**
 * Selve e-posten. Norsk — alle registreringene så langt er norske, og en
 * påminnelse på feil språk er verre enn ingen. Vurder sv-variant når svenske
 * registreringer faktisk dukker opp (locale lagres ikke per bruker i dag).
 */
export function byggPurreEpost(bekreftLenke: string): PurreEpost {
  const emne = 'Fullfør registreringen din hos Mycelet';

  const tekst = [
    'Hei!',
    '',
    'Du opprettet nylig en konto hos Mycelet — soppvarsel, soppkart og',
    'artsbibliotek for Norge og Sverige. E-postadressen din ble aldri',
    'bekreftet, så kontoen står og venter på deg.',
    '',
    'Bekreft e-postadressen din med denne lenken (personlig, kan brukes én gang):',
    bekreftLenke,
    '',
    'Har lenken sluttet å virke, kan du når som helst bruke «Glemt passord?»',
    'på www.mycelet.com — da får du en ny.',
    '',
    'Var det ikke deg som registrerte kontoen, kan du se bort fra denne',
    'e-posten — da skjer det ingenting mer.',
    '',
    'Skogshilsen,',
    'Mycelet',
    'post@mycelet.com'
  ].join('\n');

  const html = `<!doctype html>
<html lang="nb"><body style="margin:0;padding:0;background:#f5f1e8;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2a22">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
  <p style="font-size:22px;font-weight:700;color:#1a3a24;margin:0 0 20px">🍄 Mycelet</p>
  <div style="background:#ffffff;border-radius:16px;padding:28px 24px">
    <h1 style="font-size:19px;color:#1a3a24;margin:0 0 12px">Fullfør registreringen din</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px">
      Du opprettet nylig en konto hos Mycelet — soppvarsel, soppkart og
      artsbibliotek for Norge og Sverige. E-postadressen din ble aldri
      bekreftet, så kontoen står og venter på deg.
    </p>
    <p style="margin:22px 0">
      <a href="${bekreftLenke}"
         style="display:inline-block;background:#2d5016;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:999px">
        Bekreft e-postadressen min
      </a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#5b6660;margin:0 0 8px">
      Lenken er personlig og kan brukes én gang. Har den sluttet å virke, bruk
      «Glemt passord?» på <a href="https://www.mycelet.com/auth/login" style="color:#2d5016">mycelet.com</a>
      — da får du en ny.
    </p>
    <p style="font-size:13px;line-height:1.6;color:#5b6660;margin:0">
      Var det ikke deg som registrerte kontoen, kan du se bort fra denne
      e-posten — da skjer det ingenting mer.
    </p>
  </div>
  <p style="font-size:12px;color:#8a938c;margin:18px 0 0">
    Mycelet · <a href="mailto:post@mycelet.com" style="color:#8a938c">post@mycelet.com</a>
  </p>
</div>
</body></html>`;

  return { emne, html, tekst };
}
