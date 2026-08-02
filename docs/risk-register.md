> ⚠️ **AVLØST 2. august 2026.** Denne rapporten ble skrevet mot branch-commit `c9ef78b`, ikke
> mot main, og en etterkontroll av alle 39 konkrete funn ga: 13 fortsatt sanne, 11 allerede
> fikset, 6 uverifiserbare, 2 utdaterte og **7 som aldri var sanne** — tre av dem med
> henvisninger til filer som ikke finnes. Beholdt som historikk og sammenligningsgrunnlag.
> Gjeldende revisjon: `docs/lanseringsrevisjon-funn.md`, `-inventar.md`, `-beslutning.md`.

# SoppJakt risikoregister

**Dato:** 1. august 2026  
**Skala:** P0 = lanseringsblokker, P1 = høy risiko før offentlig beta/betaling, P2 = kontrollert forbedringsrisiko.

## Aktive risikoer

| ID | Prioritet | Risiko | Sannsynlighet | Konsekvens | Evidens | Tiltak | Eier | Lukkekriterium |
|---|---|---|---|---|---|---|---|---|
| R-001 | P0 | Heuristisk kartscore tolkes som sannsynlighet | Høy | Høy | `src/components/map/MushroomMap.tsx:191`, `src/lib/prediction/cell-score.ts:86` | Endre til forholdsscore, fjern `%`, vis datakvalitet og modellversjon | Produkt + data | Ingen sannsynlighetspåstand; brukertest viser korrekt forståelse |
| R-002 | P0 | AI-identifikasjon tolkes som tillatelse til å spise | Høy | Kritisk | `src/components/identify/IdentifyResult.tsx:49`, `src/components/identify/SafetyWarning.tsx:15` | Fjern spiselighetsgodkjenning fra AI-resultat, ekspertflyt, faglig godkjenning | Produkt + fagansvarlig | Sikkerhetsreview bestått; null misforståelser i test |
| R-003 | P0 | Kjente sårbarheter i produksjonsavhengigheter | Middels | Høy | `package.json:48`; `npm audit --omit=dev` | Oppgrader, regresjonstest, dependency gate i CI | Teknisk leder | Ingen høy/kritisk prod-sårbarhet uten godkjent unntak |
| R-004 | P1 | Eksakt GPS deles med AI-leverandør | Middels | Høy | `src/app/api/identify/route.ts:145` | Standard ingen posisjon; grov kvantisering og separat samtykke | Personvern + backend | Nettverkstest viser ingen eksakt GPS; samtykke dokumentert |
| R-005 | P1 | Åpen redirect via login/register | Middels | Høy | `src/app/auth/login/page.tsx:39`, `src/app/auth/register/page.tsx:84` | Felles server-/klientvalidator og sikkerhetstester | Backend | Eksterne/protokoll-relative mål avvises i test |
| R-006 | P1 | Rate limit kan omgås mellom serverless-instansene | Høy | Middels/høy | `src/app/api/identify/route.ts:66`, `src/app/api/prediction/route.ts:107` | Delt atomisk rate limit i Redis/database | Backend/ops | Lasttest på flere instanser håndhever samme grense |
| R-007 | P1 | Kontosletting gir delvis slettet konto | Lav/middels | Høy | `src/app/api/me/delete/route.ts:130–179` | Idempotent slettingsjobb med status, retry og audit | Backend + personvern | Feilinjeksjonstest fullfører eller gjenopptar alle steg |
| R-008 | P1 | Beholdte negative observasjoner er ikke tilstrekkelig anonymisert/transparente | Middels | Høy | `src/app/api/me/delete/route.ts:9–39` | Dokumenter formål/retention; deidentifikasjonstest; juridisk vurdering | Personvern + data | DPIA og retention-policy godkjent |
| R-009 | P1 | Privilegert offentlig view lekker posisjon ved fremtidig migrasjon | Lav/middels | Kritisk | `supabase/migrations/029_findings_context.sql:48–85` | Security invoker/smal RPC, eksplisitte kolonner, RLS-regresjon | Databaseansvarlig | Anon-test kan aldri lese rå koordinat uten eksplisitt public |
| R-010 | P1 | Sesongpass oppfattes som engangskjøp, men fornyes årlig | Høy | Høy | `src/lib/billing/plans.ts:19`, `src/app/api/billing/checkout/route.ts:72` | Engangspass eller tydelig abonnement/fornyelse | Produkt + juridisk | Pris-/fornyelsestest bestått og vilkår godkjent |
| R-011 | P1 | Stripe/RevenueCat-entitlement kommer ut av synk | Middels | Høy | `src/app/api/billing/stripe/webhook/route.ts`, `src/app/api/billing/revenuecat/webhook/route.ts` | Én autoritativ entitlement-modell, replay/idempotens, refusjonstester | Billing/backend | Testmatrise for kjøp, fornyelse, utløp, refund og providerbytte |
| R-012 | P1 | Checkout lager dupliserte kunde-/sesjonsressurser | Middels | Middels | `src/app/api/billing/checkout/route.ts:76–121` | Varig operasjons-ID og kompensasjonsjobb | Billing/backend | Replayed request gir samme resultat uten duplikat |
| R-013 | P1 | Offline-funksjon svikter i faktisk feltbruk | Høy | Høy | `public/sw.js:8`, `public/sw.js:93` | Offline-matrise, app-shell, lokal kø, kartnedlasting og feltprøve | Frontend/mobile | Definerte kjerneflyter består uten nett på iOS/Android |
| R-014 | P1 | Ustabile kvalitetssjekker slipper gjennom feil | Høy | Høy | `package.json:9`, `vitest.config.ts:9` | Direkte ESLint, ren typecheck, ekskluder worktrees, CI | Teknisk leder | Alle release gates grønne fra ren checkout |
| R-015 | P1 | Gratis kartløfte avviker fra auth-krav | Høy | Middels | `src/lib/supabase/middleware.ts:7` | Avklar produktregel og samsvar UI/marketing/middleware | Produkt | Akseptansetest samsvarer med publisert plan |
| R-016 | P2 | API-responser/logger eksponerer interne feil eller PII | Middels | Middels/høy | `src/app/api/me/delete/route.ts:182`, `src/app/api/billing/checkout/route.ts:131` | Standard feilkoder, korrelasjons-ID, loggredigering | Backend/ops | PII-review og loggtest bestått |
| R-017 | P2 | Dataeksport er ufullstendig uten tydelig feil | Middels | Middels | `src/app/api/me/export/route.ts:50–74` | Samlet feilkontroll, manifest og maskinlesbart format | Backend + personvern | Simulert delfeil gir ingen «vellykket komplett eksport» |
| R-018 | P2 | Modelltreningsdata er geografisk og sosialt skjevt | Høy | Høy | Brukerfunn og populære områder dominerer | Systematiske negative data, holdout og biasrapport | Data/fag | Rapport per region/art og baseline-sammenligning godkjent |
| R-019 | P2 | Tredjepartsdata endres, stopper eller har lisenskrav | Middels | Høy | MET, Kindwise, kart- og naturdata | Leverandørregister, cache/fallback, lisens- og SLA-eier | Ops + juridisk | Alle kilder har eier, vilkår, fallback og overvåkning |
| R-020 | P2 | Forum inneholder farlige råd eller feil artsbekreftelse | Høy | Høy | Brukergenerert innhold og community-verifisering | Modererings-SLA, rapportering, verifiseringsnivå og ekspertregler | Community + fag | Farlig innhold håndteres innen definert SLA |
| R-021 | P2 | Utilgjengelig felt-UI ekskluderer brukere eller gir feilhandling | Middels | Middels/høy | Ingen dokumentert full WCAG-/feltgjennomgang | WCAG 2.2 AA, kontrast, skjermleser, store trykkflater | Design/frontend | Uavhengig tilgjengelighetstest bestått |
| R-022 | P2 | Sverige-lansering gjenbruker norske antakelser | Middels | Høy | Planlagt nordisk ekspansjon | Separate kilder, fagreview, juridikk og regional sesongvalidering | Produkt + lokalt fagteam | Svensk lanseringsgate og innholdseier etablert |
| R-023 | P2 | Kommersiell verdi av prediksjon er ikke bevist | Høy | Høy | Ingen dokumentert betalt feltpilot | Betapilot, retention, betalingsvilje og baseline-test | Produkt/CEO | Forhåndsdefinerte KPI-er nådd før større investering |
| R-024 | P2 | CSP gir utilstrekkelig XSS-margin | Middels | Middels | `next.config.js:23–27` | Nonce/hash, report-only-innføring, fjern unsafe-inline | Sikkerhet/frontend | CSP-test uten unødvendig unsafe-inline |

## Risikostyring

- P0 gjennomgås ukentlig til lukking.
- P1 må ha navngitt eier og dato før offentlig beta.
- P2 gjennomgås månedlig og ved større produkt-/leverandørendringer.
- Et lukket punkt skal ha test, dokumentasjon og ansvarlig godkjenning, ikke bare en kodeendring.
- Nye sikkerhets-, personvern- eller matsikkerhetsfunn kan stoppe release uavhengig av kommersiell tidsplan.

## Hendelser som skal utløse umiddelbar vurdering

- Rapport om forgiftning eller at AI ble brukt som matgodkjenning.
- Eksponering av eksakte private/omtrentlige koordinater.
- Uautorisert tilgang til admin, profil, funn eller betalingsstatus.
- Doble belastninger eller feil premium-entitlement.
- Lekket API-nøkkel, service-role key, webhook-secret eller personlig access token.
- Kritisk/høy sårbarhet i internetteksponert produksjonsavhengighet.
- Modellscore som markedsføres eller oppfattes som mer presis enn dokumentert.

