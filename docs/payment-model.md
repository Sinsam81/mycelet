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

## App Store (RevenueCat)

Kjøp i iOS-appen går gjennom Apple og RevenueCat, og `POST /api/revenuecat/webhook`
skriver den **samme** raden i `billing_subscriptions` som Stripe-webhooken. Tilgangen
avgjøres derfor ett sted (`hasPaidAccess`), uansett hvor kunden kjøpte.
`metadata.provider` sier hvem som skrev raden sist; en Apple-hendelse kan aldri
overstyre et aktivt Stripe-abonnement, og omvendt. Selve reglene ligger i
`src/lib/billing/revenuecat.ts` (ren logikk, testet).

| Hendelse fra RevenueCat | Hva som skjer med raden |
| --- | --- |
| `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION` m.fl. | Tilgang til `expiration_at_ms`. `trialing` når `period_type` er `TRIAL`, ellers `active`. |
| `CANCELLATION` (fornyelsen er slått av, vanligvis av kunden) | Tilgangen står ut perioden, `cancel_at_period_end` settes. En oppsagt **prøve** forblir `trialing`. |
| `CANCELLATION` med `cancel_reason = CUSTOMER_SUPPORT` | Refusjon: tilgangen tas med én gang. |
| `CANCELLATION` med `cancel_reason = BILLING_ERROR` | **Skrives ikke.** Se under. |
| `BILLING_ISSUE` | Med frist hos Apple: tilgang til fristen (`trialing` hvis det var første trekk etter en prøve). Uten frist: `past_due`. |
| `EXPIRATION` | Tilgangen tas. |

**Betalingsproblem = to hendelser.** Når en fornyelse feiler, sender RevenueCat
`BILLING_ISSUE` og en `CANCELLATION` med `cancel_reason = BILLING_ERROR` samtidig,
og rekkefølgen de kommer fram i er ikke garantert. Bare `BILLING_ISSUE` bærer
fristen Apple gir kunden. Fram til november 2026 skrev begge, og fristen gikk
tapt uansett rekkefølge: kom `BILLING_ISSUE` først, ble fristen overskrevet med
en utløpsdato som alt var passert; kom `CANCELLATION` først, ble `BILLING_ISSUE`
forkastet som utdatert. Nå skriver bare `BILLING_ISSUE`, og `RENEWAL` (betalingen
gikk i orden) eller `EXPIRATION` (fristen ute) avslutter.

**Manuelt tildelt tilgang** (`metadata.source = 'manual_grant'`: founder-passet,
App Review-demokontoen, kundeservice) er et gulv ingen butikkhendelse kan senke.

**Frister.** Kallene ut fra betalingsrutene har en frist, så et tregt svar hos
Stripe eller Supabase ikke holder en hendelse, et kjøp eller en sidevisning
hengende:

- **Hvert kall til Stripes API: 10 s og ett nytt forsøk.** Satt på selve
  klienten (`getStripeServerClient` i `src/lib/stripe/server.ts`), så det
  gjelder alle som bruker den — Stripe-webhooken, `/api/billing/checkout`,
  `/api/billing/portal` og oppsigelsen i `/api/me/delete` — og det neste
  kallet noen legger til. SDK-ens egen standard er 80 s per forsøk.
- **Oppslaget «har e-posten hatt et abonnement før?»: 4 s per kall, 5 s
  samlet.** Fristen er en del av regelen selv (`harHattTilgangFor` i
  `src/lib/billing/tidligere-abonnent.ts`), som `/api/billing/status`
  (`kanFaaProve`), forsiden for innloggede og checkout alle kaller.
- **Supabase Auth og prøvepåminnelsen i Stripe-webhooken: 8 s.**

Går en frist ut, skjer nøyaktig det samme som når kallet feiler: webhooken
svarer ikke-2xx og Stripe leverer hendelsen på nytt (for prøvepåminnelsen:
sendingen logges som mislykket og hendelsen regnes som behandlet, som før),
checkout, portalen og kontoslettingen svarer med den vanlige feilmeldingen, og
oppslaget svarer som om Stripe ikke svarte — gratisuka som standard.

Oppslaget har **én** frist med vilje. Den sto først bare i statusruta: da
lovet headeren, arket og prissiden gratisuka etter 5 s, mens checkout ventet
på det ekte svaret, fant det gamle abonnementet og lot Stripe trekke samme dag.
Nå gir en treg dag hos Stripe samme svar på flatene og i kjøpet, og forsiden
venter ikke lenger på Stripe enn statusruta gjør.

Én feil ble rettet i samme omgang, fordi den avgjorde hva «ikke noe svar»
betyr: spørsmålet «finnes brukeren fortsatt?» i Stripe-webhooken svarte «nei»
på enhver feil, og «nei» sier opp abonnementet hos Stripe (det er nettet for
kontoer som er slettet mens Stripe fakturerer videre). Nå er det bare et
uttrykkelig «finnes ikke» (404) som gjør det. Et kort utfall hos Supabase Auth
midt i en fornyelse kan ikke lenger si opp abonnementet til en betalende kunde.

**Gjenstår.** Ingen kaller lenger Stripe med SDK-ens standardfrist. To ting
står igjen:

- Flatene og kjøpet gjør hvert sitt oppslag, til hver sin tid. Svarer Stripe
  for sent på det ene og i tide på det andre, kan de fortsatt være uenige —
  i verste fall er en tidligere kunde lovet en uke kjøpet ikke gir. Stripes
  betalingsside viser beløpet som trekkes i dag før kunden bekrefter.
- Databasekallene mot Supabase har ingen frist per kall; `maxDuration` på
  rutene er nettet under dem. En frist hører hjemme ett sted, i
  `createAdminClient` (`src/lib/supabase/admin.ts`), ikke i hvert kall.

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
måned» (bekreftet mot Apples lookup-API 16.09.2026, versjon 1.0.1) og kan bare endres ved neste versjonsinnsending. Adopter da den svenske
løsningen («aktuelle priser vises i appen og i App Store») permanent, så
forsvinner denne koblingen.

**📌 Eksplisitt eksperiment for oktober:** vurder 129 kr/mnd HVIS RevenueCat
viser at månedsplanen kannibaliserer Sesongpasset (høy månedsandel). Ved 129 er
måneden en ren lokkepris (2 mnd = 258 > 249). Besluttet UTSATT 2026-08-31 pga.
null datapunkter, førsteinntrykk for ny app, og at prisøkninger for nye kunder
er gratis å gjøre senere.

