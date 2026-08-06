import * as Sentry from '@sentry/nextjs';

/**
 * Sentry i edge-runtimen — middleware.ts kjører her, ikke i Node.
 *
 * Uten denne fila er hele auth-gatingen (updateSession + PROTECTED_PATHS)
 * usynlig for Sentry, og det er nettopp der en feil rammer betalende kunder.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
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

  beforeSend(event) {
    delete event.user;
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers;
      delete event.request.query_string;
      if (event.request.url) event.request.url = event.request.url.split('?')[0];
    }
    return event;
  }
});
