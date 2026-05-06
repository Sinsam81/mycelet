# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SoppJakt — a Norwegian (and Swedish) mushroom-foraging app. UI strings, docs, and commit messages are in Norwegian. Code identifiers and CLAUDE-facing notes are in English.

Stack: Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind + Supabase (PostGIS) + Stripe + Leaflet 5. State via Zustand and TanStack Query. Tests via Vitest.

## Common commands

```
npm run dev         # Next dev server on http://localhost:3000
npm run build       # production build (Turbopack; runs tsc as part of build)
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run test        # vitest (runs all tests)
npm run test -- src/lib/weather    # filter by path
```

Tests use the `@/*` path alias from `tsconfig.json`; vitest mirrors this in `vitest.config.ts`. Add new tests next to source in `__tests__/` folders — they pick the alias up automatically.

There is no Supabase CLI workflow set up; migrations are applied by pasting `supabase/migrations/NNN_*.sql` into the Supabase SQL Editor in dashboard order (001 → 008). They have hard dependencies — running 003 alone fails because it references `mushroom_species` and `update_updated_at()` from 001. Migration 008 (audit log) requires `moderator_roles` from 002.

## Architecture

**App Router layout.** UI lives under `src/app/`. API routes are colocated under `src/app/api/<name>/route.ts`. Pages and routes share the same Next.js conventions; treat `route.ts` as the API contract.

**Supabase client split** (`src/lib/supabase/`):
- `client.ts` — browser client (anon key). Used in `'use client'` components and hooks.
- `server.ts` — server client with cookie-based session. Used in server components and route handlers. Note: `cookies()` is async in Next 15+; the server client awaits the promise inside its callbacks so call sites can stay synchronous.
- `middleware.ts` — session refresh + route gating + per-request correlation ID. The root `middleware.ts` re-exports it.
- `admin.ts` — service-role client. Server-only, never import from client code. Requires `SUPABASE_SERVICE_ROLE_KEY` in env.

**Auth gating** lives in `src/lib/supabase/middleware.ts`. The `PROTECTED_PATHS` array there is the source of truth for which routes redirect unauthenticated users to `/auth/login?redirect=…`. Add new protected routes by editing that list.

**Billing/capabilities** (`src/lib/billing/`). `getBillingCapabilities(subscription)` derives `{tier, status, paid, aiDailyLimit}` from the `billing_subscriptions` row (or null). Routes that gate features call this — see `src/app/api/identify/route.ts` and `src/app/api/prediction/route.ts` for the pattern. Free users get capped/coarsened data, paid users get full detail.

**Prediction endpoint** (`src/app/api/prediction/route.ts`) has two paths:
1. **Primary:** query `prediction_tiles` table via the `get_prediction_tiles_in_bounds` RPC. Tiles are populated by `scripts/generate-prediction-tiles.ts`.
2. **Fallback:** when no tiles exist for the date/area, computes a score from `fetchWeatherSummary()` + historical findings. Returns 502 if no weather provider is reachable for the region.

When `?speciesId=N` is set, the route applies a per-species multiplier from `src/lib/utils/species-scoring.ts` to the final score (see "Per-species scoring" below).

**Weather adapters** (`src/lib/weather/index.ts`). Single export `fetchWeatherSummary({lat, lon})` that routes by region:
- `'NO'` → MET Norway Frost (requires `MET_FROST_CLIENT_ID`; placeholder is a no-op stub)
- `'SE'` → SMHI Open Data (no key required)
- `'other'` → OpenWeather (requires `OPENWEATHER_API_KEY`)
- Returns `null` if no provider is configured/reachable for that region.

Region detection in `src/lib/utils/region.ts` — bounding-box check, returns `'NO' | 'SE' | 'other'`.

**Per-species scoring** (`src/lib/utils/species-scoring.ts`). When a specific species is requested, multiply the base prediction score by `computeSpeciesAdjustment(species, weather, month)` — multiplier in `[0.05, 1.3]`. Out-of-season collapses to ~0.05; peak season + optimal weather hits 1.2-1.3. Genus profiles in `GENUS_PREFERENCES` cover Cantharellus, Boletus, Hydnum, Suillus, Agaricus, Amanita, Cortinarius and ~7 more; unknown genera fall back to a generic profile. Calibrated by hand from field knowledge — should be tuned against real finding data when available.

**Species data flow.** The list view (`src/app/species/page.tsx` → `useSpecies` hook) reads `primary_image_url` denormalized on `mushroom_species`. The detail view (`src/app/species/[id]/page.tsx`) reads from `species_photos` joined by `species_id`. When seeding photos, write to both: `mushroom_species.primary_image_url` for the list, `species_photos` rows for the detail page.

**Map and offline.** Leaflet via `react-leaflet@5`. Service worker + offline tile cache live behind premium gating (see `docs/offline-map-mvp.md`). The `/map` page is a Server Component; the actual map is dynamic-imported with `ssr: false` via the thin client wrapper at `src/components/map/MushroomMapLazy.tsx` (Next 15+ disallows `ssr: false` in Server Components).

**Visibility model for findings.** `findings` rows have `visibility` (`public` | `approximate` | `private`) and an `is_zone_finding` flag. The `set_display_location` trigger computes `display_latitude/longitude` based on those fields — randomized for `approximate`, grid-snapped for zone findings, NULL for private. Views like `public_findings` and APIs use the display columns, never raw `latitude/longitude`. If you change visibility logic, update both the trigger and the view.

## Cross-cutting infrastructure

**Logging** (`src/lib/log/`). Five-level structured logger: `trace < debug < info < warn < error`. Default level is `debug` in dev, `info` in prod; override with `LOG_LEVEL` env. Output is pretty single-line in dev, JSON object per line in prod (Vercel/Sentry-ingestible).

Use `createRequestLogger(request)` in route handlers to get a child logger pre-bound with `reqId` (correlation ID propagated via the `x-request-id` request header set by middleware) and `route`. PII is auto-redacted — emails masked, secret-pattern keys (password/token/apikey/authorization/etc.) replaced with `<redacted>`. UUIDs and numeric IDs pass through (internal-only, useful for cross-referencing).

See `docs/logging.md` for the full conceptual model + the documented Next 14+ quirk where middleware-set response headers don't propagate to the client (only the request-header rewrite half works; server-side correlation is unaffected).

**Audit log** (`src/lib/audit/log.ts` + `admin_audit_log` table from migration 008). Append-only by trigger — UPDATE/DELETE blocked at the DB layer even for the service role. Use `logAdminAction({actorId, action, targetUserId, metadata, request})` for compliance-relevant events: admin role changes, account deletion, etc. Currently wired into `/api/admin/verified-foragers` (POST + DELETE) and `/api/me/delete`. The helper is failure-safe — if the service role key isn't set or the migration isn't applied, the underlying action still succeeds and a warning hits the server console.

**Rate limiting** (`src/lib/rate-limit/`). In-memory fixed-window token bucket. Use `checkRateLimit(key, limit, windowSeconds)` + `getClientKey(request, userId)` + `rateLimitResponse(result)` from `src/lib/rate-limit/route`. Currently applied to `/api/identify` (20/min/user), `/api/prediction` (60/min/client), `/api/billing/checkout` (5/min/user), `/api/me/export` (10/min/user), `/api/me/delete` (5/min/user). **Per-instance only** — Vercel auto-scales horizontally, so effective limit is `N × configured`. Replace with Upstash Redis or Vercel KV before public launch (this is documented as a B-phase follow-up).

**Security headers + CSP** (`next.config.js`). Six baseline headers on every response: HSTS, X-Frame-Options: SAMEORIGIN, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy (camera + geolocation for self), X-XSS-Protection: 0. Plus `Content-Security-Policy-Report-Only` with allowlists for Stripe, Supabase, Wikimedia, Kindwise, Kartverket, OSM. Flip to enforcing CSP after a week of monitoring report-only violations in prod.

**GDPR endpoints.**
- `/api/me/export` (Art. 15): authenticated GET; returns a JSON file (Content-Disposition: attachment) with every row tied to the user's id across `profiles`, `findings`, `forum_posts`, `comments`, `post_likes`, `comment_likes`, `saved_posts`, `reports` filed, `billing_subscriptions`, `moderator_roles`, `verified_foragers`. Excludes reports filed by *others* about the user (would expose reporter).
- `/api/me/delete` (Art. 17): authenticated POST with literal `{"confirm":"DELETE-MY-ACCOUNT"}` body. Hard-deletes the auth.users row via the admin client; FK cascades wipe profile and dependent rows. Returns receipt with deleted-row counts.
- `/personvern` page: Norwegian privacy-policy template with `[FYLL INN]` placeholders. Must be lawyer-reviewed before launch.
- `CookieNotice` component (mounted in root layout): one-time informational banner about strictly-necessary cookies. Not a consent dialog because we have no optional cookies.

**Health check** (`/api/health`): public, no auth. `?fast=1` skips DB checks for high-frequency probes. Returns 200 with per-check `{ok, message}` pairs covering env vars, database, audit log table presence; 503 if any check fails. Wired into the logger at debug/warn levels.

**Toaster** (`react-hot-toast`) is mounted in `src/components/layout/Providers.tsx` — `toast.success` / `toast.error` work app-wide.

## Database notes

PostGIS is required (extension created in 001). Geo queries on `findings` and `prediction_tiles` use GIST indexes on `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`.

If anyone runs `DROP SCHEMA public CASCADE` to reset the database, Supabase's automatic table grants for `anon` and `authenticated` are wiped. Symptom: REST/browser queries fail with `42501 permission denied for table X` even though RLS policies look correct. Restore with:

```sql
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
```

## Framework quirks worth knowing

These all came up during the Next 14 → 16 upgrade:

- **`cookies()` is async.** Returns `Promise<ReadonlyRequestCookies>`. Either `await` it or capture the promise once at construction and `await` inside callbacks (the pattern in `src/lib/supabase/server.ts`).
- **`ssr: false` on `next/dynamic` is disallowed in Server Components.** Wrap the dynamic import in a thin `'use client'` component (see `src/components/map/MushroomMapLazy.tsx`).
- **`useSearchParams()` requires Suspense for prerendering.** Wrap pages that use it in `<Suspense>` with a fallback. Pattern: extract the hook-using body to an inner component, wrap from the default export. Already done for `/auth/login`, `/auth/register`, `/forum/new`, `/pricing`.
- **Middleware-set response headers don't propagate when a route handler builds the response.** The init-headers form `NextResponse.next({headers})` and the post-construction `response.headers.set()` both fail to reach the client. The request-header rewrite half DOES work (so `createRequestLogger` picks up `x-request-id` correctly server-side). See `docs/logging.md`.
- **Prerender + Supabase env vars.** Pages that call `createClient()` need env vars at build time. Either keep `.env.local` populated locally during build, or mark such pages `force-dynamic` if they must run without env at build time.

## Conventions

- UI text in Norwegian; new strings should match tone of existing copy in `src/app/`. Don't translate user-facing copy to English.
- Zustand stores live in `src/store/`. TanStack Query for server-state caching is preferred over manual `useEffect` fetches.
- Tests live next to source in `__tests__/` folders. Pure utility functions (`src/lib/billing/plans.ts`, `src/lib/utils/prediction.ts`, `src/lib/utils/species-scoring.ts`, `src/lib/log/*`, `src/lib/rate-limit/*`, `src/lib/weather/*`) all have tests — keep that going. UI components are largely untested.
- Commit message style: short imperative subject in English (matches `Step N: ...` history). Co-author the AI helper with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- The README and most planning docs are in Norwegian. `docs/roadmap.md` is the single human-facing source of truth for what's left to build; `docs/logging.md`, `docs/8-step-status.md`, `docs/commercial-mvp-plan.md`, and `docs/offline-map-mvp.md` are good orientation reads for understanding intended scope.
