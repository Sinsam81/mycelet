# Lanseringssjekkliste

Rekkefølgen er risikobasert. «Ferdig» betyr verifisert i kode/produksjon; det betyr ikke at den tilhørende forretnings- eller App Store-aktiviteten automatisk er godkjent.

## P0 — må være avklart før App Store/offentlig push

- [ ] **[code — doable] RevenueCat IAP i Capacitor.** Legg til SDK, native kjøps-/gjenopprettingsflate og webhook som oppdaterer den eksisterende `billing_subscriptions`-kilden. Ikke lag en parallell entitlementmodell.
- [ ] **[founder action] Opprett og koble App Store-produkter.** `no.mycelet.app.premium.monthly` (79 kr/mnd) og `no.mycelet.app.seasonpass.yearly` (249 kr/år), RevenueCat-prosjekt, App Store Connect-avtaler/bank/skatt.
- [ ] **[founder action] Sandbox-test hele IAP-livsløpet.** Kjøp, gjenopprett, forny, avbryt, utløp og webhook-idempotens; bekreft samme betalte tilgang som Stripe.
- [ ] **[founder action] Send iOS-build til App Review.** Metadata, skjermbilder, aldersgrense, personvernopplysninger, review-notat og demo/QA-konto.
- [ ] **[founder action] Løs migrasjonsdrift før beredskapsreplay.** Velg dokumentert bootstrap eller ny baseline for `primary_image_url` og `swedish_name`; test fra tom database. Ta backup og kjør eventuelle produksjonsendringer manuelt. En ny 029 til slutt er ikke nok alene.
- [ ] **[code — doable] Implementer retention-varsel og purge som Edge Functions.** Bruk låste perioder i `docs/retention-policy.md`, dry-run, audit-logg og `CRON_SECRET`.
- [ ] **[founder action] Deploy retention-jobbene og verifiser dry-run.** Ingen autonom produksjonsmigrasjon eller purge er utført.
- [ ] **[founder action] Juridisk gjennomgang.** Personvern, vilkår/kjøpsvilkår, AI-sikkerhetsformulering, databehandleravtaler og rutine for 72-timers avviksvarsling.
- [ ] **[founder action] Svensk fagkontroll.** Kurater artsbeskrivelser, gift/symptom, habitat og skillekjennetegn før svensk markedsføring som fullverdig språk.

## P1 — produksjonsharding før trafikkvekst

- [ ] **[code — doable] Distribuert rate limiting.** Flytt 14 rutegrupper fra per-instans minne til Upstash Redis/Vercel KV; behold eksisterende grensekontrakter og tester.
- [ ] **[founder action] Opprett leverandør/kostnadsramme for rate limiting.** Legg nøkler i Vercel, ikke i repo.
- [ ] **[code — doable] Sentry med PII-rensing.** Samme redaksjonsregler som loggeren; ingen e-post, koordinater, bilder, tokens eller request-body uten eksplisitt behov.
- [ ] **[founder action] Opprett Sentry-prosjekt, DPA og varslingseiere.** Sett alarm for 5xx, webhook og identifiseringsfeil.
- [ ] **[founder action] Registrer `MET_FROST_CLIENT_ID`.** Bekreft produksjonsruting og fallback; nøkkelen skal være server-only.
- [ ] **[code — doable] Rydd SMHI-cachevarsel.** Cache en redusert stasjonsliste under 2 MB; test svensk prediksjon.
- [ ] **[code — doable] Oppgrader dev-forsyningskjeden kontrollert.** Vitest/Vite/esbuild/tar i egen PR. Ikke bruk audit-forslaget som nedgraderer Next til 9.
- [ ] **[code — doable] Lag innlogget lesende QA-prosjekt.** Ingen funn/poster/kjøp/e-post. Test gratis og betalt kart/portal/offline uten writes.
- [ ] **[founder action] Still to dedikerte QA-kontoer til rådighet.** Én gratis og én betalt/entitled; ikke bruk reelle kundekontoer.

## P2 — produkt- og språkmodning

- [x] **[code — done] Mobil kartinformasjon er ryddet.** PR #73 live; region-/flisregresjon grønn.
- [x] **[code — done] Registrer-funn-arket fungerer på små skjermer.** PR #71 live.
- [x] **[code — done] Svenske artsnavn og søk i kjerneflater.** PR #72/#73 live, med norsk reserve.
- [x] **[code — done] Offentlige NO/SE-ruter og auth-gating er røykprøvd.** 26/26 produksjonsprøver.
- [ ] **[code — doable] Identifiseringsposisjon som opt-in.** Ikke be om geolokasjon ved sidelast.
- [ ] **[code — doable] Fremhev beste dag/neste flush.** Bruk eksisterende temporalt validerte data; ikke endre skåring.
- [ ] **[code — doable] Lokaliser forum trust-admin.** Legg til lesende e2e.
- [ ] **[founder action] Bestem forumlansering.** Moderator, rapport-SLA, ekspertrolle og retningslinjer må være bemannet før `forumInNav` slås på.
- [ ] **[founder action] Bestem artsutvidelse til 100.** Prioriter fagkvalitet og kritiske forvekslinger over volum.

## P3 — etter stabil lansering

- [ ] **[code — doable] Fyll weather-at-find-time-features og kjør valideringsrunbook.** Ingen produksjonsvekt før positiv Brier skill og region-splitt.
- [ ] **[founder action] Beslutt bias-korrigert SDM etter validering.** Spatial AUC er rundt 0,52 i dag; markedsføring må være ærlig.
- [ ] **[code — doable] Svensk skogdata-pilot bak flagg.** Skogsstyrelsen-adapter med samme `ForestProperties`; bytt ikke default uten målt SE-løft.
- [ ] **[code — doable] Kart «finn bilen»/GPX og offisiell svensk bakgrunn.** Personvern-, lisens-, CSP-, offline- og service-worker-kontroll først.
- [ ] **[founder action] Vurder bredere «vill mat» først etter at soppkjernen er stabil og målt.**

## Produksjonsport før hver fremtidige runtime-merge

- [ ] Ren tematisk branch/PR.
- [ ] `npm run typecheck` grønn.
- [ ] `npm run test -- --run` grønn.
- [ ] `npm run build` grønn.
- [ ] Relevant lesende lokal e2e/grensesnittkontroll.
- [ ] PR secret scan + Vercel preview grønn.
- [ ] Merge én PR; vent på produksjonsbygg.
- [ ] `/api/health` HTTP 200 og `status: ok`.
- [ ] `npm run qa:prod` grønn.
- [ ] Ved feil: revert merge-commit umiddelbart og dokumenter.
- [ ] Ingen databasemigrasjon kjøres fra denne prosessen.
