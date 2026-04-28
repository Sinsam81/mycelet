# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SoppJakt — a Norwegian mushroom-foraging app. UI strings, docs, and commit messages are in Norwegian. Code identifiers and CLAUDE-facing notes are in English.

Stack: Next.js 14 (App Router) + TypeScript + Tailwind + Supabase (PostGIS) + Stripe + Leaflet. State via Zustand and TanStack Query. Tests via Vitest.

## Common commands

```
npm run dev         # Next dev server on http://localhost:3000
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run test        # vitest (runs all tests)
npm run test -- <pattern>          # filter by test name
npm run test -- src/lib/billing    # filter by path
```

There is no Supabase CLI workflow set up; migrations are applied by pasting `supabase/migrations/NNN_*.sql` into the Supabase SQL Editor in dashboard order (001 → 007). They have hard dependencies — running 003 alone fails because it references `mushroom_species` and `update_updated_at()` from 001.

## Architecture

**App Router layout.** UI lives under `src/app/`. API routes are colocated under `src/app/api/<name>/route.ts`. Pages and routes share the same Next.js conventions; treat `route.ts` as the API contract.

**Supabase client split** (`src/lib/supabase/`):
- `client.ts` — browser client (anon key). Used in `'use client'` components and hooks.
- `server.ts` — server client with cookie-based session. Used in server components and route handlers.
- `middleware.ts` — session refresh + route gating. The root `middleware.ts` re-exports it.
- `admin.ts` — service-role client. Server-only, never import from client code.

**Auth gating** lives in `src/lib/supabase/middleware.ts`. The `PROTECTED_PATHS` array there is the source of truth for which routes redirect unauthenticated users to `/auth/login?redirect=…`. Add new protected routes by editing that list.

**Billing/capabilities** (`src/lib/billing/`). `getBillingCapabilities(subscription)` derives `{tier, status, paid, aiDailyLimit}` from the `billing_subscriptions` row (or null). Routes that gate features call this — see `src/app/api/identify/route.ts` and `src/app/api/prediction/route.ts` for the pattern. Free users get capped/coarsened data, paid users get full detail.

**Prediction endpoint** (`src/app/api/prediction/route.ts`) has two paths:
1. Primary: query `prediction_tiles` table via the `get_prediction_tiles_in_bounds` RPC. Tiles are populated by `scripts/generate-prediction-tiles.ts`.
2. Fallback: when no tiles exist for the date/area, it computes a score from OpenWeather + historical findings. Requires `OPENWEATHER_API_KEY` — without it the fallback returns 502.

**Species data flow.** The list view (`src/app/species/page.tsx` → `useSpecies` hook) reads `primary_image_url` denormalized on `mushroom_species`. The detail view (`src/app/species/[id]/page.tsx`) reads from `species_photos` joined by `species_id`. When seeding photos, write to both: `mushroom_species.primary_image_url` for the list, `species_photos` rows for the detail page.

**Map and offline.** Leaflet via `react-leaflet`. Service worker + offline tile cache live behind premium gating (see `docs/offline-map-mvp.md`).

**Visibility model for findings.** `findings` rows have `visibility` (`public` | `approximate` | `private`) and an `is_zone_finding` flag. The `set_display_location` trigger computes `display_latitude/longitude` based on those fields — randomized for `approximate`, grid-snapped for zone findings, NULL for private. Views like `public_findings` and APIs use the display columns, never raw `latitude/longitude`. If you change visibility logic, update both the trigger and the view.

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

## Conventions

- UI text in Norwegian; new strings should match tone of existing copy in `src/app/`. Don't translate user-facing copy to English.
- Zustand stores live in `src/store/`. TanStack Query for server-state caching is preferred over manual `useEffect` fetches.
- Tests live next to source in `__tests__/` folders. Pure utility functions (`src/lib/billing/plans.ts`, `src/lib/utils/prediction.ts`) are the easiest to test — UI components are largely untested.
- Commit message style: short imperative subject in English (matches `Step N: ...` history).
- The README and most planning docs are in Norwegian. `docs/8-step-status.md`, `docs/commercial-mvp-plan.md`, and `docs/offline-map-mvp.md` are good orientation reads for understanding intended scope.
