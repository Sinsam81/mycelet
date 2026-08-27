import { describe, expect, it } from 'vitest';

/**
 * Helsesjekken må si fra om appen kan sende e-post i det hele tatt.
 *
 * Uten den er utsendingen en STILLE feil: mangler RESEND_API_KEY eller
 * RESEND_FROM, svarer src/lib/email/send.ts {ok:false} i stedet for å kaste,
 * soppvarselets nattjobb kjører videre, regionscorene skrives som normalt — og
 * ingen e-post går ut. Alt ser friskt ut.
 *
 * Feilen rammer bare folk som har BEDT om å høre fra oss, og de opplever den
 * som taushet — nøyaktig det varselet lover når forholdene ikke har snudd. Den
 * kan altså vare en hel sesong uten at noen oppdager den.
 *
 * Testen leser ruta som tekst (samme teknikk som edibility-asymmetry.test.ts):
 * det som skal låses er at sjekken FINNES, at den kjører i den raske
 * varianten, og at den teller inn i statuskoden.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs') as typeof import('node:fs');
const kilde = fs.readFileSync(new URL('../route.ts', import.meta.url), 'utf8');

describe('helsesjekkens e-postsjekk', () => {
  it('dekker begge variablene utsendingen faktisk trenger', () => {
    expect(kilde).toContain('function checkEpost');
    expect(kilde).toContain('RESEND_API_KEY');
    expect(kilde).toContain('RESEND_FROM');
  });

  it('kjører også i ?fast=1 — det er varianten en probe kaller ofte', () => {
    // Ligger sjekken bak fast-grenen, ser en hyppig probe aldri feilen den
    // er laget for å fange.
    const foerFastGrenen = kilde.slice(0, kilde.indexOf('if (!fast)'));
    expect(foerFastGrenen).toContain('epost: checkEpost()');
  });

  it('teller IKKE mot 503 — appen serverer fint uten e-post', () => {
    // Første forsøk lot den telle med. Da ble /api/health 503 i lokal dev og i
    // `npm run qa`, der RESEND aldri er satt — og e2e/public-api.e2e.ts feilet
    // hardt. En helsetest som alltid er rød blir ignorert, og da hjelper den
    // ingen. Feilen skal SYNES, ikke felle appen.
    expect(kilde).toContain('const { epost, ...oppetidssjekker } = checks');
    expect(kilde).toMatch(/const allOk = Object\.values\(oppetidssjekker\)\.every/);
  });

  it('logger uansett, så den ene feilen som ikke feller appen ikke blir usynlig', () => {
    expect(kilde).toContain('health.epost_ikke_konfigurert');
  });

  it('sier OM variablene er satt, aldri hva de er — ruta er offentlig', () => {
    const funksjon = kilde.slice(kilde.indexOf('function checkEpost'), kilde.indexOf('async function checkDatabase'));
    expect(funksjon).toContain('mangler:');
    // Verdien må aldri interpoleres inn i meldingen.
    expect(funksjon).not.toMatch(/\$\{process\.env\.RESEND/);
  });
});
