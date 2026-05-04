/** @type {import('next').NextConfig} */

// Security headers applied to every response. Kept conservative to avoid
// breaking the app on rollout. Content-Security-Policy is intentionally NOT
// included here — adding CSP requires careful testing against Stripe, Supabase,
// Leaflet tiles, Wikimedia images, and any inline scripts/styles Next.js emits.
// CSP should be a separate, follow-up PR with report-only mode first.
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
  // Prevent other sites from embedding SoppJakt in an <iframe> (clickjacking).
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
  // could be weaponized. Real XSS protection comes from CSP (future PR).
  {
    key: 'X-XSS-Protection',
    value: '0'
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
