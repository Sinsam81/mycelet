import type { Locale } from '@/i18n/config';

/**
 * «Lag nytt passord»-e-posten vi sender selv (via Resend), i stedet for
 * Supabases egen gjenopprettingsmail.
 *
 * Hvorfor vår egen: Supabases lenke er en PKCE-kode som bare kan løses inn i
 * nettleseren som ba om den. Fra appen (WKWebView) åpner e-postlenka alltid i
 * Safari, som ikke har nøkkelen — så en app-bruker som glemte passordet kom
 * aldri videre. Lenka her bærer et `token_hash` som /auth/reset løser inn
 * uansett nettleser. Se src/app/api/auth/glemt-passord/route.ts.
 *
 * Transaksjonell e-post om en handling mottakeren selv startet — ingen
 * avmeldingslenke, og den sier tydelig at den kan ignoreres.
 */

/** Fast opphav — aldri forespørselens Origin-hode (ville gjort lenka styrbar utenfra). */
export const RESET_BASE_URL = 'https://www.mycelet.com/auth/reset';

export function lagResetLenke(hashedToken: string): string {
  return `${RESET_BASE_URL}?token_hash=${encodeURIComponent(hashedToken)}`;
}

export interface GlemtPassordEpost {
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
  lenkeIntro: string;
  varighet: string;
  ikkeDeg: string;
  hilsen: string;
}

const COPY: Record<Locale, Tekster> = {
  nb: {
    lang: 'nb',
    emne: 'Lag nytt passord hos Mycelet',
    overskrift: 'Lag nytt passord',
    hei: 'Hei!',
    intro:
      'Du har bedt om å lage nytt passord til Mycelet-kontoen din. Trykk på knappen under og velg et nytt.',
    knapp: 'Velg nytt passord',
    lenkeIntro: 'Lag nytt passord med denne lenken:',
    varighet:
      'Lenken er personlig og kan brukes én gang. Den virker i hvilken som helst nettleser — også når du ba om den fra Mycelet-appen.',
    ikkeDeg:
      'Ba du ikke om dette, kan du se bort fra denne e-posten — passordet ditt er uendret.',
    hilsen: 'Skogshilsen,'
  },
  sv: {
    lang: 'sv',
    emne: 'Skapa nytt lösenord hos Mycelet',
    overskrift: 'Skapa nytt lösenord',
    hei: 'Hej!',
    intro:
      'Du har bett om att skapa ett nytt lösenord till ditt Mycelet-konto. Tryck på knappen nedan och välj ett nytt.',
    knapp: 'Välj nytt lösenord',
    lenkeIntro: 'Skapa ett nytt lösenord med den här länken:',
    varighet:
      'Länken är personlig och kan användas en gång. Den fungerar i vilken webbläsare som helst — även när du bad om den från Mycelet-appen.',
    ikkeDeg:
      'Om du inte bad om detta kan du bortse från det här mejlet — ditt lösenord är oförändrat.',
    hilsen: 'Skogshälsningar,'
  }
};

export function byggGlemtPassordEpost(lenke: string, locale: Locale): GlemtPassordEpost {
  const c = COPY[locale] ?? COPY.nb;

  const tekst = [
    c.hei,
    '',
    c.intro,
    '',
    c.lenkeIntro,
    lenke,
    '',
    c.varighet,
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
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px">${c.intro}</p>
    <p style="margin:22px 0">
      <a href="${lenke}"
         style="display:inline-block;background:#2d5016;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:999px">
        ${c.knapp}
      </a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#5b6660;margin:0 0 8px">${c.varighet}</p>
    <p style="font-size:13px;line-height:1.6;color:#5b6660;margin:0">${c.ikkeDeg}</p>
  </div>
  <p style="font-size:12px;color:#8a938c;margin:18px 0 0">
    Mycelet · <a href="mailto:post@mycelet.com" style="color:#8a938c">post@mycelet.com</a>
  </p>
</div>
</body></html>`;

  return { emne: c.emne, html, tekst };
}
