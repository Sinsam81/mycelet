# Betalingsmodell (MVP)

## Planer
- `Gratis`: 5 AI-identifikasjoner per døgn.
- `Premium`: 99 kr/mnd (Stripe abonnement, 7 dagers gratis prøve for førstegangskjøpere).
- `Sesongpass`: 249 kr/år (Stripe abonnement, fornyes årlig — ikke engangskjøp).

## Teknisk implementasjon
- Stripe Checkout for kjøp:
  - `POST /api/billing/checkout`
- Stripe Customer Portal for administrasjon:
  - `POST /api/billing/portal`
- Stripe webhook for synkronisering:
  - `POST /api/stripe/webhook`
- Status for klient:
  - `GET /api/billing/status`
- Idempotency og drift:
  - `billing_webhook_events` logger Stripe-events og stopper duplikatprosessering
  - Checkout bruker idempotency key for å unngå duplikate sessions ved dobbelklikk/nettverksglitch

## Dataflyt
1. Bruker velger plan på `/pricing`.
2. App oppretter Stripe checkout-session.
3. Stripe sender webhook ved fullført kjøp/abonnementsendring.
4. `billing_subscriptions` oppdateres i Supabase.
5. API-er (f.eks. `/api/identify`) sjekker abonnement før rate limit.

## Database
- Tabell: `billing_subscriptions`
  - `user_id`, `tier`, `status`, Stripe-IDer, periodefelter, metadata.
- Tabell: `billing_webhook_events`
  - `event_id`, `event_type`, `status`, `payload`, `error_message`, tidsstempler.
- RLS:
  - Bruker kan lese egen rad.
  - Kun service role kan skrive.

## Feature-gating i MVP
- `POST /api/identify`
  - Betalt plan (`premium`/`season_pass` + aktiv status): ubegrenset.
  - Gratis: maks 5/døgn.
- `GET /api/prediction`
  - Betalt plan: full hotspot-detalj.
  - Gratis/utlogget: begrenset hotspot-sett (coarse visning + upsell-message).

## Prisendring 2026-08-31: Premium månedlig 79 → 99 kr

Besluttet av eier sammen med innføring av 7 dagers gratis prøveperiode.
Rasjonale: styrker Sesongpass-ankeret (to høstmåneder = 198 kr mot 249 for
helt år) og hever CAC-taket for annonsene. Gjennomført:

- Apple: Scheduled Price Change fra 2026-09-01, «Preserve current price» for
  eksisterende (ASC, 175 land, basert på 99 NOK).
- Stripe: NY pris `price_1UAVfuPvIc25pUd2GDMz6iF4` (99 NOK/mnd) på
  prod_UgdoS42xnanlgP; gamle 79-prisen består for eksisterende abonnenter.
  `STRIPE_PRICE_PREMIUM_MONTHLY` i Vercel må peke på den nye ID-en.
- Kode: plans.ts, kjøpsvilkår (nb+sv), begge statiske landingssider, vaktest.

**⚠️ Restanse:** den NORSKE App Store-beskrivelsen sier fortsatt «79 kr per
måned» og kan bare endres ved neste versjonsinnsending. Adopter da den svenske
løsningen («aktuelle priser vises i appen og i App Store») permanent, så
forsvinner denne koblingen.

**📌 Eksplisitt eksperiment for oktober:** vurder 129 kr/mnd HVIS RevenueCat
viser at månedsplanen kannibaliserer Sesongpasset (høy månedsandel). Ved 129 er
måneden en ren lokkepris (2 mnd = 258 > 249). Besluttet UTSATT 2026-08-31 pga.
null datapunkter, førsteinntrykk for ny app, og at prisøkninger for nye kunder
er gratis å gjøre senere.

