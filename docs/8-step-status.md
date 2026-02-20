# 8-stegs status (implementasjon)

## Pause-checkpoint (2026-02-14)
- Kodearbeid for steg 1–8 er ferdig i repoet.
- Dette gjenstår før release-klar verifisering:
  - Kjør migrasjoner i Supabase.
  - Kjør `typecheck`, `lint`, `test`.
  - Manuell QA av `/map`, `/pricing`, `/identify`.

## Neste oppgaver (prioritert)
1. Installer/verifiser lokal toolchain (`node`, `npm`, `supabase`).
2. Kjør `supabase db push` og bekreft at migrasjon `007_billing_webhook_events.sql` er aktiv.
3. Kjør `npm install && npm run typecheck && npm run lint && npm run test`.
4. Kjør manuell test av:
   - Offline-kart lagring i `/map` (med betalt konto)
   - Checkout + portal i `/pricing`
   - Stripe webhook til `/api/stripe/webhook`
5. Oppdater denne filen med testresultat og eventuelle feil før neste utviklingsrunde.

## Steg 1: Build/typecheck/lint
- Status: klar til kjøring, men ikke kjørt i dette miljøet (mangler `node`/`npm`).
- Kjør lokalt:
  - `npm install`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`

## Steg 2: Supabase migrasjoner
- Status: ferdig definert, ikke kjørt her (mangler `supabase` CLI).
- Kjør lokalt:
  - `supabase db push`

## Steg 3: Offline-kart MVP
- Status: implementert.
- Inkluderer service worker, manifest, premium-gatet lagring av kartområder, og lokal tile-cache.

## Steg 4: Prediksjon v2
- Status: implementert.
- `/api/prediction` returnerer nå modellversjon + faktorer (`vegetation`, `moisture`, `terrain`, `soil`, `weatherTrend`).

## Steg 5: Betalingsmodell hardening
- Status: implementert.
- Checkout idempotency key + beskyttelse mot kjøp av samme aktive plan.
- Stripe webhook idempotency-logg (`billing_webhook_events`).

## Steg 6: Forum tillit/verifisering
- Status: implementert.
- Moderator/admin-API + adminside for badge-håndtering (`/admin/forum-trust`).

## Steg 7: Testgrunnlag
- Status: implementert (nye unit-tester lagt til).
- Nytt:
  - `src/lib/utils/__tests__/prediction.test.ts`
  - `src/lib/utils/__tests__/offlineMap.test.ts`
  - `src/lib/billing/__tests__/plans.test.ts`

## Steg 8: Dokumentasjon og operativ klargjøring
- Status: implementert.
- Oppdatert README + docs for payment, vegetation, offline og 8-stegsstatus.
