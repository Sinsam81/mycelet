/** @type {import('next').NextConfig} */

// Security headers applied to every response. Conservative on purpose so we
// don't break the app on rollout.
//
// Content-Security-Policy is shipped here in REPORT-ONLY mode first. Browsers
// log violations to the console without blocking anything, so we can collect a
// week or two of real traffic, see what actually fires, and only then flip to
// the enforcing `Content-Security-Policy` header. When we do flip, also
// tighten X-Frame-Options to DENY (currently SAMEORIGIN) to match
// `frame-ancestors 'none'`.
//
// Allowlist sources documented inline below.

// Stripe + Supabase + Wikimedia + Kindwise + Norwegian/Swedish map tile
// providers, plus the weather APIs we hit server-side. If you wire a new
// third-party SDK, add it here AND verify in dev console that the report-only
// header doesn't flag it before flipping to enforce.
const cspDirectives = [
  // Default fallback for resource types not explicitly listed below.
  "default-src 'self'",
  // 'unsafe-inline' + 'unsafe-eval' are intentional for now — Next.js inline
  // hydration scripts and some bundled libs need them. When we move to enforce
  // mode we should switch to nonce-based script-src instead.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://checkout.stripe.com",
  // Tailwind / framer-motion / Next inject inline styles.
  "style-src 'self' 'unsafe-inline'",
  // Image sources: own bucket, Wikimedia commons, Plant.id (Kindwise),
  // Norwegian Kartverket tiles, Swedish OpenStreetMap tiles for areas
  // Kartverket doesn't cover. data: + blob: for FileReader uploads.
  "img-src 'self' data: blob: https://*.supabase.co https://upload.wikimedia.org https://*.wikimedia.org https://*.kindwise.com https://*.kartverket.no https://opencache.statkart.no https://*.tile.openstreetmap.org",
  // data: for base64-inlined fonts in CSS.
  "font-src 'self' data:",
  // XHR/fetch/WebSocket destinations. wss://*.supabase.co is for Realtime.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openweathermap.org https://opendata-download-metobs.smhi.se https://frost.met.no https://api.stripe.com https://*.kindwise.com",
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
const cspReportOnly = cspDirectives.join('; ');

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
  // Prevent other sites from embedding Mycelet in an <iframe> (clickjacking).
  // SAMEORIGIN allows our own pages to embed each other if needed later.
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
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
  // Report-only CSP — see policy + monitoring notes at top of file.
  {
    key: 'Content-Security-Policy-Report-Only',
    value: cspReportOnly
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
    return [
      {
        // Apply to every route, including API. JSON responses don't strictly
        // need frame-options etc., but applying globally keeps the rule simple.
        source: '/:path*',
        headers: securityHeaders
      }
    ];
  }
};

module.exports = nextConfig;
