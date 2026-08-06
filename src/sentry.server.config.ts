import * as Sentry from '@sentry/nextjs';
import { scrubBreadcrumb, scrubEvent } from '@/lib/sentry/scrub';

/**
 * Sentry i Node-runtimen — alle API-ruter og server-komponenter.
 *
 * dataCollection-objektet er FULLSTENDIG med vilje. Se den lange forklaringen
 * i src/instrumentation-client.ts: et delvis objekt slår PÅ alt du ikke nevner.
 *
 * ⚠️ SERVEREN ER FARLIGERE ENN NETTLESEREN. Det er her Supabase-spørringene går
 * (`?user_id=eq.<uuid>`) og her Geonorge spørres om høyde på meteren
 * (`?nord=59.91342&ost=10.74609`). Rensingen ligger i @/lib/sentry/scrub og
 * DELES med klient og edge — nettopp fordi den en gang manglet akkurat her.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  // VERCEL_ENV finnes alltid som server-env på Vercel.
  enabled: process.env.VERCEL_ENV === 'production',
  environment: 'production',

  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    stackFrameVariables: false,
    frameContextLines: 5
  },

  enableLogs: false,
  sampleRate: 1.0,
  maxBreadcrumbs: 20,

  integrations: (defaults) =>
    defaults.filter(
      (integration) =>
        // Console ville gjort hver linje fra src/lib/log/ til en brødsmule —
        // og loggen inneholder bevisst redigerte, men fortsatt interne, felter.
        integration.name !== 'Console' &&
        // LocalVariables sender lokale variabler fra stack frames.
        integration.name !== 'LocalVariables'
    ),

  beforeSend(event, hint) {
    const error = hint?.originalException as { message?: string; code?: string } | undefined;
    const text = `${error?.code ?? ''} ${error?.message ?? ''}`;

    // Oppstrøms-API-er vi ikke eier. De logges allerede av src/lib/log/ og hører
    // hjemme i Vercel-loggen, ikke i en kvote på 5 000 hendelser i måneden.
    if (
      /frost\.met\.no|smhi\.se|kindwise\.com|gbif\.org|nibio\.no|kartverket\.no|geonorge\.no|openweathermap\.org/i.test(
        text
      )
    ) {
      return null;
    }
    if (
      /(ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|UND_ERR_CONNECT_TIMEOUT|fetch failed|AbortError)/i.test(
        text
      )
    ) {
      return null;
    }

    return scrubEvent(event);
  },

  /**
   * Uten denne sto serveren helt uten brødsmulerensing.
   *
   * NodeFetch-integrasjonen lager en brødsmule av HVERT utgående kall og legger
   * hele query-strengen i feltet `http.query`. Verifisert ved kjøring: en
   * hendelse bar med seg både `?select=id&user_id=eq.<uuid>` fra Supabase og
   * `?koordsys=4258&nord=59.91342&ost=10.74609` fra Geonorge. `url`-feltet var
   * allerede sanert av SDK-en — det var sidefeltet som lakk.
   */
  beforeBreadcrumb: scrubBreadcrumb
});
