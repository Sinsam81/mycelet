# Deploylogg

Alle kodeendringer ble verifisert med typecheck, full Vitest-suite og produksjonsbygg før merge. PR-ene ble sluppet sekvensielt. Sluttstatus 14. juli 2026: `/api/health` = 200/ok, `/api/health/predictions` = 200/ok, fem av fem regioner ferske og `qa:prod` = 29/29.

| PR | Merge-SHA | Produksjonsresultat |
|---|---|---|
| [#71 Mobil funnskjema](https://github.com/Sinsam81/mycelet/pull/71) | `b28c8a8` | Vercel ferdig; mobil 390×844 verifisert, kumulativ prod-QA bestått |
| [#72 Svenske artsnavn](https://github.com/Sinsam81/mycelet/pull/72) | `2a52495` | Vercel ferdig; svensk katalog/søk verifisert, kumulativ prod-QA bestått |
| [#73 Mobilkart](https://github.com/Sinsam81/mycelet/pull/73) | `e3fee2b` | Vercel ferdig; NO/SE kart-QA 2/2, kumulativ prod-QA bestått |
| [#75 Romlig validering](https://github.com/Sinsam81/mycelet/pull/75) | `7c37a24` | Helse og produksjonsrøyk bestått |
| [#76 Ærlig scoring](https://github.com/Sinsam81/mycelet/pull/76) | `1150b8e` | Helse ok; 26/26 prod-QA; Bergen fallback gikk fra 58 til evidensærlig 35 |
| [#77 Flisferskhet](https://github.com/Sinsam81/mycelet/pull/77) | `551ce0a` | Full batch 763 fliser; fem regioner ferske; 27/27 prod-QA |
| [#78 Feltfeedback](https://github.com/Sinsam81/mycelet/pull/78) | `55262fe` | Migrasjon 029 verifisert; helse/ferskhet ok; 28/28 prod-QA; begge API-er avviser uautorisert |
| [#79 Værimport](https://github.com/Sinsam81/mycelet/pull/79) | `76cd5a7` | Helse/ferskhet ok; 28/28 prod-QA; 1 000 komplette SE-profiler |
| [#80 Norsk backfill](https://github.com/Sinsam81/mycelet/pull/80) | `75585d5` | Helse/ferskhet ok; 29/29 prod-QA; uautorisert = 401; 125 NO-profiler kontrollert innlest |
| [#81 Værvalidering](https://github.com/Sinsam81/mycelet/pull/81) | `fc8ef83` | Helse/ferskhet ok; 29/29 prod-QA; 1 664-raders holdout-audit fullført |
| [#82 Sluttrapporter](https://github.com/Sinsam81/mycelet/pull/82) | `19873cd` | Helse/ferskhet ok; fem regioner ferske; 29/29 prod-QA; produksjonsforside uten konsollfeil |
| [#83 SMHI-stasjonscache](https://github.com/Sinsam81/mycelet/pull/83) | `9bc1830` | Helse/ferskhet ok; fem regioner ferske; Göteborg bruker SMHI; 29/29 prod-QA |

## Databaseendring

`029_prediction_feedback_context.sql` ble anvendt i produksjon før PR #78 ble merget. Sikkerhetsnett:

1. Additiv SQL gjennomgått.
2. To transaksjonskjøringer med eksplisitt rollback.
3. Førkontroll: 10 funn, 5 offentlige, 0 negative og 0 spot-feedback.
4. Kun migrasjon 029 kjørt gjennom Management API; ikke `db push`.
5. Etterkontroll: seks nye feedbackkolonner, `visited_at`-krav/default, indeks, offentlig negativfilter og korrigert statistikkfunksjon.

Ingen rollback av kode eller database var nødvendig.

## 2026-07-19 — PR #86: Fix NO/SE border misclassifying the Swedish Bohuslän coast
- **Commit:** squash-merge of `fix/bohuslan-border-strip` (post-merge main HEAD).
- **What:** `noSeBorderLon` refined — 11.0°E south of Iddefjorden (58.9°N), steep rise to 11.48°E by 59.1°N. Strömstad/Grebbestad/Fjällbacka/Koster now → SE (OSM basemap + SMHI weather); Halden/Tistedal/Fredrikstad/Sarpsborg verified still NO. Found while live-debugging the founder's grey-map report from Sweden.
- **Verify pre-merge:** 297/297 vitest, typecheck, production build green.
- **Verify post-deploy:** `/api/health` → ok; live probe Strömstad (58.9366, 11.1706) flipped `weatherSource: met_frost` → `smhi`; `qa:prod` 29/29 passed.
- **Rollback:** none needed.
- **Note:** PR #85 (WebKit Swedish-tile CSP fix, 2026-07-18) shipped after the previous log entry and is not logged above — noted here for a complete audit trail.

## 2026-07-19 — PR #87: sw.js byte-bump to force reinstall (stale-CSP service workers)
- **What:** Version comment + `STATIC_CACHE` v1→v2 in `public/sw.js`. Root cause: a service worker runs under the CSP captured when its script was fetched; PR #85 widened the header but `sw.js` bytes were unchanged since 07-13, so devices that installed during 07-13→07-18 kept the narrow snapshot → their SW fetch of OSM tiles still threw → grey Swedish map even after #85. Founder confirmed grey map persisting on Mac Chrome + iPhone Safari.
- **Verify pre-merge:** typecheck, 297/297 tests, build green.
- **Verify post-deploy:** live sw.js serves v2; browser test confirmed new worker installed + activated (`mycelet-static-v1` cleaned up, `mycelet-map-tiles-v1` preserved); Strömstad renders 12/12 OSM tiles under the new worker; `/api/health` ok.
- **Rollback:** none needed.

## 2026-07-19 — PR #88: Auto-expanding spot radius + prediction hot-path robustness
- **What:** (1) `generateTopSpots` now widens 5→10→20→35 km until it finds promising forest instead of dead-ending at 5 km (stop-on-hit, abort on 429, km-parameterised messages). (2) Robustness: `AbortSignal.timeout(6000)` on all weather fetches (Frost/SMHI/OpenWeather) — closes the spinner-of-death path; keyless Open-Meteo last-resort fallback so a missing/expired Frost key degrades to real weather instead of a hard 502 (purely additive, `open_meteo` source); point route gets `withTimeout(3000)` on the forest lookup + `maxDuration=30` + `runtime='nodejs'`; `radiusKm` clamped to 1–50.
- **Founder decision:** approved "Robusthet + radius" via AskUserQuestion; copy/positioning honesty changes (verdict wording, per-pin /100, "mest sannsynlig her") deliberately DEFERRED for a separate pass.
- **Verify pre-merge:** typecheck, 300/300 vitest (3 new Open-Meteo cases), production build — all green.
- **Verify post-deploy:** `/api/health` → ok; `/api/prediction` (Oslo) → 200 stable; radiusKm=abc → 200 (clamp live, new code confirmed); `qa:prod` 29/29 incl. NO-Frost + SE-SMHI prediction routing.
- **Rollback:** none needed.
- **Source:** driven by the `prediction-launch-audit` workflow (4-dimension audit + synthesis). Full findings archived in the session; punch-list items A–H documented there.

## 2026-07-19 — PR #89: Prediction copy-honesty pass (place-claims → condition-claims)
- **What:** Copy-only, no model change. Reframed spatial-precision overclaims to condition-claims (validated temporal ~0.89 vs near-chance spatial ~0.52): `verdictText` "Svært lovende sted…her"→"Svært gode forhold nå"; condition labels "…sjanse"→"…forhold" (the /100 now reads as a conditions index, not a probability); `mostLikelyHere` "Mest sannsynlig her"→"Riktig skog + sesong for X"; `promisingSpotHere`→"Gode forhold her"; occurrence reason line now caveated as a trail/road-biased hint; `introSpots` gained the "ikke en fasit" hedge. NO+SE in lockstep (identical key sets verified). "Lovende steder" feature name retained.
- **Founder decision:** approved ("Ja kjør på med dette") after the deferred-item recommendation.
- **Verify pre-merge:** typecheck, 300/300 vitest (occurrence assertion updated), build green; nb/sv key parity checked programmatically.
- **Verify post-deploy:** `/api/health` → ok; browser-confirmed live — conditions pill renders "4/100 Svake forhold" (old "sjanse" wording gone); `qa:prod` 29/29.
- **Rollback:** none needed.

## 2026-07-27 — PR #90: RevenueCat IAP (native purchase flow + webhook)
- **What:** Full Apple IAP integration per docs/launch-critical-path.md Spor 2. Pure event mapping (grant/modify/revoke; CANCELLATION≠EXPIRATION, refund-revoke, grace periods, trials) + `/api/revenuecat/webhook` (SHA-256 timing-safe auth, event-id dedup, sandbox gate, provider-of-record ownership via metadata.provider + rc_event_timestamp_ms ordering guard) + symmetric guard in the Stripe webhook + native purchase UI on /pricing (per-plan buttons, Apple's localized price, «Gjenopprett kjøp», login prompt, unmount-safe polling; Stripe badge hidden in shell). Plugin pinned 13.2.4 + cap sync ios.
- **Review:** 8-angle adversarial review; all 10 verified findings fixed pre-merge (cross-provider clobbering both directions, ordering, guard-read errors → 5xx for retry, auth length oracle, silent no-op buttons, price display, poll dead-end, cancellation misclassification, tier-heuristic unification into plans.guessTierFromProductId).
- **Verify pre-merge:** 332/332 tests (32 new), typecheck, build, nb/sv key parity.
- **Verify post-deploy:** `POST /api/revenuecat/webhook` → 503 (correctly inert until REVENUECAT_WEBHOOK_AUTH is set); `/api/health` ok; `qa:prod` see below.
- **Awaiting founder (Spor 1):** RevenueCat keys → Vercel env (`NEXT_PUBLIC_REVENUECAT_APPLE_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_ALLOW_SANDBOX=1` through App Review), App Store Connect products `no.mycelet.premium.monthly` / `no.mycelet.seasonpass.yearly`, entitlement `premium`, offering `$rc_monthly`/`$rc_annual`.
- **Rollback:** none needed.

## 2026-07-27 — RevenueCat-konfigurasjon aktivert (env, ingen kodeendring)
- **What:** Sindre fullførte hele oppsettet (walked through): ASC-abonnementer (gruppe «Mycelet Premium»: no.mycelet.premium.monthly 79kr + no.mycelet.seasonpass.yearly 249kr, priser/availability/localization), RevenueCat-prosjekt med App Store-app + .p8 IAP-key («Valid credentials»), produkter + entitlement `premium` + default offering ($rc_monthly/$rc_annual → App Store-produktene), webhook «Mycelet backend». Claude la inn NEXT_PUBLIC_REVENUECAT_APPLE_KEY + REVENUECAT_WEBHOOK_AUTH + REVENUECAT_ALLOW_SANDBOX=1 i Vercel (Production) via CLI og trigget redeploy.
- **Verify post-deploy:** POST /api/revenuecat/webhook med riktig auth + TEST-event → 200 {received, ignored:test_event}; feil auth → 401. Paid Apps Agreement/bank/tax alle Active i ASC.
- **Next:** sandbox-tester i ASC (Users and Access → Sandbox Testers), dev-bygg på fysisk iPhone, sandbox-kjøp E2E, skjermbilder, arkiv + innsending.

## 2026-07-29 — PR #92 + #93: Marketing landing page for logged-out visitors (+ desktop layout)
- **What:** `/` now renders a landing page for anon visitors (hero «Vit når soppen kommer» + CSS/SVG phone mockup, 3 steg, funksjoner, skogtype-tabell, priser, sikkerhet, FAQ, kilde-footer; nb+sv). Logged-in users unchanged. OnboardingIntro gated to logged-in users (used to pop over the landing hero). Ported from the founder's Claude Design draft.
- **Verify pre-merge:** 332 tests, typecheck, build; local anon verification (hero, mockup, cookie notice, ingen onboarding-modal, header/bottom-nav).
- **Verify post-deploy:** «Vit når soppen kommer» live on mycelet.com; `/api/health` ok; `qa:prod` see below.
- **Rollback:** none needed.

## 2026-07-29 — PR #94: Designed landing page served 1:1 (static HTML)
- **What:** Anon `/` now serves the approved Claude Design page verbatim: extracted from the design-tool bundle, lucide icons baked as inline SVG (zero JS), images 8.4 MB→~600 KB JPEG, 8 self-hosted woff2, CTAs → /auth/register (plan buttons ?redirect=/pricing), dead newsletter form removed, canonical+favicon added. Middleware rewrite `/` → `/landing/index.html` for !user; logged-in unchanged. React landing kept as Turbopack-dev fallback.
- **Verify:** 332 tests; local next start (pixel-identical, rewrite header confirmed); live title + assets 200; qa:prod 29/29; health ok.
- **Rollback:** none needed.

## 2026-07-29 — PR #95: Three researched Sanketips articles (+ landing cards wired)
- **What:** `/sanketips/les-terrenget`, `/fem-forvekslinger`, `/sopp-etter-regn` — ~2000 ord hver, skrevet fra bunnen for Mycelet. Kilde-research mot NSNF/Artsdatabanken/NIBIO/Giftinformasjonen/SLU + primærlitteratur, deretter TO uavhengige adversarielle gjennomganger (mykologisk faktasjekk + sikkerhet/tone) og en redigeringsrunde. Faktasjekken fanget bl.a. en FABRIKERT kildehenvisning og upresis morfologi. Landingssidens tre kort (tidligere `href="#"`) peker nå hit.
- **Mekanikk:** `content/sanketips/*.md` → `scripts/build-articles.mjs` → statisk HTML som løfter landingssidens egne @font-face/header/footer (kan ikke drifte fra designet). Null JS. Rene URL-er via next.config-rewrite.
- **Sikkerhet verifisert:** dødelige forvekslingsarter navngitt m/ latenstid (orellanin), Galerina-advarsel på stubbesopp, «la den stå» + soppkontroll i alle tre; ingen artikkel påstår at appen vet HVOR soppen står.
- **Verify:** 332 tests, typecheck, build; live 200 på alle tre + kortlenker på forsiden; qa:prod 29/29; health ok.
- **Rollback:** none needed.

## 2026-07-29 — PR #96: Svensk landingsside med geo-IP-språkvalg *(ført i etterkant samme dag)*
- **What:** Full svensk utgave av landingssiden (`public/landing/index.sv.html`), kvalitetssikret av uavhengige korrektur-agenter (21 funn fikset: Karl Johan, svampkonsulenter i stedet for Soppkontrollen, Giftinformationscentralen 010-456 6700, NOK-merking av priser, «prognos» i stedet for norsk-ismen «utsikt»). Middleware velger landingsspråk med prioritet `?lang=`-klikk → `MYCELET_LOCALE`-cookie → `x-vercel-ip-country=SE` → `Accept-Language` → nb. Språkvelger («Norsk/Svenska») i footer på begge sider, gjensidige hreflang-tagger for SEO, og svenske app-skjermbilder (Stockholm-kart med 938 fynd, hjemskjerm, AI-side — generert via `scripts/capture-sv-landing-screenshots.mjs`).
- **Verify:** build + typecheck + 332 vitest ved merge; lokal `next start` med simulerte IP-er (SE→sv, NO/DK/US→nb, `?lang=`-overstyring, cookie-persistens). Live etterkontroll ved loggføring: `/?lang=sv` serverer svensk tittel, `/` har hreflang nb-NO/sv-SE/x-default, alle tre `.sv.jpg` gir 200.
- **Rollback:** none needed.

## 2026-07-29 — PR #97: «Logg inn»-lenke i landingssidens toppnav (NO + SE)
- **What:** Utloggede brukere hadde ingen direkte vei til `/auth/login` fra landingssiden — alle CTA-er pekte til `/auth/register`. Diskret «Logg inn»-lenke lagt til i toppnav (mellom ankerlenkene og «Prøv gratis») på både `index.html` og `index.sv.html` («Logga in»). Sanketips-artiklene bygget på nytt så de arver headeren — de plukket samtidig opp Svenska-fotlenken fra PR #96 som aldri var bygget inn i artiklene.
- **Verify:** live curl viser lenken i NO-nav, SE-nav og artikkel-header; /api/health 200; qa:prod 29/29.
- **Rollback:** none needed.

## 2026-07-29 — PR #100: Sted+art-søk på kartet, svensk stedssøk fikset, uke-utsikt for søkt sted
- **Utløser:** Sindre spurte om «hvor stor sjanse for steinsopp ved Hamar i helgen?» er enkelt. Det var det ikke.
- **What:** (1) 🐞 Stedssøket var Norge-only (Kartverket) og feilet STILLE for Sverige — «Uppsala»→«Oppsal, Hjartdal», «Sälen»→«Selen, Karmøy». Nytt `src/lib/utils/place-search.ts`: Photon (dekker NO+SE) med Kartverket som NO-fallback, filtrert til NO/SE, tettsteder rangert over gårder. (2) Stedssøk var gjemt i Filtre-arket, og artsvalg ERSTATTET søkeboksen → «art + sted» var umulig. Nå ett søkefelt med grupperte treff; chip og felt lever side om side. (3) 7-dagers utsikt fantes kun for egen GPS-posisjon → ny `PlaceForecastStrip` viser uka for søkt sted. Oppslag proxes via ny `/api/places` (CSP forblir stram, ingen bruker-IP til tredjepart, CDN-cache 1 døgn, 60/min/klient).
- **Review:** adversariell gjennomgang fant 8 funn, alle fikset før merge — bl.a. to som brøt selve funksjonen (sen GPS-fix rykket deg vekk fra søkt sted; «lovende steder» regnet rundt GPS i stedet for søkt sted) og ett ærlighetsbrudd (generelle værtall merket med valgt art).
- **Verify:** 344 tests, typecheck, build; nettleser-verifisert begge rekkefølger (art→sted og sted→art); live `/api/places?q=Sälen` → Dalarnas län · Sverige; qa:prod 29/29; health ok.
- **Rollback:** none needed.
