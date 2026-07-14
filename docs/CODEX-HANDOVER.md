# Mycelet — Technical Handover for Codex

> **Purpose.** This is a complete, from-scratch technical handover of the Mycelet codebase, written for an engineer/agent (Codex) who has never seen the project. It is written in English to match the project convention (UI copy is Norwegian/Swedish; code identifiers, `CLAUDE.md`, and agent-facing notes are English).
>
> **Authority order when facts conflict:** (1) the code, (2) `supabase/migrations/*`, (3) this document, (4) `CLAUDE.md`, (5) the planning docs under `docs/`. Several `docs/*.md` predate the current live state — treat them as the last-written *planning* record, not current truth. Where a discrepancy is known, it is called out inline.
>
> **Last compiled:** 2026-07-13, from a full read of the code, all 28 migrations, all 18 API routes, `src/lib/**`, the frontend, and every file in `docs/`.

---

## 1. Project overview

### What the app does
**Mycelet** (rebranded from "SoppJakt" on 2026-05-09) is a Norwegian/Swedish **mushroom-foraging** web + mobile app. It combines four things most competitors sell separately:

1. **AI photo identification** of mushrooms (via the Kindwise "Mushroom ID" vision API), with heavy safety framing (never presented as an edibility verdict).
2. **A prediction engine** — "is it mushroom weather?" (temporal) and "promising spots near me" (spatial), built on real forest data (NIBIO/CORINE), live weather (MET/SMHI/OpenWeather), empirical phenology curves learned from 315k dated GBIF finds, and historical occurrence density.
3. **A community map** — log your own finds with privacy-preserving location masking, browse public finds and 186k GBIF/Artsdatabanken occurrence points, premium offline map caching.
4. **Reference + community** — a species catalog with look-alike safety warnings, a seasonal calendar, and a forum with a verified-expert trust model.

The app is **LIVE at [mycelet.com](https://www.mycelet.com)** with real paying customers (Stripe billing is in production). An iOS app (Capacitor shell loading the live site) is built and moving toward App Store submission.

### Target audience
Recreational mushroom foragers in **Norway and Sweden** (the product deliberately covers both Nordic countries; region detection routes weather/forest data per country). Ranges from beginners (who need the safety/look-alike guardrails) to experienced foragers (who want the prediction engine and offline maps). The **defensible moat is the Nordic mushroom niche + the temporal prediction signal**, not the map tech or generic ID.

### Core functionality
- Map with 3 basemaps (Kartverket topo / OSM / Esri satellite), find clustering, GBIF occurrence layer, prediction hotspots, "promising spots" pins, species-photo markers, GPS locate, offline caching (premium).
- AI identify flow (camera/upload → suggestions → safety gate → save as a find).
- Prediction: `/api/prediction` (area score + hotspots), `/api/prediction/grid` ("promising spots"), `/api/mushroom-day` + `/api/mushroom-forecast` (7-day "when" forecast + flush timing).
- Species catalog + detail pages, seasonal calendar, look-alike warnings.
- Forum (posts/comments/likes/reports/moderation) with verified-forager badges — **currently hidden behind a feature flag** (`FLAGS.forumInNav = false`).
- Auth (email/password + Google), profile, "mine steder" private spot vault.
- Billing (Stripe): Free / Premium (79 kr/mo) / Sesongpass (249 kr/yr).
- Full GDPR tooling (export, delete, retention warnings), audit log, structured logging, health check.

### What is done (shipped / live)
- **Core app**: all pages, auth, profile, calendar, species catalog, safety pages — live.
- **Nordic foundation**: NO/SE region detection + weather adapter routing (MET Frost / SMHI / OpenWeather) — live.
- **Prediction v4**: live forest data (NIBIO SR16 for NO, CORINE for SE), empirical phenology (timing AUC ~0.88), flush timing, per-species scoring and soil-moisture index — live. Missing spatial inputs are neutral; the occurrence kernel is informational only. `computeCellPrediction` is the shared brain for both live compute and precomputed tiles.
- **Billing (Stripe)**: checkout + portal + webhook + idempotency, subscription gating — **go-live done 2026-06-12** (ENK org 937 880 871 ØVERÅS APPS; real 79-kr purchase/refund/cancel verified end-to-end).
- **Security/GDPR (Phase A + most of B)**: security headers + **enforcing CSP**, rate limiting, append-only audit log, GDPR export/delete, coordinate masking, on-device EXIF stripping, GBIF data refiltered to free licenses (CC0/CC-BY only), structured logging + PII redaction, `/api/health`.
- **Species catalog**: expanded to ~72 fully-verified species with 11+ look-alike warnings.
- **Offline map MVP**: service worker + tile cache, premium-gated. (Sweden-offline bug fixed 2026-07-13 — see §5.)
- **iOS shell**: Capacitor project built, `server.url` → mycelet.com, offline fallback page, privacy manifest.
- **Apple Developer enrollment**: ACTIVE since 2026-06-17 (Individual, exp 2027-06-17).

### What remains (before/around open launch)
- **App Store submission**: wire RevenueCat IAP SDK + webhook → `billing_subscriptions`; create IAP products (79/mo + 249/yr); sandbox test; submit. **RevenueCat/IAP is not yet in the code** — native billing is currently view-only.
- **Retention cron jobs**: `account_deletion_warnings` table exists and `/api/me/extend-retention` works, but the actual purge crons (Supabase Edge Functions, documented) are not deployed.
- **Distributed rate limiting**: replace in-memory buckets with Upstash Redis / Vercel KV before high traffic.
- **Sentry** error monitoring (needs account).
- **Prediction spatial signal**: honest plateau — the only real remaining lever is a bias-corrected SDM (big project). See §9/§15.
- **Sindre's homework** (non-code): DPAs, lawyer review of `/personvern`, `MET_FROST_CLIENT_ID` registration, Sentry account, breach-notification routine. See §13.
- **Species "pulje 2"**: final ~28 species to reach 100 (deferred deliberately).

---

## 2. Architecture

### Directory structure (top level)
```
.
├── CLAUDE.md                # agent guidance (architecture + conventions + gotchas)
├── README.md                # Norwegian project readme
├── middleware.ts            # re-exports src/lib/supabase/middleware (auth gating)
├── next.config.js           # security headers + enforcing CSP + image remotePatterns
├── capacitor.config.ts      # native shell config (server.url → mycelet.com)
├── playwright.config.ts     # e2e projects: setup / public / authed
├── vitest.config.ts         # unit tests, @/* alias
├── tailwind.config.ts       # forest/cream design tokens
├── tsconfig.json            # @/* → src/*, strict, ES2022
├── docs/                    # planning + runbooks (Norwegian) — see §16
├── e2e/                     # Playwright specs (*.e2e.ts, *.setup.ts)
├── ios/                     # committed Xcode project (Capacitor)
├── capacitor-www/           # static offline fallback for the native shell
├── messages/                # next-intl catalogs: nb.json, sv.json
├── public/                  # sw.js (service worker), manifest.json, icons, images
├── scripts/                 # prediction pipeline, calibration, backtests, setup (.mjs)
├── supabase/
│   ├── migrations/          # 001..028 SQL (applied via dashboard SQL editor)
│   └── functions/           # Deno Edge Functions (retention crons — planned/built)
└── src/
    ├── app/                 # App Router: pages + api/*/route.ts
    ├── components/          # map/, layout/, identify/, native/, ui/
    ├── lib/                 # all business logic (see below)
    ├── i18n/                # next-intl config (no URL prefix; cookie-based)
    ├── store/              # (does not exist — Zustand is unused, see §11)
    └── types/               # finding, forum, identify, prediction, species
```

### `src/lib/` layout (where the logic lives)
```
src/lib/
├── supabase/       client.ts (browser/anon) · server.ts (cookie session) · admin.ts (service role) · middleware.ts (session refresh + gating)
├── billing/        plans.ts (tiers, prices, hasPaidAccess) · subscription.ts (getBillingCapabilities)
├── stripe/         server.ts (Stripe SDK singleton)
├── weather/        index.ts (fetchWeatherSummary region router) · forecast.ts (MET Locationforecast) · soil-moisture.ts
├── prediction/     cell-score.ts (THE scoring brain) · phenology.ts + phenology-data.ts · flush.ts · mushroom-day.ts · occurrences.ts · score-calibration.ts
├── forest/         index.ts (getForestProperties region router)
├── nibio/          sr16.ts (Norway forest WMS) · habitat.ts (habitat score + host gate)
├── corine/         index.ts (Sweden/EU forest type)
├── terrain/        index.ts (Kartverket elevation)
├── slu/            jordart.ts (Swedish soil drainage — IMPLEMENTED BUT UNWIRED)
├── rate-limit/     index.ts (token bucket) · route.ts (getClientKey, rateLimitResponse)
├── log/            index.ts (5-level logger) · request.ts (createRequestLogger) · pii.ts (redaction)
├── audit/          log.ts (logAdminAction → admin_audit_log)
├── hooks/          usePrediction, useBilling, useSpecies, useIdentify, useForum, useGeolocation, useAuth, useIsNative, useDebouncedValue
├── native/         platform.ts (isNativePlatform) · camera.ts (captureNativePhoto)
├── utils/          species-scoring.ts · region.ts · identify-ranking.ts · edibility.ts · prediction-explanation.ts · offlineMap.ts · cn.ts
└── flags.ts        FLAGS = { forumInNav: false, tripMode: false }
```

### Most important files
| File | Role |
|---|---|
| `src/lib/prediction/cell-score.ts` | **Single source of truth for the prediction score.** `computeCellPrediction()` is used by both the live `/api/prediction` fallback AND the tile generator — change scoring here only. |
| `src/lib/weather/index.ts` | `fetchWeatherSummary({lat,lon})` — region-routed weather (NO/SE/other). Returns `null` when no provider reachable. |
| `src/lib/utils/species-scoring.ts` | Per-species multiplier (`computeSpeciesAdjustment`) with `GENUS_PREFERENCES` (17 genera). |
| `src/lib/utils/region.ts` | `getRegion(lat,lon)` — the shared NO/SE/other router used by weather + forest. |
| `src/lib/billing/plans.ts` + `subscription.ts` | Tiers, prices, `hasPaidAccess`, `getBillingCapabilities`. Everything gates on `capabilities.paid`. |
| `src/lib/supabase/middleware.ts` | Auth gating (`PROTECTED_PATHS`) + session refresh + correlation ID. |
| `src/app/api/identify/route.ts` | AI identification + safety ranking + look-alike attachment. |
| `src/app/api/prediction/route.ts` | Prediction endpoint (tile path + fallback compute path). |
| `src/app/api/stripe/webhook/route.ts` | Populates `billing_subscriptions` from Stripe events (idempotent). |
| `src/components/map/MushroomMap.tsx` | ~1625-line client component holding ALL map logic. |
| `supabase/migrations/001_initial_schema.sql` | Foundation: extensions, core tables, `set_display_location`, `public_findings` view, base RPCs. |
| `public/sw.js` | Service worker: offline tile cache + static asset caching. |

### How data flows through the system
**Read path (map view):**
1. `MushroomMap` (client) reacts to `moveend` → calls Supabase RPCs scoped to the current bounding box: `get_findings_in_bounds`, `get_prediction_tiles_in_bounds`, `get_occurrences_in_bounds`.
2. RPCs are `SECURITY DEFINER` and read the **masked `public_findings` view** (never raw coordinates). Findings render as React `FindingPopup`s injected into Leaflet.
3. Prediction hotspots come from precomputed `prediction_tiles` (generated by the cron). Premium tools call `/api/prediction/grid` and `/api/prediction/species-spots`.

**Prediction compute path (`/api/prediction`):**
1. Try precomputed tiles (`get_prediction_tiles_in_bounds`, `p_tile_date = today`). If tiles exist → confidence-weighted aggregate → response.
2. Fallback: fetch weather (`fetchWeatherSummary`) + findings (`get_findings_in_bounds`) + occurrences + forest (`getForestProperties`) + elevation → `computeCellPrediction()` → response. Returns 502 if no weather provider is reachable.
3. Billing gates the response: free users get coarsened factors + top-3 hotspots; paid users get full detail.

**Write path (log a find):**
1. `AddFindingSheet` → image is re-encoded client-side (`reencodeImageForUpload`, strips EXIF/GPS) → uploaded to Supabase Storage → `INSERT` into `findings` with a chosen `visibility` (`public`/`approximate`/`private`) + `is_zone_finding`.
2. The `set_display_location` **trigger** computes `display_latitude/longitude` (exact for public, ±500 m jitter for approximate, grid-snapped for zone, NULL for private). The public view + RPCs only ever expose display coords.

**Billing flow:**
`/api/billing/checkout` → Stripe Checkout → Stripe fires webhook → `/api/stripe/webhook` (signature-verified, idempotent via `billing_webhook_events`) → **service-role upsert** into `billing_subscriptions` → `getBillingCapabilities` reads it → features gate on `paid`.

---

## 3. Technology stack

| Layer | Choice |
|---|---|
| **Framework** | Next.js **16.2** (App Router, Turbopack). `tsc` runs as part of `next build`. |
| **Language** | TypeScript 5.9 (strict), target ES2022, `moduleResolution: bundler`. Path alias `@/* → src/*`. |
| **UI** | React **19.2**, Tailwind CSS 3.4 (custom `forest`/`cream` tokens), `framer-motion`, `lucide-react` icons, `react-hot-toast`. Self-hosted fonts (Fraunces + Inter) via `next/font`. |
| **Maps** | Leaflet **1.9.4** + `react-leaflet` **5.0** + `leaflet.markercluster`. (Note: `CLAUDE.md` says "Leaflet 5" — that's react-leaflet's major, Leaflet itself is 1.9.) |
| **State** | **TanStack Query 5** for all server state. Local React state + refs for UI (esp. the map). `zustand` is a dependency but **UNUSED** (no `src/store/`, zero imports). |
| **Backend** | Next.js API routes (`src/app/api/*/route.ts`), Node runtime (rate limiting requires Node, not Edge). |
| **Database** | Supabase (Postgres + **PostGIS** + `pgcrypto`). RLS on every table. No Supabase CLI — migrations pasted into the dashboard SQL editor in order. |
| **Auth** | Supabase Auth (email/password + Google OAuth), cookie sessions refreshed in middleware. |
| **Payments** | Stripe (`stripe` SDK ^16). Checkout + Billing Portal + webhooks. App Store IAP via RevenueCat is **planned, not implemented**. |
| **AI** | **Kindwise "Mushroom ID"** vision API (`https://mushroom.kindwise.com/api/v1/identification`). Not an LLM — a pure classifier. Internally named `PlantId`/`plantid` (legacy). |
| **External APIs** | MET Norway Frost (NO weather), SMHI (SE weather), OpenWeather (other), MET Locationforecast (forecast), NIBIO SR16 WMS (NO forest), CORINE/EEA (SE/EU forest), Kartverket Geonorge (NO elevation + place names), GBIF (occurrence import), Wikimedia (species images). |
| **Native** | Capacitor 8 (iOS + Android), `@capacitor/camera`, `@capacitor/geolocation`. Hosted-URL shell (loads mycelet.com). |
| **Hosting** | **Vercel** (Pro team). Auto-deploys production on push to `main`. Supabase-hosted Postgres. Domain mycelet.com. |
| **Build** | `next build` (Turbopack, runs `tsc`). |
| **Tests** | **Vitest** (unit, in `__tests__/` next to source) + **Playwright** (e2e, `e2e/*.e2e.ts`). |
| **i18n** | `next-intl` 4, locales `nb` (default) + `sv`, cookie-based (no URL prefix). |

### Environment variables (complete)
**Required (app runtime):**
| Var | Purpose | Scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | public |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client (bypasses RLS). Throws if missing when admin client constructed. | **server-only** |
| `STRIPE_SECRET_KEY` | Stripe server SDK | **server-only** |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe webhook signatures | **server-only** |
| `STRIPE_PRICE_PREMIUM_MONTHLY` | Stripe price ID → `premium` tier (7900 øre/mo) | **server-only** |
| `STRIPE_PRICE_SEASON_PASS` | Stripe price ID → `season_pass` tier (24900 øre/yr) | **server-only** |
| `PLANTID_API_KEY` | Kindwise AI identification key (Api-Key header). `/api/identify` returns 503 if unset/placeholder/<20 chars. | **server-only** |
| `CRON_SECRET` | Bearer token gating `/api/cron/generate-tiles` (and Edge Function crons) | **server-only** |

**Optional (degrade gracefully):**
| Var | Purpose |
|---|---|
| `MET_FROST_CLIENT_ID` | MET Norway Frost (NO weather). Placeholder is a no-op stub (`isRealKey` guard); NO weather falls through to OpenWeather if this is unset. |
| `OPENWEATHER_API_KEY` | OpenWeather (`'other'` region). |
| `NEXT_PUBLIC_APP_URL` | Base URL for Stripe return URLs; falls back to `request.nextUrl.origin`. |
| `LOG_LEVEL` | Override logger level (`trace`/`debug`/`info`/`warn`/`error`). |
| `QA_TEST_EMAIL` / `QA_TEST_PASSWORD` | Playwright authed-test creds (written to `.env.local` by `qa:setup`). Authed e2e skip cleanly if unset. |
| `PLAYWRIGHT_BASE_URL`, `CI` | e2e tooling. |

**SE (SMHI) weather needs no key.** NIBIO forest, CORINE, Kartverket elevation, MET Locationforecast, and GBIF need no keys. Script-only env vars (dozens, for the prediction pipeline/backtests) are CLI overrides — see `scripts/` and §12; they are not needed by the deployed app.

---

## 4. Design decisions (and why)

- **Next.js App Router + Vercel + Supabase.** Solo non-technical founder → minimal ops. Server Components for data pages; API routes for contracts; Supabase gives Postgres + Auth + Storage + RLS in one. Auto-deploy on push to `main`.
- **Region router (`getRegion`) as the single source of truth.** Norway-centric assumptions caused repeated Sweden bugs (blank map, Göteborg mis-routing, blank offline cache). All country-specific behavior (weather provider, forest source, basemap) funnels through one function with a piecewise-linear NO/SE border approximation. **Any new country-specific behavior must route through `getRegion`.**
- **`computeCellPrediction` as one scoring brain.** The live fallback and the precomputed tiles must never drift; both call the same function.
- **Real data over pseudo-noise in the prediction.** Forest (NIBIO/CORINE), elevation (Kartverket), soil-moisture (from daily precip + ET), and empirical phenology (learned weekly curves from 315k GBIF finds) replace hand-wavy proxies. Missing spatial inputs use neutral 50-values. **The honest validated signal is temporal (timing), not spatial** — corrected local/seasonal target-group validation put occurrence-only at 0.472 AUC, so occurrence density is informational and does not change the score.
- **Coordinate masking at the DB layer.** Foragers guard secret spots. `visibility` + `is_zone_finding` + a trigger compute `display_*` coordinates; the public view and RPCs only ever expose those. Raw coords are owner-only (RLS). This is a safety/trust feature, enforced in Postgres so no API bug can leak coords.
- **AI is never an edibility verdict.** Kindwise returns species probabilities; the app (a) overrides AI edibility with its own curated catalog when a species matches, (b) treats unknown/missing edibility as *dangerous*, (c) always surfaces critical look-alikes, (d) requires an acknowledgement checkbox before saving, (e) never lets local context bury a poisonous suggestion. Legal + safety-critical.
- **Enforcing CSP + strict headers.** Report-only for ~a month, then flipped to enforcing (2026-06). `unsafe-eval` is dev-only (HMR). Tile/weather/Stripe/Supabase hosts explicitly allowlisted.
- **Stripe now, IAP later; native billing view-only.** Web uses Stripe; the iOS shell hides all purchase UI (`NonNativeOnly`) because App Store rule 3.1.1 requires IAP. RevenueCat will later unify entitlements into the same `billing_subscriptions` table.
- **Hosted-URL Capacitor shell.** The app is SSR + API routes, so it can't ship as static files. Native loads the live site; native camera/geolocation plugins + offline page satisfy Apple's "not just a website" rule 4.2.
- **In-memory rate limiting (interim).** Simple, zero-dependency; documented to be swapped for Redis/KV before scale. Per-instance, so effective limit ≈ N × configured on Vercel.

---

## 5. Current status (concrete)

### What works (verified)
- Live site at mycelet.com; map (NO + SE), AI identify, prediction, calendar, forum (behind flag), auth + forgot-password, species catalog, `/datakilder`, `/api/health`.
- Stripe billing end-to-end (real purchase/refund/cancel verified). Free 5/day AI cap; premium unlimited + full prediction detail + offline maps.
- Coordinate masking, GDPR export/delete, audit log, structured logging, enforcing CSP, rate limiting on 14 route groups.
- Prediction: temporal signal validated (timing AUC ~0.89); live forest/weather/phenology in production.
- **Sweden offline map caching — FIXED 2026-07-13** (commit `4f51dbb` on `main`, deployed + verified live). Offline cache now follows the active basemap (OSM for Sweden) and the service worker serves OSM/Esri tiles offline, not just Kartverket.

### What works partially
- **Prediction spatial ("where") signal** — computed and shown, but corrected validation is near chance (`fullCore` 0.504 AUC; habitat-only 0.536). Temporal is the real product argument.
- **Native billing** — features gate correctly on `paid`, but the *purchase path* is hidden on iOS (no IAP yet).
- **Sweden forest data** — CORINE gives coarse forest *type* only (no volume/bonitet/height), so SE prediction is structurally weaker than NO (NIBIO SR16). Not a bug — a data asymmetry.
- **Forum** — fully built but hidden from nav (`FLAGS.forumInNav = false`).
- **`MET_FROST_CLIENT_ID`** — code complete, inert until Sindre registers at frost.met.no (NO weather then falls back to OpenWeather or null).

### Known bugs / limitations
- **Rate limiting is in-memory, per serverless instance** → effective limit ≈ N × configured; resets on cold start. Swap for Redis/KV before scale.
- **Schema drift**: `mushroom_species.primary_image_url` and `swedish_name` are *referenced* by migrations 015/017/023/027 but **never created by an `ALTER TABLE ADD COLUMN`** in 001–028. They exist in prod (added out-of-band). A clean replay of 001→028 on an empty DB will FAIL at 015/017/027 unless these columns are added first. **Verify the live column list before any clean replay.**
- **Middleware does not run in Turbopack dev** → middleware-only auth gating (`/profile`, `/map`, `/admin`, `/forum/new`) is untestable locally; only `/mine-steder` + `/admin/prediction` (page-level `redirect()`) gate in dev. Test protected routes against prod / `qa:prod`.
- **Middleware-set response headers don't reach the client** in Next 14+ (request-header rewrite half works, so server-side correlation is fine).
- **SLU/SGU jordart adapter (`src/lib/slu/jordart.ts`) is fully implemented + tested but NOT wired** into any route or `cell-score` — dead code awaiting integration (it was the intended next spatial lever, but validation showed drainage doesn't discriminate, ~0.47 AUC).
- **npm audit**: 2 MODERATE, both inside `next`'s own bundled `postcss` — accepted (fix would require downgrading Next).

### Temporary workarounds
- **iCloud duplicate files**: the project lives in an iCloud-synced folder that spawns `"* 2.ts"` duplicate files. They appear in `git status` (never commit them) and break iOS CLI codesign (build to `/tmp`; use Xcode GUI). Delete them before `npm run build`.
- **Worktree vs main dir**: the dev server runs in the main project dir; edits in a git worktree don't reach it — mirror or work in the right place.
- **CLAUDE.md is stale** on some points (see §14 corrections): CSP is enforcing (not report-only), X-Frame-Options is DENY (not SAMEORIGIN), rate limiting covers 14 routes (not 5), migrations run to 028 (not 021).

### TODO list (consolidated)
1. Wire RevenueCat IAP (SDK + purchase UI + webhook → `billing_subscriptions`) → App Store submission.
2. Deploy retention cron Edge Functions (`purge-inactive-accounts`, `purge-resolved-reports`, `prune-billing-events`).
3. Swap rate limiting to Upstash Redis / Vercel KV.
4. Sentry error monitoring with PII scrubbing.
5. Build historical weather-at-find-time features (migration 022 table) → decide next prediction modeling step.
6. Species "pulje 2" (~28 more), genus profiles for new genera (Imleria, Galerina, Tricholoma…).
7. Lawyer-review `/personvern`; sign DPAs; register `MET_FROST_CLIENT_ID`.

---

## 6. How to start the project

```bash
# 1. Install
npm install

# 2. Environment — create .env.local with at least:
#    NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
#    (+ Stripe/PLANTID/weather keys for those features). See §3.

# 3. Dev server (http://localhost:3000)
npm run dev

# 4. Type check / lint
npm run typecheck        # tsc --noEmit
npm run lint             # next lint (note: known Next 16 arg-parsing quirk with `-- <path>`)

# 5. Unit tests (Vitest)
npm run test                       # all
npm run test -- src/lib/weather    # filter by path

# 6. Production build (runs tsc)
npm run build
npm run start            # serve the build

# 7. Full product QA (Playwright, local dev)
npm run qa:setup         # once — creates the QA user, writes creds to .env.local
npm run qa               # drives every core flow vs localhost:3000
npm run qa:prod          # read-only smoke + gating vs live mycelet.com
npm run qa:report        # open last HTML report

# 8. Native iOS (macOS + Xcode)
npm run cap:ios          # cap sync ios && cap open ios  — then archive via Xcode GUI
```

**Database:** there is no Supabase CLI workflow. Apply migrations by pasting `supabase/migrations/NNN_*.sql` into the Supabase dashboard SQL editor **in order (001 → 028)** — they have hard dependencies (see §7). Do NOT run one in isolation.

**Deploy:** push to `main` → Vercel auto-deploys production. There is one Supabase project (no staging) — **writes hit prod**, so keep authed e2e read-only.

---

## 7. Data model

PostGIS + pgcrypto (migration 001). RLS is ON for every `public` table. Integer `SERIAL` PK only on `mushroom_species` + `look_alikes`; everything else uses UUID.

### Core tables
- **`profiles`** — 1:1 with `auth.users` (`id` FK CASCADE). `username` (unique), `display_name`, `default_finding_visibility`, `notification_preferences` (JSONB). (`latitude`/`longitude` existed but were **dropped in 025** as a latent PII leak.)
- **`mushroom_species`** — the catalog. `norwegian_name`, `latin_name` (unique), `genus`, rich description fields, `edibility` (`edible`/`conditionally_edible`/`inedible`/`toxic`/`deadly`), `mycorrhizal_partners TEXT[]`, `habitat TEXT[]`, `season_start`/`season_end`/`peak_*`, `verified`. **`primary_image_url` + `swedish_name` are used but not created in migrations (schema drift — §5).**
- **`species_photos`** — photos per species (detail page reads here). `species_id` FK CASCADE, `is_primary`, `photo_type`.
- **`look_alikes`** — directional confusable pairs. `species_id` + `look_alike_id` (both FK CASCADE), `danger_level` (`low`/`medium`/`high`/`critical`), `similarity_description`, `difference_description`. Safety-critical.
- **`findings`** — the central content table. `user_id` FK **SET NULL** (changed from CASCADE in 011 so anonymized negative observations survive deletion). Raw `latitude`/`longitude` (owner-only) + trigger-computed `display_latitude`/`display_longitude`. `visibility` (`public`/`approximate`/`private`), `is_zone_finding`, `zone_precision_km`. AI fields (`ai_used`, `ai_top_suggestion`, `ai_confidence`, `ai_raw_response`). ML fields (011): `is_negative_observation`, `habitat_tags`, `weather_at_observation`. GIST geo index.
- **Forum**: `forum_posts`, `comments` (self-ref threading), `post_likes`, `comment_likes`, `saved_posts`, `reports` (polymorphic: exactly one of post/comment/finding). Counts maintained by triggers. `user_id` FKs are SET NULL (011) → deleted authors render as "[slettet bruker]".
- **`moderator_roles`** (002) — `user_id` PK, `role` (`moderator`/`admin`). Source of truth for permissions.

### Prediction / data tables
- **`prediction_tiles`** (003) — precomputed raster. `tile_date`, `species_id`, `center_lat/lng`, `score` (0–100), `confidence`, `components` (JSONB), `source` (`mvp_baseline`/`sentinel_batch`/`hybrid`). GIST index. Read only via the `SECURITY DEFINER` RPC (public SELECT dropped in 015).
- **`species_occurrences`** (013) — GBIF/Artsdatabanken points. `gbif_key` (unique, idempotent import), `latitude`/`longitude`, `observed_at` (added to RPC in 014), `license`/`dataset_key` (016 — only CC0/CC-BY kept). GIST index.
- **`spot_feedback`** (021) — "Var du her? Fant du sopp?" ground truth for calibration. `found` bool, `score_shown`.
- **`occurrence_weather_features`** (022) — weather-at-find-time cache for honest ML (service-role only). Temp/humidity/rain windows/soil-moisture per occurrence.
- **`ai_identifications`** (020) — durable per-call AI counter (enforces free daily cap; counts *calls* not saved finds). RLS on with **zero policies** → service-role only (users can't reset their quota).

### Billing / compliance tables
- **`billing_subscriptions`** (004) — `user_id` FK to `auth.users` (unique). `tier`, `status` (8 Stripe statuses), Stripe IDs, `current_period_end`, `cancel_at_period_end`. User reads own; only service role writes.
- **`billing_webhook_events`** (007) — Stripe idempotency log (`event_id` unique). Service-role only.
- **`admin_audit_log`** (008) — append-only (BEFORE UPDATE/DELETE triggers raise, even for service role). `actor_id`/`target_user_id` have **no FK** (must outlive deleted users). Moderators/admins SELECT only; writes via service role.
- **`account_deletion_warnings`** (011) — 90-day grace before inactive-account deletion. User can SELECT + DELETE own (self-service "keep my account").

### Storage buckets (019)
`forum-images`, `finding-images` — public read, authenticated write only into own `${uid}/` folder, 10 MB cap, jpeg/png/webp.

### Key triggers & functions
- **`set_display_location()`** (001, rewritten 005, trigger fixed 024) — computes `display_*`: private → NULL; zone → grid-snap to `zone_precision_km`; approximate → `randomize_location()` ≤500 m; public → exact copy. **This is the coordinate-masking core.** (024 widened the trigger to fire on all columns — previously flipping `is_zone_finding` alone didn't re-stamp coords, a latent leak.)
- **`update_updated_at()`** — standard `updated_at` maintenance on many tables.
- Count-maintenance triggers on `comments`/`post_likes` → `forum_posts` counters.
- **RPCs (`SECURITY DEFINER`):** `get_findings_in_bounds`, `get_prediction_tiles_in_bounds`, `get_occurrences_in_bounds`, `search_species`, `get_user_stats`, `is_moderator()`/`is_admin()` (018 — added to break RLS recursion).

### Views
- **`public_findings`** — the public masking layer (001, redefined 005/015/023). Exposes `display_lat/lng` (never raw), masks `notes`/`location_name` unless `public && !zone`, filters out `private`. Runs `security_invoker=false` (definer privileges) — it *is* the masking boundary.
- **`species_in_season`** — species whose current month falls in their season window.

### Migration dependencies (highlights)
001 is the foundation (everything depends on it). 003 needs 001; 008 needs `moderator_roles` (002); 018 must run after 002 (fixes its recursive RLS); 006/008/015 subquery `moderator_roles`; 014 depends on 013; 016/022 depend on 013; 011 is a prerequisite for `/api/me/delete`; 015/017/023/027 depend on the (drift) `primary_image_url`/`swedish_name` columns. **Apply strictly 001 → 028.**

*(For exhaustive per-column detail, read the migrations directly and `src/types/*.ts`.)*

---

## 8. API documentation

All routes under `src/app/api/*/route.ts`, Node runtime. Standard error contract: **400** validation · **401** unauthenticated (`{error:'Ikke autentisert'}`) · **403** capability/role denied · **429** rate-limited (with `Retry-After`) · **500** internal/DB · **502** upstream (weather/Kindwise) unavailable · **503** health-degraded / AI-disabled. Auth = `supabase.auth.getUser()`; rate limiting = `checkRateLimit(key, limit, windowSec)` (all windows 60s).

| Endpoint | Methods | Auth | Rate limit/min | Gating & notes |
|---|---|---|---|---|
| `/api/health` | GET | public | none | `?fast=1` skips DB. 200 ok / 503 degraded. |
| `/api/identify` | GET (public), POST (authed) | authed (POST) | 20 | Free capped 5/day (429 over cap via `ai_identifications`); paid unlimited. 503 if AI disabled; 502 if Kindwise fails. Body `{image(base64 ≤8MB), latitude?, longitude?}` → `{suggestions[], isPlant}`. |
| `/api/prediction` | GET | optional-auth | 60 | Free → coarsened factors + top-3 hotspots + `upsellMessage`; paid → full. Query `lat,lon,radiusKm?,speciesId?`. 502 if no weather (fallback path). |
| `/api/prediction/grid` | GET | authed | 10 | Full heatmap premium-only (403 if free without `top`). Query bounds + `n(3–7)`, `top?`, `speciesId?`. Returns `cells[]`. |
| `/api/prediction/species-spots` | GET | authed | 10 | Premium-only (403 free). Returns `spots[]` (species photos on best ground). |
| `/api/mushroom-day` | GET | public | 30 | `lat,lon` → `assessMushroomDay` result + `weatherSource`. 502 if no weather. 30-min cache. |
| `/api/mushroom-forecast` | GET | public | 20 | `lat,lon` → `{today, days[≤7], flush, weatherSource}`. 502 if no weather. |
| `/api/spot-feedback` | POST | authed | 30 | `{lat,lng,found,scoreShown?,speciesId?}` → insert into `spot_feedback`. |
| `/api/billing/checkout` | POST | authed | 5 | `{plan:'premium'|'season_pass'}` → `{url}` (Stripe Checkout). 409 if already on that tier. Service-role upsert `billing_subscriptions` (incomplete). |
| `/api/billing/portal` | POST | authed | 10 | → `{url}` (Stripe Billing Portal). 400 if no `stripe_customer_id`. |
| `/api/billing/status` | GET | authed | 120 | → `{subscription, capabilities, plans}`. Drives all premium gating. |
| `/api/stripe/webhook` | POST | Stripe signature | none | Verifies `stripe-signature` + `STRIPE_WEBHOOK_SECRET`. Idempotent via `billing_webhook_events`. Upserts `billing_subscriptions`. Handles checkout.session.completed + customer.subscription.*. |
| `/api/me/export` | GET | authed | 10 | GDPR Art. 15 — JSON attachment of all user rows. |
| `/api/me/delete` | POST | authed | 5 | GDPR Art. 17 — body `{"confirm":"DELETE-MY-ACCOUNT"}`. Deletes findings then `auth.admin.deleteUser`; audit-logs `account.self_delete`; returns row-count receipt. |
| `/api/me/deletion-warning` | GET | authed | none | → `{warning: null | {warnedAt, scheduledDeletionAt}}`. |
| `/api/me/extend-retention` | POST | authed | 10 | Clears the user's `account_deletion_warnings` row. |
| `/api/admin/verified-foragers` | GET/POST/DELETE | moderator/admin | 60/30/30 | Manage forum trust badges. Audit-logs `verified_forager.upsert/delete`. Service-role. |
| `/api/cron/generate-tiles` | POST/GET | `CRON_SECRET` bearer | none | Regenerates `prediction_tiles` per region. `?region=Oslo|Trondheim|Bergen|Stavanger|Innlandet`. Service-role. |

**Service-role client** is used in: admin/verified-foragers, billing/checkout, identify (counter), me/delete, cron/generate-tiles, stripe/webhook. **Audit logging** fires in: admin/verified-foragers (POST/DELETE), me/delete.

---

## 9. AI functionality

### Identification (`/api/identify`)
- **Service:** Kindwise "Mushroom ID" (`https://mushroom.kindwise.com/api/v1/identification`), `Api-Key: PLANTID_API_KEY`. **No LLM, no prompt, no configurable model** — a pure vision classifier. `isAiEnabled()` = key present, not the placeholder, ≥20 chars; else 503 `{code:'ai_disabled'}`.
- **Request to Kindwise:** `{images:[base64], similar_images:true, language:'no', details:['common_names','taxonomy','description','edibility'], latitude?, longitude?}`. Non-OK → 502.
- **Enrichment (top-3 suggestions):** probability → percent; edibility mapped via `mapEdibility()` (`poisonous→toxic`, `highly_poisonous→deadly`, etc.); DB lookup on `mushroom_species` by latin name — **a curated species row's edibility OVERRIDES the Kindwise mapping** (trust our own catalog over the AI); adds `speciesId`, Norwegian name, image, and season fit (`seasonFit()`).
- **Ranking (`src/lib/utils/identify-ranking.ts`):** `rankOrder` fuses `probability × seasonFactor × nearbyBoost` (nearby finds within ~20 km, last 30 days). **Two hard safety guarantees:** (1) local context can only ever *boost* a `toxic`/`deadly` suggestion, never reduce it; (2) a dangerous suggestion never ends up ranked lower than the photo-ID model placed it (a post-sort pass re-inserts any sunk dangerous item).
- **Dangerous look-alikes (always run):** queries `look_alikes` for `danger_level IN ('high','critical')` and attaches `dangerousLookAlikes[]` per suggestion, sorted critical-first.

### Safety rules (why AI is never an edibility verdict)
- **`normalizeEdibility()`** — anything unrecognized/missing → `'unknown'`, never silently `'inedible'`.
- **`isDangerousEdibility()`** — true for `toxic`, `deadly`, **OR `unknown`/missing**. Unproven edibility is treated as dangerous.
- **UI (`identify/result/page.tsx`):** always-on "not a guarantee" banner; `SafetyWarning` renders a red banner + Giftinformasjonen phone (22 59 13 00) for deadly/toxic/unknown; **acknowledgement checkbox must be checked before "Save as finding" is enabled**; user actively selects which suggestion is correct; saved finds record `ai_used`/`ai_top_suggestion`/`ai_confidence`/`ai_raw_response` with `visibility:'approximate'`.
- **Fallback:** AI disabled → 503; Kindwise non-OK → 502; the free-user usage counter is best-effort (a logging hiccup never fails the identification).

### Prediction "AI" (not ML inference at request time — deterministic scoring)
- **`computeCellPrediction()` (`cell-score.ts`)** pipeline: `baseScore × speciesFit × habitatFit × hostGate`, clamped 0–100. `baseScore = environment + historical + seasonal`; `environment` blends weather with advanced factors (soil from bonitet, vegetation from volume, terrain from elevation; neutral values when missing). `occurrenceBoost` remains `1` for response compatibility.
- **Phenology (`phenology.ts` + `phenology-data.ts`)** — `phenologyFactor(speciesId, lat, dayOfYear)` looks up 52-week empirical curves auto-generated from **315,280 dated GBIF/Artsdatabanken finds, 70 species**, latitude-banded (south <61° / central 61–64° / north ≥64°). Returns null → caller falls back to hand-coded season months.
- **Per-species (`species-scoring.ts`)** — `computeSpeciesAdjustment` multiplier capped 1.3; weather fit weighted by genus prefs (17 `GENUS_PREFERENCES`); legacy path collapses out-of-season to 0.05.
- **Flush (`flush.ts`)** — `assessFlush` turns prediction into a *when* (`fruiting`/`soon`/`building`/`dry`/`dormant`), genus-specific lag, projects a flush date from the MET forecast. Powers `/api/mushroom-forecast`.
- **Occurrence density (`occurrences.ts`)** — Gaussian kernel (1.5 km bandwidth, 5 km cutoff), returned for provenance/map context but not multiplied into the score. Corrected matched validation measured 0.472 AUC.
- **Calibration (`score-calibration.ts`)** — `applyScoreCalibration` maps raw→observed probability once `spot_feedback` exists. **Empty table = identity** (safe now).

---

## 10. Security

- **Authentication:** Supabase Auth (email/password + Google OAuth). Sessions are cookie-based and refreshed in `src/lib/supabase/middleware.ts` via `getAll/setAll` cookie adapter + `supabase.auth.getUser()`. Registration records `terms_version`/`terms_accepted_at`.
- **Authorization:** RLS on every table is the primary boundary. Owner-only writes; findings SELECT is owner-only (public reads go through the masked view/RPCs). `moderator_roles` (via `is_moderator()`/`is_admin()` definer functions) gates admin/moderation. Route-level gating: `PROTECTED_PATHS = ['/profile', '/forum/new', '/map', '/admin', '/mine-steder']` in middleware → redirect to `/auth/login?redirect=…`. Billing capability gating via `getBillingCapabilities().paid`.
- **Rate limiting:** in-memory fixed-window token bucket (`src/lib/rate-limit/`). `getClientKey` = `user:<id>` when authed else `ip:<first-hop>`. Applied to 14 route groups (see §8). **Per-instance only** — swap for Redis/KV before scale. Requires Node runtime (not Edge).
- **Input validation:** every route validates coords (lat ∈ [-90,90], lng ∈ [-180,180]), body shape, image size (≤8 MB base64), bounding-box size caps on grid routes. DB CHECK constraints enforce enums/ranges.
- **Secrets:** all server-only keys are server-only env (never `NEXT_PUBLIC_`). The admin client throws if the service-role key is missing. PII redaction in the logger masks emails and `<redacted>`s any key matching password/token/secret/apikey/authorization/service_role/etc. Health check only reports "is it set" booleans.
- **Headers + CSP (`next.config.js`, every route):** HSTS (2 yrs, preload), `X-Content-Type-Options: nosniff`, **`X-Frame-Options: DENY`**, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), geolocation=(self), microphone=(), interest-cohort=()`, `X-XSS-Protection: 0`, and an **ENFORCING** `Content-Security-Policy` (allowlists Stripe, Supabase incl. `wss`, Wikimedia, Kindwise, Kartverket/statkart, OSM tiles, arcgisonline, Geonorge, SMHI/OpenWeather/Frost; `unsafe-eval` dev-only; `frame-ancestors 'none'`).
- **Audit log:** `logAdminAction` → append-only `admin_audit_log` (blocked from UPDATE/DELETE at the DB layer even for service role). Failure-safe (never fails the underlying action).
- **Data protection:** coordinate masking (§7), on-device EXIF/GPS stripping of uploads, GBIF data filtered to CC0/CC-BY only, GDPR export/delete/retention.

---

## 11. Code quality & conventions

- **Language split:** UI copy is Norwegian/Swedish (via `next-intl`, keys in `messages/nb.json` + `sv.json` — **keep both in sync**). Code identifiers, comments, commit messages, and agent-facing docs are English.
- **Path alias:** `@/*` → `src/*` (tsconfig + vitest). Use it for imports.
- **File layout:** API routes colocated at `src/app/api/<name>/route.ts`. Tests live in `__tests__/` folders next to source. Pure utility functions have tests; UI is largely untested.
- **State:** TanStack Query for all server state (prefer over manual `useEffect` fetches). Local React state + refs for UI. **Zustand is a dependency but UNUSED** — there is no established global-store pattern; if you add global client state, pick one and document it.
- **Supabase client discipline:** `client.ts` (browser/anon) in `'use client'` code only; `server.ts` in server components/route handlers; `admin.ts` (service role) server-only, never imported client-side.
- **Region routing:** all country-specific behavior goes through `getRegion` (`src/lib/utils/region.ts`).
- **Prediction scoring:** change scoring only in `computeCellPrediction` (`cell-score.ts`) so live + tiles never drift.
- **Safety invariants (identify):** never let local context bury a poisonous suggestion; treat unknown edibility as dangerous; never present AI as an edibility verdict.
- **Feature flags:** `src/lib/flags.ts` (`forumInNav`, `tripMode` — both currently false; code paths live but hidden).
- **Commits:** short imperative English subject (e.g. "Offline map: cache the active base layer"). Co-author trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Commit/push only when the founder asks; branch first if on `main`.
- **The map is a maintenance hotspot:** `MushroomMap.tsx` is a single ~1625-line client component; Leaflet popups are inline-styled raw HTML strings (not Tailwind) because they're injected into Leaflet. Expect to spend time there for any map change.
- **Two hardcoded couplings must move together:** the three tile templates in `offlineMap.ts` ↔ `isMapTileRequest` in `public/sw.js` ↔ the map's base-layer construction.

---

## 12. Test status

- **Unit (Vitest):** ~262 tests across `src/lib/**/__tests__/`. Well-covered: `billing/plans`, `utils/prediction`, `utils/species-scoring`, `utils/region`, `utils/edibility`, `utils/identify-ranking`, `utils/offlineMap`, `log/*`, `rate-limit/*`, `weather/*` (forecast, soil-moisture, samples), `prediction/*` (phenology, flush, cell-score, occurrences, mushroom-day, score-calibration), `forest/*`, `nibio/sr16`, `slu/jordart`. Run: `npm run test` (or `npm run test -- <path>`).
- **E2E (Playwright, `e2e/*.e2e.ts`):** three projects — `setup` (logs in the QA user → saves `e2e/.auth/state.json`), `public` (no auth: `smoke`, `public-api`, `auth-pages`, `billing-gating`), `authed` (uses saved session: `authed-flows`, `map-geo`). `npm run qa` targets local dev (auto-starts/reuses dev server); `npm run qa:prod` runs the `public` project against live mycelet.com. Authed tests **must stay read-only** (one Supabase project — writes hit prod). Needs `npm run qa:setup` once.
- **What's missing:** UI components are largely untested (only the map/identify logic is exercised via e2e). No coverage for the `scripts/` pipeline beyond the pure-math backtests. Middleware auth gating can't be tested locally (Turbopack skips middleware) — verify via `qa:prod`.
- **Prediction validation (separate from tests — `scripts/`):** `validation:preflight`, `validation:all`, `validation:report`, `backtest:phenology`, `backtest:full-pipeline`, `calibrate:spot-feedback`, `calibrate:fit-score`, `fit:weather-preferences`, `fit:sdm-logistic`, `features:occurrence-weather`. These are **audit tools** (they do not write production weights). Reading guide in `docs/prediction-validation-runbook.md`: <100 rows = instrumentation check only; 500+ = start calibrating; positive Brier skill is the minimum to claim calibration beats a flat baseline.

---

## 13. What Codex should do first (prioritized)

1. **Read the map so you can safely change it.** `MushroomMap.tsx` (1625 lines) touches offline cache, region auto-switch, RPCs, premium gating, and GPS. Understand the offlineMap.ts ↔ sw.js coupling before touching maps.
2. **Confirm the live DB schema vs migrations (schema drift).** Verify `mushroom_species.primary_image_url` + `swedish_name` exist in prod and, ideally, add a migration `029_*` that creates them so a clean replay works. This is the single riskiest gap.
3. **Wire RevenueCat IAP** (the highest-value business unblock for App Store): add `@revenuecat/purchases-capacitor`, build the native purchase UI (unhide the `NonNativeOnly`-wrapped pricing on native), and a RevenueCat webhook that upserts `billing_subscriptions` with the SAME `hasPaidAccess` logic as Stripe. Then create IAP products (79/mo `no.mycelet.app.premium.monthly`, 249/yr `no.mycelet.app.seasonpass.yearly`) and sandbox-test.
4. **Deploy the retention crons** (`supabase/functions/` Edge Functions, gated by `CRON_SECRET`) — the tables + `/api/me/extend-retention` already exist; the purge jobs don't run yet. Locked retention numbers are in `docs/retention-policy.md`.
5. **Swap rate limiting to Upstash Redis / Vercel KV** before any traffic spike (in-memory is per-instance).
6. **Update `CLAUDE.md`** to fix the stale points in §14 (so future agents aren't misled).
7. Then: Sentry, prediction weather-feature table (022), species pulje 2 / genus profiles.

Before each: run `npm run typecheck && npm run test && npm run build`; delete iCloud `"* 2.ts"` dupes first. Deploy only when the founder says OK (push to `main` = production).

---

## 14. Things Codex must NOT change (without a very good reason)

- **The coordinate-masking model.** `set_display_location` trigger + `public_findings` view + owner-only findings RLS + the `visibility`/`is_zone_finding` model. Changing any one without the others leaks user locations. If you touch visibility logic, update the trigger AND the view AND verify RLS.
- **The identify safety invariants.** Never let local context bury a poisonous suggestion; unknown edibility = dangerous; the acknowledgement gate before saving; AI never framed as an edibility verdict; the critical-look-alike surfacing. These are legal + safety-critical.
- **`getRegion` and its border approximation.** It's the source of truth for weather + forest + basemap routing; the current NO/SE bounding boxes + `noSeBorderLon` piecewise line were tuned to fix real Sweden bugs (Göteborg). Don't "simplify" it back to a fixed cutoff.
- **`computeCellPrediction` as the single scoring path.** Don't fork scoring between live and tiles.
- **The append-only audit log.** Don't add UPDATE/DELETE paths; the DB trigger blocks them by design.
- **The Stripe webhook idempotency + `billing_subscriptions` as the entitlement source.** IAP must upsert the same table with the same `hasPaidAccess` logic — don't create a parallel entitlement system.
- **Security headers / enforcing CSP.** Don't loosen CSP or drop headers; add allowlist hosts narrowly if a new external resource is needed.
- **Migration ordering / never rewrite an applied migration.** Migrations are applied by hand in the dashboard and already ran in prod. Add new numbered migrations; never edit 001–028.
- **Don't commit iCloud `"* 2.*"` duplicate files.** Don't auto-deploy — the QA loop detects+proposes but never deploys.
- **`security_invoker=false` on `public_findings`.** It intentionally runs with definer privileges; that's the masking boundary.

---

## 15. Known hard parts (and how to handle them)

- **The prediction engine's honesty problem.** The validated signal is **temporal** (phenology/flush, timing AUC 0.882). The corrected **spatial** "where" baseline is near chance (`fullCore` 0.504; habitat-only 0.536); SGU drainage doesn't discriminate (~0.47). **How to handle:** keep marketing "when" (mushroom-day/forecast/flush), don't over-promise "where." Historical occurrence density is no longer a score boost. The real spatial lever is a bias-corrected SDM after richer NO/SE features.
- **Sweden data asymmetry.** CORINE gives coarse forest *type* only. Upgrading to Skogsstyrelsen "Skogliga grunddata" (volume/height/basal area) is the documented path (`docs/swedish-forest-data-upgrade.md`) — build `src/lib/skogsstyrelsen/` returning the same `ForestProperties` shape, feature-flag it, validate a SE lift before switching the default.
- **The map component's size + Leaflet/React boundary.** State lives in refs (Leaflet layers) to avoid React re-renders; popups are raw HTML strings. Read the existing patterns before editing; don't naively "React-ify" the Leaflet layers.
- **Middleware invisibility in dev.** Turbopack skips middleware locally → protected-route + gating behavior only shows in prod. Use `npm run qa:prod` to verify auth gating.
- **Rate limiting semantics.** Per-instance in-memory → don't rely on exact limits; the swap to Redis/KV is a prerequisite for correctness at scale.
- **Schema drift (§5/§13).** A clean DB replay fails without the two out-of-band columns. Handle before any disaster-recovery or fresh-environment setup.
- **Two live-but-hidden feature paths.** Forum + trip-mode are behind flags; they compile and have code, so don't assume unused code is dead — check `FLAGS`.
- **iCloud + worktree footguns.** Duplicate files and dev-server-in-main-dir will waste time if unknown (§5).

---

## 16. Future improvements (prioritized roadmap)

**P0 — unblock revenue / launch**
1. RevenueCat IAP + App Store submission (native billing is the last gate).
2. Fix schema drift (migration for `primary_image_url` + `swedish_name`).
3. Retention cron Edge Functions live (GDPR obligation).

**P1 — production hardening**
4. Distributed rate limiting (Upstash Redis / Vercel KV).
5. Sentry error monitoring with PII scrubbing.
6. Register `MET_FROST_CLIENT_ID` (better NO weather); lawyer-review `/personvern`; sign DPAs.

**P2 — product depth (the moat)**
7. 7-day forecast strip + named peak day surfaced prominently; "modne nå" alert (start as a weekly email). (Competitors paywall a weaker version of the flush forecast Mycelet already computes.)
8. Weather-at-find-time feature table (022) filled → decide the next prediction modeling step (calibrate score / change habitat rules / commit to bias-corrected SDM).
9. Species "pulje 2" (~28 more → 100) + genus profiles for Imleria/Galerina/Tricholoma.
10. Sweden forest-data upgrade (Skogsstyrelsen) — only after a validated SE lift.
11. Map cheap wins: Lantmäteriet SE basemap, official orthophoto per country, GPX export + "find my car" waypoint, look-alike quiz.

**P3 — strategic (defer)**
12. Unlaunch the forum flag when ready; property/allemannsrett overlay (Kartverket Matrikkel WMS) as a differentiator.
13. MapLibre/vector migration — biggest lift, reworks the whole marker/cluster/offline stack; defer.
14. Broader "vill mat" expansion (berries/wild herbs reuse the phenology+map engine) — Mycelet's multi-year direction, NOT a separate app.

---

## Context for Codex

*(Self-contained brief, ~1,000 words / well under 2,000 — read this first if you read nothing else.)*

**Mycelet** is a live (mycelet.com) Norwegian + Swedish mushroom-foraging app for recreational foragers, built by a **solo, non-technical founder**. Stack: **Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind + Supabase (Postgres/PostGIS) + Stripe + Leaflet**, hosted on **Vercel** (auto-deploys on push to `main`; one Supabase project, no staging — writes hit prod). Native iOS via a **Capacitor hosted-URL shell** loading the live site (App Store submission pending IAP). UI copy is Norwegian/Swedish via `next-intl`; code + comments + this doc are English.

**Four product pillars:** (1) **AI identification** via the Kindwise Mushroom-ID vision API (not an LLM); (2) a **prediction engine** for *when* (empirical phenology + flush timing, the validated signal) and *where* (forest/weather/occurrence scoring, honestly weak spatially); (3) a **community map** with privacy-masked finds + GBIF occurrence points + premium offline caching; (4) **reference + forum** (species catalog with safety look-alikes, calendar, verified-expert forum — forum currently hidden behind `FLAGS.forumInNav`).

**Architecture spine.** UI + API live under `src/app/` (pages + `api/*/route.ts`). All business logic is in `src/lib/`. Three files matter most: **`src/lib/prediction/cell-score.ts`** (`computeCellPrediction` — the ONE scoring function shared by live `/api/prediction` and the tile-generation cron, so they never drift), **`src/lib/weather/index.ts`** (`fetchWeatherSummary` — region-routed weather, returns null if no provider), and **`src/lib/utils/region.ts`** (`getRegion(lat,lon)` → NO/SE/other — the shared router for weather, forest source, and basemap; all country-specific behavior MUST go through it). Supabase clients are split: `client.ts` (browser/anon), `server.ts` (cookie session), `admin.ts` (service role, server-only), `middleware.ts` (session refresh + auth gating). Billing derives everything from `getBillingCapabilities(subscription).paid`, populated by the idempotent Stripe webhook into `billing_subscriptions`.

**Data model.** Postgres + PostGIS, RLS on every table, 28 migrations (`supabase/migrations/001..028`) applied BY HAND in the dashboard in order (hard dependencies; never edit an applied migration, add new numbered ones). Central table `findings` has raw `latitude/longitude` (owner-only via RLS) and trigger-computed `display_latitude/longitude`. The **`set_display_location` trigger** + the **`public_findings` view** (runs `security_invoker=false`) + owner-only findings RLS form the **coordinate-masking system**: public = exact, approximate = ±500 m jitter, zone = grid-snapped, private = NULL. This is a safety/trust feature — changing one piece without the others leaks locations. Other key tables: `mushroom_species` (catalog; **⚠ schema drift:** `primary_image_url` + `swedish_name` are used by migrations 015/017/023/027 but never created in 001–028 — they exist in prod out-of-band, so a clean replay FAILS without adding them first), `prediction_tiles` (precomputed scores, read via a SECURITY DEFINER RPC), `species_occurrences` (186k GBIF points, CC0/CC-BY only), `billing_subscriptions`, append-only `admin_audit_log`, `ai_identifications` (free daily-cap counter, service-role only).

**API contract.** ~18 routes, Node runtime. Auth = `supabase.auth.getUser()`. Errors: 400 validation / 401 unauth / 403 gated / 429 rate-limited / 500 internal / 502 upstream weather-or-Kindwise / 503 disabled. Rate limiting is **in-memory, per serverless instance** (effective limit ≈ N × configured — swap for Redis/KV before scale) on 14 route groups. Billing gates: free users get coarsened prediction + 5 AI identifications/day; paid get full detail + unlimited AI + offline maps + "promising spots."

**AI safety (legal-critical, do not weaken).** Kindwise returns species probabilities. The app: overrides AI edibility with its own curated catalog when a species matches; treats unknown/missing edibility as *dangerous*; always surfaces critical look-alikes; requires an **acknowledgement checkbox before saving a find**; and guarantees local context can only ever *boost* a poisonous suggestion, never bury it. AI is **never** presented as an edibility verdict.

**Prediction honesty (do not over-claim).** Validated signal is **temporal**: empirical phenology curves (learned from 315k dated GBIF finds, 69+ species, latitude-banded) give timing AUC 0.882; flush timing turns this into a "when to go" forecast. The corrected **spatial** baseline is near chance (`fullCore` 0.504; habitat-only 0.536), and Swedish forest data (CORINE) is coarser than Norwegian NIBIO. Occurrence density is informational only. Market "when," not "where," until richer features beat the matched target-group baseline.

**Security.** Enforcing CSP + strict headers (HSTS, `X-Frame-Options: DENY`, tight `Permissions-Policy`) on every route. RLS is the authz boundary; `PROTECTED_PATHS` in middleware redirects unauthed users. Logger redacts PII (emails + secret-pattern keys). Append-only audit log for admin actions. Full GDPR: `/api/me/export` (Art. 15), `/api/me/delete` (Art. 17), retention warnings + `/api/me/extend-retention`.

**Known footguns.** (1) **Middleware doesn't run in Turbopack dev** → auth gating only testable via `npm run qa:prod`. (2) The project is in an **iCloud folder** that spawns `"* 2.ts"` duplicate files — never commit them; delete before `npm run build`; iOS CLI codesign fails (use Xcode GUI). (3) The dev server runs in the main dir; **git-worktree edits don't reach it**. (4) **`CLAUDE.md` is stale** on four points — CSP is now enforcing (not report-only), `X-Frame-Options` is DENY (not SAMEORIGIN), rate limiting covers 14 routes (not 5), migrations run to 028 (not 021); trust the code. (5) `zustand` is a dependency but **UNUSED** (no `src/store/`). (6) The offline tile templates in `offlineMap.ts` ↔ `isMapTileRequest` in `public/sw.js` are a **hardcoded coupling that must move together** (a Sweden-offline bug from this exact mismatch was fixed 2026-07-13, commit 4f51dbb).

**Workflow.** `npm run dev` (localhost:3000), `npm run typecheck`, `npm run test` (Vitest, ~262 tests in `__tests__/`), `npm run build` (runs tsc), `npm run qa`/`qa:prod` (Playwright product-eval loop — detects+proposes but NEVER auto-deploys). Commit style: short imperative English subject; branch before committing on `main`; deploy (push to `main`) **only when the founder says OK**. Standing habit: when a bug is reported, fix it, then audit the whole app for siblings of that bug-class (Sweden/Norway-centric assumptions have bitten repeatedly).

**First priorities:** (1) understand `MushroomMap.tsx` before any map change; (2) fix the schema drift with a new migration; (3) wire RevenueCat IAP → App Store; (4) deploy the retention crons; (5) swap rate limiting to Redis/KV. **Do NOT change without strong cause:** the coordinate-masking system, the identify safety invariants, `getRegion`, the single `computeCellPrediction` path, the append-only audit log, `billing_subscriptions` as the one entitlement source, and applied migrations. Deeper detail on every point is in the numbered sections above and in `docs/` (`roadmap.md`, `prediction-validation-runbook.md`, `retention-policy.md`, `qa-sjekkliste.md`) + `CLAUDE.md`.
