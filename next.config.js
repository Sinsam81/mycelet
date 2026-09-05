/** @type {import('next').NextConfig} */

// Security headers applied to every response. Conservative on purpose so we
// don't break the app on rollout.
//
// Content-Security-Policy is ENFORCING (flipped 2026-06 after a month of
// report-only with no violations surfacing in real use). 'unsafe-eval' is
// dev-only — Turbopack/HMR needs it; production bundles don't. If a new
// third-party SDK is wired in, add its hosts below BEFORE deploying, or the
// browser will block it.
//
// Allowlist sources documented inline below.

// Stripe + Supabase + Wikimedia + Kindwise + Norwegian/Swedish map tile
// providers, plus the weather APIs we hit server-side. If you wire a new
// third-party SDK, add its hosts here BEFORE deploying — the policy is
// enforcing, so a missing host is a silent block in production.
const isDev = process.env.NODE_ENV !== 'production';

const cspDirectives = [
  // Default fallback for resource types not explicitly listed below.
  "default-src 'self'",
  // 'unsafe-inline' is required by Next.js inline hydration scripts (the
  // long-term fix is nonce-based script-src). 'unsafe-eval' only in dev (HMR).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://js.stripe.com https://checkout.stripe.com https://www.googletagmanager.com`,
  // Tailwind / framer-motion / Next inject inline styles.
  "style-src 'self' 'unsafe-inline'",
  // Image sources: own bucket, Wikimedia commons, Plant.id (Kindwise),
  // Norwegian Kartverket tiles, Swedish OpenStreetMap tiles for areas
  // Kartverket doesn't cover. data: + blob: for FileReader uploads.
  // Kindwise serves similar_images from a DigitalOcean Spaces CDN (used as
  // fallback photo in LookAlikeCheck) — *.kindwise.com does NOT cover it.
  "img-src 'self' data: blob: https://*.supabase.co https://upload.wikimedia.org https://*.wikimedia.org https://*.kindwise.com https://mushroom-id.ams3.cdn.digitaloceanspaces.com https://*.kartverket.no https://opencache.statkart.no https://*.tile.openstreetmap.org https://*.arcgisonline.com https://*.google-analytics.com https://*.googletagmanager.com",
  // data: for base64-inlined fonts in CSS.
  "font-src 'self' data:",
  // XHR/fetch/WebSocket destinations. wss://*.supabase.co is for Realtime.
  // The premium offline-map feature and public/sw.js fetch map tiles before
  // putting them in the Cache API. WebKit enforces this directive for service
  // worker fetches too, so every provider in offlineMap.ts must be listed here.
  // Google-domains: GA4 event beacons + regional/config endpoints per
  // Google's documented CSP minimum (only contacted after explicit consent).
  // ⚠️ *.ingest.de.sentry.io er IKKE valgfri. CSP-en her er HÅNDHEVENDE, og
  // uten denne verten blokkerer nettleseren hver eneste feilrapport — stille.
  // Alt ser da ut til å virke, Sentry-dashbordet er bare tomt for alltid.
  // `.de.` er EU-regionen; endres organisasjonen til USA må denne endres med.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openweathermap.org https://opendata-download-metobs.smhi.se https://frost.met.no https://api.stripe.com https://*.kindwise.com https://ws.geonorge.no https://cache.kartverket.no https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://server.arcgisonline.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.ingest.de.sentry.io",
  // We embed Stripe Checkout / Elements in iframes.
  "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  // Service worker (next-pwa) + blob: for any dynamically created workers.
  "worker-src 'self' blob:",
  // PWA manifest.
  "manifest-src 'self'",
  // Lock <base href> rewriting.
  "base-uri 'self'",
  // Where forms can POST. Stripe checkout sometimes uses form-action.
  "form-action 'self' https://checkout.stripe.com",
  // Who can embed us in <iframe>. None — overlaps with X-Frame-Options but
  // stricter (CSP wins where supported).
  "frame-ancestors 'none'",
  // Auto-promote http:// references to https://.
  'upgrade-insecure-requests'
];
const csp = cspDirectives.join('; ');

const securityHeaders = [
  // Force HTTPS for 2 years on this domain and all subdomains; preload-eligible.
  // Only meaningful in production (HTTPS); browsers ignore on http://localhost.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  // Prevent the browser from MIME-sniffing a response away from the declared
  // Content-Type. Defense against polyglot file attacks.
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  // Prevent ANY site (including ourselves) from embedding Mycelet in an
  // <iframe> (clickjacking) — matches CSP frame-ancestors 'none'.
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  // Send origin (no path/query) when navigating cross-origin; full URL for
  // same-origin. Avoids leaking finding IDs / search queries to third parties.
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  // Restrict which browser APIs pages can use. We allow camera + geolocation
  // for ourselves (foto-ID and prediction location); deny everything else,
  // including Google's FLoC tracking (interest-cohort).
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(self), interest-cohort=()'
  },
  // Explicitly disable the legacy XSS auditor — modern browsers either ignore
  // it or have it removed entirely, and the old implementation had bugs that
  // could be weaponized. Real XSS protection comes from CSP below.
  {
    key: 'X-XSS-Protection',
    value: '0'
  },
  // Enforcing CSP — see policy notes at top of file.
  {
    key: 'Content-Security-Policy',
    value: csp
  }
];

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.kindwise.com' }
    ]
  },
  async headers() {
    // These endpoints return prose (prediction verdicts, flush banners, weekday
    // labels) in the language of the MYCELET_LOCALE cookie, so their responses
    // must never be reused across readers. Declared here rather than per-route
    // so it also covers the error responses.
    const localeVaryingHeaders = [
      { key: 'Vary', value: 'Cookie, Accept-Language' },
      { key: 'Cache-Control', value: 'private, no-store' }
    ];

    return [
      {
        // Apply to every route, including API. JSON responses don't strictly
        // need frame-options etc., but applying globally keeps the rule simple.
        source: '/:path*',
        headers: securityHeaders
      },
      { source: '/api/mushroom-day', headers: localeVaryingHeaders },
      { source: '/api/mushroom-forecast', headers: localeVaryingHeaders },
      { source: '/api/prediction', headers: localeVaryingHeaders },
      { source: '/api/prediction/:path*', headers: localeVaryingHeaders }
    ];
  },
  async rewrites() {
    return [
      // Clean URLs for the static «Sanketips» articles built by
      // scripts/build-articles.mjs into public/landing/sanketips/.
      { source: '/sanketips/:slug', destination: '/landing/sanketips/:slug.html' },
      // Offline-skallet. public/sw.js precacher nøyaktig '/offline' og svarer
      // med det når en navigasjon feiler uten dekning, så stien må finnes som
      // en ekte URL — ikke bare som filen /offline/index.html.
      { source: '/offline', destination: '/offline/index.html' }
    ];
  }
};

const withNextIntl = require('next-intl/plugin')('./src/i18n/request.ts');

/**
 * Sentry pakkes UTENPÅ next-intl.
 *
 * withSentryConfig er ikke pynt: den setter opp opplasting av source maps, slik
 * at en stacktrace peker på vår faktiske kildekode og ikke på minifisert
 * `a.b.c()`. Uten den er hver eneste feilrapport praktisk talt uleselig.
 *
 * ⚠️ IKKE sett `productionBrowserSourceMaps` manuelt. withSentryConfig setter
 * den selv OG setter samtidig deleteSourcemapsAfterUpload — men bare hvis du
 * ikke har rørt den. Rører du den, faller sletteflagget til false, og
 * fullstendige source maps av hele appen blir liggende offentlig tilgjengelig.
 *
 * Opplastingen krever SENTRY_AUTH_TOKEN. Mangler den, bygger prosjektet
 * fortsatt — det blir bare ingen source maps.
 */
const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Stille i byggeloggen når alt går bra; feil vises fortsatt.
  silent: !process.env.CI,
  // Vi bruker IKKE tunnelRoute. Den ville krevd en endring i middleware.ts —
  // samme regex som gater /profile, /map, /admin og /mine-steder for betalende
  // kunder — og den kan ikke testes lokalt, siden Turbopack ikke kjører
  // middleware i dev. Tunnelen finnes for å omgå annonseblokkere, og i en
  // WKWebView finnes ingen. CSP-oppføringen over gjør samme nytte til null risiko.
  telemetry: false
});
