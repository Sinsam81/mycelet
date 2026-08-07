import * as Sentry from '@sentry/nextjs';

/**
 * Next.js' offisielle instrumenteringshook.
 *
 * `onRequestError` er den ENESTE veien til feil som kastes inne i Server
 * Components og route handlers — de når aldri klientens Sentry-init.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
