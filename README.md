# Mycelet

Teknisk grunnmur for Mycelet (Next.js 16 + TypeScript + Tailwind + Supabase).

## Status
- Sprint 0: grunnstruktur opprettet
- App shell med `Header` + `BottomNav`
- Design tokens i `src/app/globals.css`
- Basiskomponenter: `Button`, `PageWrapper`, `cn`
- MVP-prediksjon: `/api/prediction` + hotspotpanel i kart
- Kart: arts-spesifikk prediksjon via filter + heatmap-overlay
- Prediksjonsmotor: live skog/vær/fenologi + precomputed cron-tiles, med valideringsrunbook i `docs/prediction-validation-runbook.md`
- Admin/dev: `/admin/prediction` for inspeksjon av prediction tiles
- Betaling: Stripe checkout/portal/webhook + `/pricing` og abonnementsgating i `/api/identify`
- Webhook-idempotency: `supabase/migrations/007_billing_webhook_events.sql` + duplikatbeskyttelse i Stripe webhook
- Sone-funn: hemmeligsted-vennlig deling i kart/forum (`supabase/migrations/005_zone_findings.sql`)
- Kommersiell plan: `docs/commercial-mvp-plan.md`
- Forum: verifisert plukker-badge + deling av funn (`supabase/migrations/006_verified_foragers.sql`)
- Forum trust-oppsett: `docs/forum-trust.md`
- Trust admin-side: `/admin/forum-trust`
- Offline MVP: service worker + manifest + lagring av kartområder (premium-gated) i kartvisning
- Offline-notat: `docs/offline-map-mvp.md`
- 8-stegs status: `docs/8-step-status.md`

## Kom i gang
1. Installer avhengigheter:
  - `npm install`
2. Kopier miljøvariabler:
   - `cp .env.example .env.local`
3. Start utviklingsserver:
  - `npm run dev`

## Checkpoint-script
- For rask pause/fortsett med git:
  - `./scripts/checkpoint.sh`

## Prediksjonsvalidering
- Kalibrering mot brukerfeedback:
  - `npm run calibrate:spot-feedback`
- Kandidat-tabell for scorekalibrering:
  - `npm run calibrate:fit-score`
- Sampled target-group audit av habitat/skog-signalet:
  - `npm run backtest:full-pipeline`
- Historisk vær-feature-cache for senere modellering:
  - `LIMIT=25 DRY_RUN=1 npm run features:occurrence-weather`
- Empirisk sjekk av slekt-/artsværprofiler:
  - `npm run fit:weather-preferences`
- Runbook:
  - `docs/prediction-validation-runbook.md`

## Stripe (lokal test)
1. Sett `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PREMIUM_MONTHLY`, `STRIPE_PRICE_SEASON_PASS` i `.env.local`.
2. Kjør Stripe webhook forwarding mot:
   - `/api/stripe/webhook`
3. Test kjøp fra:
   - `/pricing`

## Neste sprintforslag
1. Supabase-auth (`src/lib/supabase/*`, `middleware.ts`, login/register)
2. Species-modul med søk og detaljsider
3. API-ruter for `/api/identify`
