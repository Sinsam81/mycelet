> ⚠️ **AVLØST 2. august 2026.** Denne rapporten ble skrevet mot branch-commit `c9ef78b`, ikke
> mot main, og en etterkontroll av alle 39 konkrete funn ga: 13 fortsatt sanne, 11 allerede
> fikset, 6 uverifiserbare, 2 utdaterte og **7 som aldri var sanne** — tre av dem med
> henvisninger til filer som ikke finnes. Beholdt som historikk og sammenligningsgrunnlag.
> Gjeldende revisjon: `docs/lanseringsrevisjon-funn.md`, `-inventar.md`, `-beslutning.md`.

# SoppJakt profesjonell overlevering

**Dato:** 1. august 2026  
**Revisjonsgrunnlag:** branch `feat/ga4-pwa`, commit `c9ef78b`

## 1. Kort status

SoppJakt er en omfattende Next.js-applikasjon for soppinteresserte med:

- soppdatabase og artsdetaljer,
- AI-baserte artskandidater,
- kart og funn med flere synlighetsnivåer,
- kalender og miljøbasert forholdsscore,
- forum, profiler og moderering,
- Supabase Auth, PostgreSQL/PostGIS og Storage,
- Stripe- og RevenueCat-integrasjoner,
- kontoeksport og kontosletting,
- PWA/service worker og Capacitor-grunnlag.

Kodebasen er egnet for videre profesjonell utvikling, men revisjonen anbefaler ikke bred offentlig mattrygghets- eller premiumlansering før P0/P1-portene i `docs/technical-audit.md` er lukket.

## 2. Teknologistakk

| Lag | Teknologi |
|---|---|
| Web | Next.js App Router, React, TypeScript, Tailwind |
| Data/auth | Supabase Auth, PostgreSQL, RLS, PostGIS, Storage |
| Kart | Leaflet/MapLibre-relaterte komponenter og geodata |
| Server | Next.js route handlers og middleware/proxy |
| AI | Kindwise/Plant.id-soppidentifikasjon |
| Vær/miljø | MET og øvrige prediksjonsdatakilder |
| Betaling | Stripe og RevenueCat |
| Mobil/PWA | Service worker, manifest, Capacitor |
| Test | Vitest og Testing Library-relatert oppsett |

## 3. Viktige kataloger

| Sti | Formål |
|---|---|
| `src/app` | Sider, layouts og serverruter |
| `src/components` | UI- og domenekomponenter |
| `src/lib/supabase` | Klienter, middleware og admin-tilgang |
| `src/lib/prediction` | Scoring og prediksjonslogikk |
| `src/lib/billing` | Planer og entitlement-hjelpere |
| `src/lib/hooks` | Auth, forum, prediction, billing og datahooks |
| `supabase/migrations` | Database, RLS, views og funksjoner |
| `public/sw.js` | Service worker/cachelogikk |
| `docs` | Produkt-, drift-, juridisk og revisjonsdokumentasjon |

## 4. Lokal oppstart

Ikke kopier faktiske hemmeligheter til dokumentasjon eller Git.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Fyll `.env.local` med verdier fra godkjent secret manager. Bruk minst mulige privilegier og separate miljøer for lokal, preview og produksjon.

### Miljøvariabler

Relevante navn skal verifiseres mot `.env.example` og faktisk kode. Typiske grupper:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PLANTID_API_KEY`
- vær-/miljøleverandørnøkler
- Stripe publishable/secret/webhook/price IDs
- RevenueCat webhook-konfigurasjon
- app-URL og analysevariabler

**Regel:** `SUPABASE_SERVICE_ROLE_KEY`, Stripe secret og webhook-secrets skal aldri brukes i klientkode eller `NEXT_PUBLIC_*`. Supabase service role omgår RLS og må bare brukes server-side: [Supabase – securing your data](https://supabase.com/docs/guides/database/secure-data).

## 5. Database og migrasjoner

- Migrasjoner ligger i `supabase/migrations`.
- Test alle migrasjoner først mot et separat Supabase-prosjekt eller lokal database.
- Generer og sammenlign schema/types etter migrasjon.
- RLS må testes som `anon`, autentisert eier, annen autentisert bruker og service role.
- Karttester må kontrollere `public`, `approximate` og `private` separat.
- Ikke stol på at et view automatisk respekterer underliggende RLS; kontroller `security_invoker`/`security_definer` eksplisitt.

Foreslått migrasjonsprosess:

1. Backup og restore-test.
2. Kjør migrasjon i staging.
3. Kjør RLS- og funksjonstester.
4. Kontroller query-plan og indekser.
5. Godkjenn rollback/forward-fix.
6. Kjør produksjonsmigrasjon i avtalt vindu.
7. Overvåk feil, latency og tilgangslogger.

Ingen migrasjoner ble kjørt som del av denne revisjonen.

## 6. Kvalitetskommandoer

```bash
npm run build
npm run typecheck
npm run lint
npm test -- --run
npm audit --omit=dev
```

### Resultat under revisjonen

- `npm run build`: bestått; 48 ruter ble generert.
- `npm run typecheck`: feilet på dupliserte genererte filer under `.next/types`.
- `npm run lint`: feilet fordi scriptet bruker `next lint`, som ikke støttes av installert Next.js.
- `npm test -- --run`: 2924 tester besto, 14 feilet; `.claude/worktrees` ble feilaktig samlet inn.
- `npm audit --omit=dev`: tre produksjonsfunn med høy alvorlighetsgrad.

Før videre funksjonsutvikling bør teamet gjøre disse fem kontrollene grønne fra en ren checkout.

## 7. CI/CD som bør etableres

Hver pull request:

1. Ren `npm ci`.
2. Dependency audit/policy.
3. Lint.
4. Typecheck.
5. Unit-/komponenttester uten worktrees/genererte mapper.
6. Produksjonsbygg.
7. RLS-/API-integrasjonstester mot isolert miljø.
8. Secret scanning og SAST.
9. Preview deploy uten produksjonshemmeligheter.
10. Manuell godkjenning for migrasjoner og produksjon.

Produksjon:

- immutable artefakt,
- eksplisitt miljøgodkjenning,
- migrasjon som separat jobb,
- smoke-test av auth, kart, identifikasjon og betaling,
- rollback-plan og hendelsesvakt.

## 8. Sikkerhetskritiske flyter

### Autentisering

- Middleware beskytter flere ruter i `src/lib/supabase/middleware.ts`.
- OAuth-callback er i `src/app/auth/callback/route.ts`.
- Redirectvalidering må være identisk på callback, login og register.
- Autorisasjon må alltid gjentas i API/database; UI-skjuling er ikke sikkerhet.

### AI-identifikasjon

- API-proxy finnes i `src/app/api/identify/route.ts`.
- Bildetype, størrelse, timeout, kvote og leverandørfeil må håndteres server-side.
- Eksakt posisjon skal ikke sendes uten eksplisitt, dokumentert valg.
- Resultatet er en artskandidat, ikke en mattrygghetsvurdering.

### Kart og funn

- Rå posisjon skal aldri returneres for private eller omtrentlige funn.
- Maskering må være stabil nok til å unngå gjennomsnittsangrep, men ikke avsløre originalpunkt.
- Bilder skal strippes for EXIF/GPS før offentlig deling.
- Databasepolicyer må testes ved hver migrasjon.

### Betaling

- Webhooks må signaturverifiseres før parsing/behandling.
- Event-ID skal gi varig idempotens.
- Entitlement må håndtere kjøp, fornyelse, kansellering, utløp, refusjon og chargeback.
- Season pass-semantikk må avklares før salg.

### Konto og GDPR

- Eksport må være komplett eller eksplisitt feile.
- Sletting må være idempotent og gjenopptakbar.
- Retention av anonymiserte observasjoner må dokumenteres og godkjennes.
- Logger, backups, storage og tredjepart må inngå i datakartet.

## 9. Produktbeslutninger som må tas

1. Er grunnkart offentlig, eller kreves innlogging?
2. Skal «sesongpass» være engangskjøp eller abonnement?
3. Skal eksakt posisjon noen gang kunne være offentlig?
4. Hvilke data kan deles med Kindwise og andre leverandører?
5. Hvem er faglig ansvarlig for arts- og sikkerhetsinnhold?
6. Hva betyr «verifisert» i forum/funn, og hvem kan gi statusen?
7. Hvilke funksjoner er faktisk offline på web, iOS og Android?
8. Skal prediksjonen forbli forholdsscore, eller finansieres en formell validering?
9. Hva er autoritativ kilde for premium-entitlement på tvers av Stripe og RevenueCat?
10. Hvilke KPI-er må nås før Sverige og bredere spiselig natur prioriteres?

## 10. Anbefalt første arbeidsrekkefølge

1. Lukk P0-funnene i teknisk revisjon.
2. Reparer CI-kvalitetsportene.
3. Skriv og test en felles redirect-validator.
4. Gjennomgå RLS/views og posisjonsflyt med sikkerhetsansvarlig.
5. Gjør kontosletting og eksport transaksjonelt/idempotent.
6. Samle betalingsstatus i én entitlement-modell.
7. Definer og implementer reell offline-matrise.
8. Kjør lukket feltbeta og modellvalidering.

## 11. Drift og observability

Minimum før offentlig lansering:

- strukturert logging med korrelasjons-ID,
- PII- og secret-redigering,
- alarm på auth-feil, webhook-feil og betalingstilstand,
- latency/feilrate per ekstern leverandør,
- kostnadsalarm for identifikasjons- og kartkall,
- kø/dlq eller retry-strategi for kritiske webhooks og sletting,
- status- og hendelsesprosedyre,
- backup og dokumentert restore-test,
- on-call-eier i soppsesongen.

## 12. Repo-hygiene observert ved revisjonsstart

Følgende endringer var allerede til stede og ble ikke endret av revisjonen:

```text
 M docs/app-store-metadata.md
?? .claude/
?? android/
?? docs/forsikring-foresporsel.md
```

`.claude/worktrees` påvirket testoppdagelsen og bør ekskluderes. `android/` bør avklares som kildekode, generert artefakt eller separat mobilprosjekt før commit-policy bestemmes.

## 13. Revisjonsdokumenter

- `docs/technical-audit.md` – tekniske funn og launch gates.
- `docs/product-v2-roadmap.md` – anbefalt produkt- og valideringsplan.
- `docs/risk-register.md` – prioritert risiko, eier og lukkekriterium.
- `docs/professional-handoff.md` – dette overleveringsdokumentet.

## 14. Begrensning og endringslogg

Revisjonen var en skrivebeskyttet gjennomgang av kildekode, konfigurasjon, migrasjoner og kjørbare kvalitetskontroller, med unntak av de fire revisjonsdokumentene over.

Det ble ikke:

- endret kildekode,
- installert pakker,
- kjørt databasemigrasjoner,
- pushet commits eller branches,
- deployet preview eller produksjon.

