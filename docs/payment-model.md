# Betalingsmodell (MVP)

## Planer
- `Gratis`: 5 AI-identifikasjoner per døgn.
- `Premium`: 79 kr/mnd (Stripe abonnement).
- `Sesongpass`: 199 kr per sesong (Stripe engangsbetaling, aktiv ut november).

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
