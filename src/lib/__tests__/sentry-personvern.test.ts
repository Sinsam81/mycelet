import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Sentry-oppsettet har tre feilmoduser som alle er STILLE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVORFOR DETTE ER EN TEST OG IKKE EN KOMMENTAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ingen av de tre gir en feilmelding. Alt ser ut til å virke:
 *
 *   1. Mangler Sentry-verten i CSP, blokkerer nettleseren hver eneste rapport.
 *      Dashbordet er bare tomt — for alltid.
 *   2. Er `dataCollection` UFULLSTENDIG, slår Sentry PÅ alt du ikke nevnte.
 *      Verifisert i @sentry/core: `options.dataCollection != null ? DEFAULTS : …`
 *      der hver verdi i DEFAULTS er `true`. Da sender vi cookies, headere,
 *      forespørselsinnhold og GPS-koordinater — stikk i strid med det vi har
 *      erklært til Apple.
 *   3. Ligger init-koden i `sentry.client.config.ts`, kjører den ikke i det hele
 *      tatt. SDK-en advarer selv: «When using Turbopack sentry.client.config.ts
 *      will no longer work».
 *
 * App Privacy hos Apple sier nå «Diagnostics — Not Linked to You». Den
 * erklæringen hviler på at konfigurasjonen under faktisk er som den er.
 */

const ROT = process.cwd();
const les = (p: string) => readFileSync(join(ROT, p), 'utf8');

describe('Sentry: CSP slipper rapportene gjennom', () => {
  it('har Sentry-verten i connect-src', () => {
    const csp = les('next.config.js');
    const linje = csp.split('\n').find((l) => l.includes('connect-src'));
    expect(linje, 'fant ingen connect-src').toBeTruthy();
    expect(
      linje,
      'CSP-en er HÅNDHEVENDE. Uten Sentry-verten blokkeres hver rapport stille.'
    ).toMatch(/ingest\.de\.sentry\.io/);
  });

  it('bruker EU-regionen, som personvernerklæringen lover', () => {
    // `.de.` er EU. Byttes organisasjonen til USA, må BÅDE denne verten og
    // teksten «dataene lagres i EU» i personvernerklæringen endres.
    expect(les('next.config.js')).toMatch(/ingest\.de\.sentry\.io/);
  });
});

describe('Sentry: datainnsamlingen er slått av', () => {
  // Alle elleve nøklene resolveDataCollectionOptions leser. Utelates én, faller
  // den tilbake på DEFAULTS — der alt er true.
  const NØKLER = [
    'userInfo',
    'cookies',
    'httpHeaders',
    'httpBodies',
    'urlQueryParams',
    'graphQL',
    'genAI',
    'databaseQueryData',
    'stackFrameVariables',
    'frameContextLines'
  ];

  const FILER = [
    'src/instrumentation-client.ts',
    'src/sentry.server.config.ts',
    'src/sentry.edge.config.ts'
  ];

  for (const fil of FILER) {
    it(`${fil} setter ALLE dataCollection-nøklene`, () => {
      const t = les(fil);
      const mangler = NØKLER.filter((k) => !new RegExp(`\\b${k}\\s*:`).test(t));
      expect(
        mangler,
        `Uspesifiserte nøkler faller tilbake på DEFAULTS, der alt er true. ` +
          `Et delvis objekt slår altså PÅ innsamling. Mangler: ${mangler.join(', ')}`
      ).toEqual([]);
    });

    it(`${fil} sender ikke brukerinfo`, () => {
      expect(les(fil)).toMatch(/userInfo:\s*false/);
    });
  }

  it('setter ikke tracesSampleRate — det ville vært Performance Data', () => {
    // Vi erklærte Crash Data og Other Diagnostic Data til Apple, IKKE
    // Performance Data. Tracing ville gjort erklæringen ufullstendig.
    for (const fil of FILER) {
      expect(les(fil), `${fil} setter tracesSampleRate`).not.toMatch(
        /^\s*tracesSampleRate\s*:/m
      );
    }
  });

  it('filtrerer bort BrowserSession — det ville vært Usage Data', () => {
    // browserSessionIntegration ligger i standardlista og sender en sesjon ved
    // hver sidelasting. Navnet er verifisert mot @sentry/browser.
    expect(les('src/instrumentation-client.ts')).toMatch(/'BrowserSession'/);
  });
});

describe('Sentry: filnavnene virker under Turbopack', () => {
  it('bruker instrumentation-client.ts', () => {
    expect(existsSync(join(ROT, 'src/instrumentation-client.ts'))).toBe(true);
  });

  it('har IKKE sentry.client.config.ts — den er død under Turbopack', () => {
    for (const død of ['sentry.client.config.ts', 'src/sentry.client.config.ts']) {
      expect(
        existsSync(join(ROT, død)),
        `${død} kjører ikke under Turbopack. Har du begge, kalles init() to ganger.`
      ).toBe(false);
    }
  });
});

describe('Sentry: erklæringene henger sammen', () => {
  it('Apple-manifestet har de to diagnosetypene, begge som «ikke koblet»', () => {
    const x = les('ios/App/App/PrivacyInfo.xcprivacy');
    for (const type of ['CrashData', 'OtherDiagnosticData']) {
      expect(x, `NSPrivacyCollectedDataType${type} mangler i manifestet`).toMatch(
        new RegExp(`NSPrivacyCollectedDataType${type}`)
      );
    }
    // Ingen sporingsdomener: Apple BLOKKERER nettverkskall til domener i den
    // lista når ATT-tillatelse mangler — feilrapporteringen ville dødd stille.
    expect(x).not.toMatch(/NSPrivacyTrackingDomains<\/key>\s*<array>\s*<string>/);
  });

  it('personvernerklæringen navngir Sentry på BEGGE språk', () => {
    // Legges den bare i nb.json, får svenske brukere en erklæring som utelater
    // en databehandler — samme feilklasse som de svenske artsnavnene.
    for (const lang of ['nb', 'sv']) {
      const m = JSON.parse(les(`messages/${lang}.json`));
      expect(m.Personvern?.processorSentryDesc, `${lang}.json mangler Sentry`).toBeTruthy();
    }
    expect(les('src/app/personvern/page.tsx')).toMatch(/processorSentryDesc/);
  });
});
