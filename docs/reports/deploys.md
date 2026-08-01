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

## 2026-07-30 — PR #101: «Load failed» — native fotoopptak + CSP-blokkerte identifiseringsbilder
- **Utløser:** Sindre fikk «Load failed» ved soppidentifisering i iOS-appen.
- **What:** Rotårsak: skallet laster mycelet.com, men Capacitor-kameraets fil-URI-er ligger på `capacitor://localhost` — `fetch(photo.webPath)` er et kryss-skjema-kall som CORS + håndhevende CSP `connect-src` blokkerer (WebKits melding: «Load failed»). Rammet alle tre fotoflytene (identifiser/forum/kartfunn) via delt hjelper. Fiks: `CameraResultType.Base64` + ny `base64ToBlob` (ingen nettverksflate). Søskenfeil fikset i samme PR: (1) resultatsiden `fetch(data:-URL)` → lokal `dataUrlToBlob`; (2) `/api/identify` droppet `imageUrl` fra svaret → forvekslingskortet falt ALLTID tilbake til Kindwise-CDN; (3) CDN-verten `mushroom-id.ams3.cdn.digitaloceanspaces.com` lagt presist til i `img-src`; (4) rå browsertekst ved nettverksfeil erstattet med nb/sv-tekst.
- **Review:** CSP-revisjonsworkflow (4 linser + adversariell verifisering, 6 agenter, 506k tokens) over hele appen — fant CDN-funnet, avkreftet alt annet; verifisereren avdekket at `imageUrl`-utelatelsen gjorde fallbacken til hovedvei.
- **Verify pre-merge:** ende-til-ende i iOS-simulator mot lokal prod-bygg (bildevalg → bro → POST når API-et; gammel kode døde ved bildevalg); 349 vitest (5 nye), typecheck, build.
- **Verify post-deploy:** CSP-header med ny img-src-vert live; `/api/identify` POST → 401 uinnlogget; health ok; qa:prod 29/29.
- **Rollback:** none needed.

## 2026-07-31 — PR #99: svensk lokalisering, vilkår, App Store-krav og prediksjonssammenheng
- **Utløser:** Sindre fotograferte prod og så norsk tekst tre steder på svensk; senere at forsiden sa 80/100 mens kartet sa 19/100 og et anbefalt sted 56/100, og at prognosen falt urimelig mye.
- **Merge-SHA:** `88f1713` (squash av 11 commits).

**Innhold i fire deler.**

1. **Svensk lokalisering.** Prediksjonsteksten genereres server-side, så next-intl traff den aldri: `assessMushroomDay`, `assessFlush` og `buildExplanation` hadde norsk hardkodet, og ukedagene kom fra en norsk array. Hver rene lib tar nå `locale` med en `COPY`-tabell ved siden av logikken (default `nb`, så tester og ferdiggenererte fliser er uberørt). To feller: rutene cacher svarene, så språket måtte inn i cache-nøkkelen — ellers serveres første kallers språk til alle; og klienten sammenlignet dagsetiketten mot strengen `'I dag'`, som brekker stille på svensk (nå `isToday`). **46 av 72 arter manglet `swedish_name`**, ikke de 6 som ble rapportert — stille fordi `getSpeciesDisplayName` faller tilbake til norsk. Navnene er hentet fra SLU Artdatabankens Dyntaxa (kun `preferred`) og etterprøvd mot artfakta.se. ⚠️ «rodnande trådskivling» er IKKE *Inocybe erubescens* — det tilhører *Inocybe whitei*; riktig er **gifttråding**. Fire eksisterende navn var dessuten en annen arts navn (Tegelsopp→Aspsopp, Mandelkremla→Storkremla, Bägarmurkla→Vindlad klockmurkla, Karbolchampinjon→Giftchampinjon).

2. **Vilkår, uten jurist.** Der loven er uklar er linjen lagt om til den konservative siden. Angreretten bygde på unntaket for digitalt *innhold*; Mycelet er antakelig en digital *tjeneste*, der unntaket krever «levert fullt ut» — noe et løpende abonnement aldri er innen 14 dager. Gir nå 14 dager med det forholdsmessige fradraget loven tillater. Samtykket til umiddelbar levering lagres endelig server-side (Stripe-metadata). Kjøpsvilkårene dekker to kanaler (Apple er selger for IAP; oppsigelse i Apple-ID; refusjon via reportaproblem). Forbudsliste tilpasset nordisk rett — narkotiske sopper med lovgrunnlag, og plukkerett formulert som **allemannsrett**, ikke amerikansk «private property», som ville lært brukerne feil om egen rett. ODR-plattformen (nedlagt 20.07.2025) fjernet. Utkast-stemplet «[FYLL INN DATO] … utkast til juridisk gjennomgang» sto **live** på siden betalende kunder godtar. MVA-påstanden var usann — foretaket står ikke i Merverdiavgiftsregisteret.

3. **App Store-retningslinje 1.2.** Hadde to av fire krav. Blokkering av brukere lagt i RLS, ikke i klienten, så den virker i hver spørring og ikke kan omgås. Innholdsfilter som databasetrigger, bevisst smalt: teksten må inneholde både stoffnavn og omsetningsord, så «fleinsopp er ulovlig» slipper gjennom. Mønsterlisten finnes to steder (TS for tilbakemelding, SQL for håndheving) med en test som fanger drift — verifisert ved å innføre drift med vilje. Vilkår, personvern og kontaktinfo er nå tilgjengelig **inne i** appen; eneste lenke var før i cookie-banneret, som forsvinner når det lukkes.

4. **Prediksjonssammenheng.** Fallet i 7-dagersstripen var en **målefeil**: i dag ble scoret på 14-døgnssum, dag 1–6 på 7-døgnssum, mot samme terskeltabell. Alle dager måles nå på én sammenhengende døgnserie (`src/lib/weather/windows.ts`) — som avdekket at forsiden og push-endepunktet regnet «i dag» hver sin vei; begge bruker nå samme regel. «Perfekt soppdag» kunne stå over «Tørt — soppen venter på regn»; markfukt-bøtta vetoer nå feiringen ved samme 0,55-grense flush-banneret bruker. Varmekartet var **invertert** (mørkerødt på 80+, limegrønt under 40) ved siden av grønne nåler som betydde det motsatte. Artsanbefalinger filtrerte bare på sesong — i juli slipper det gjennom 7 giftige og **hvit fluesopp**, over en «naviger hit»-lenke; nå kun spiselige. Forklaringslinjen kalte 0,4 mm/døgn «over optimum» fordi terskelen er kalibrert for 3 døgn og ble sammenlignet med 14.

- **Migrasjoner:** 030 (svenske artsnavn), 031 (meldegrunner), 032 (blokkering + innholdsfilter) — kjørt i produksjon FØR merge, hver med førkontroll, tørrkjøring i transaksjon med `ROLLBACK`, deretter `COMMIT`. Verifisert utenfra etterpå (0 arter uten svensk navn av 72; `blocked_users` finnes; utlogget forumlesing uendret — 4 av 4 innlegg synlige).
- **Review:** fire adversarielle gjennomganger (lokalisering, vilkår, telefon/adresse-plikt, prediksjonsmodell). Den siste forkastet eller korrigerte alle 28 forslag før implementering. Én korreksjon var avgjørende: telefonnummer er ubetinget påkrevd siden 01.10.2023, da LOV-2023-06-16-38 **flyttet** ordet «eventuelt» i angrerettloven § 8 d — nesten all norsk nettinfo beskriver fortsatt den gamle ordlyden.
- **Verify pre-merge:** 485 tester, typecheck, build, qa 35/35; alle 78 norske brukertekster verifisert bevart ordrett; ENK→AS-skiftet prøvd ved å vri konstanten til et fiktivt AS og rendre alle tre juridiske sider på begge språk.
- **Verify post-deploy:** `isToday` i live API (den objektive testen på at koden er ute); health ok; svensk gir «Svampförhållanden i dag» og «lör sön mån tis»; `Vary: Cookie` + `Cache-Control: private, no-store`; adresse, telefon og `noindex` på alle tre juridiske sider; art 2 → Steinsopp/Karljohan og art 60 → Rødnende trådsopp/**Gifttråding**.
- **Rollback:** none needed.
- **Merk:** en tidligere fletting av `messages/*.json` mistet en SLETTET nøkkel og gjeninnførte hardkodet foretaksnavn i personvernerklæringen. Fanget av testen som finnes for nettopp det. Ved JSON-fletting på nøkkelnivå: propager slettinger, ikke bare endringer.

## 2026-08-01 — PR #102: Codex-revisjonen lukket, pluss søskenfeil funnet på veien

- **What:** Gjennomgang av fire revisjonsdokumenter fra Codex (`technical-audit`, `risk-register`, `product-v2-roadmap`, `professional-handoff`), punkt for punkt mot koden. **Revisjonen leste feil branch** — `feat/ga4-pwa@c9ef78b`, ti commits bak main — så P0-1 («score vist som prosent») var rettet før rapporten ble skrevet. Flere funn siterte filstier som ikke finnes (`api/billing/stripe/webhook`), og GPS-funnet oppfant et «bynivå»-løfte for å begrunne alvorligheten. **P1-6 og P1-7 er avkreftet:** «gratis» er et kontonivå, ikke anonym tilgang, og kjøpsvilkårene sier «Fornyes automatisk hvert år» tre steder.

1. **Avhengigheter (P0-3, det ekte funnet).** next 16.2.6→16.2.12 (ni CVE-er, blant dem middleware/proxy-bypass i App Router — relevant fordi auth-gatingen KUN er middleware), sharp→0.35.3, postcss→8.5.25. Next pinner postcss 8.4.31 og sharp ^0.34.5 i sitt eget tre, så npm rapporterte dem gjennom `next` uansett; `overrides` løfter dem opp. Bygg verifisert med de tvungne versjonene, CSS intakt (53 KB). Dev-avhengigheter også: `tar` og `vitest` var kritiske. **Prod og dev: 0.**

2. **Åpen redirect (P1-3) — verre enn beskrevet.** Revisjonen kalte callback-ruten «sikker sti-normalisering». Den var ikke det: `getSafeNext` sjekket bokstavelig `//`-prefiks, mens URL-parseren behandler backslash som skråstrek og stryker TAB/CR/LF før tolkning. `/\evil.com` og `/<newline>/evil.com` endte begge på evil.com — uten kode, uten sesjon, uten JavaScript. Erstattet av parse-og-sammenlign-origin i `src/lib/auth/safe-redirect.ts`, brukt av callback, login og register. **Min første versjon var selv ufullstendig:** origin-sjekken ser på den parsede URL-en, men det som returneres er `pathname`, og `/..//evil.com` normaliseres til `//evil.com` med origin urørt. Funnet av den adversarielle gjennomgangen, ikke av meg. Resultatet løses nå opp mot basen én gang til.

3. **Kvalitetsportene (P1-9, P1-10).** `npm run lint` har aldri virket — `next lint` ble fjernet i Next 16, og eslint var ikke installert i det hele tatt. Nå eslint 9 + flat config (eslint-config-next 16 leverer flat config selv; ingen FlatCompat). Første kjøring: 26 feil, 48 advarsler. **Revisjonens egen testkjøring var et artefakt:** vitest manglet `exclude` og samlet inn åtte git-worktrees under `.claude/` — 299 filer i stedet for 43. De 14 «feilene» var utdaterte kopier av tester vi hadde rettet. Excludes verifisert mot BEGGE iCloud-dublettformene (`a.test 2.ts` og `a 2.test.ts`) — første mønster jeg skrev fanget bare den ene.

4. **Søskensveip (6 agenter, hvert funn verifisert av en skeptiker; 27 av 33 overlevde).** Tre ting revisjonen ikke fant: (a) **checkout tømte tilgangen til en betalende kunde** — upserten skrev `status='incomplete'` ubetinget, så en aktiv Premium-kunde som trykket Sesongpass mistet premium i det Stripe-vinduet åpnet, før betaling, og avbrøt de kom det aldri tilbake mens det gamle abonnementet fortsatte å belastes; (b) **`look_alikes ?? []` gjorde enhver DB-feil om til «ingen giftige forvekslingsarter»** — for en soppapp er «vi klarte ikke sjekke» og «det er trygt» de to mest ulike beskjedene som finnes, og de så identiske ut. Samme mønster på artssiden, som til og med hadde en kommentar om at limiten var høy «so a critical look-alike can never be truncated away (safety)»; (c) **GDPR-sletting rørte aldri Storage** — bildene ble liggende på offentlige URL-er. Dessuten: registrering kunne etterlate konto uten profil og uten vei ut, og SMHI leste manglende nedbør som «målt 0 mm» (samme hull halvlappet i Frost: `rain14dMm` var nullet, 3d og 7d ikke).

- **Migrasjoner:** ingen.
- **Review:** adversariell gjennomgang av egne endringer i fire linser (regresjon, sikkerhet, korrekthet, ærlighet), hvert funn verifisert av en skeptiker instruert til å motbevise. 12 av 25 overlevde. To var vesentlige: den ufullstendige redirect-fiksen over, og at det å fikse planbyttet ville ført til **dobbeltbelastning** — ruta lager alltid et NYTT Stripe-abonnement, og webhooken nøkler på user_id uten vern mot to aktive. Sperret byttet med en forklaring i stedet; oppsigelse koster kunden ingenting siden tilgangen løper ut perioden. Riktig fiks er `stripe.subscriptions.update()` med avklart proratering — en betalingsbeslutning, ikke en bieffekt av en revisjonsrunde.
- **Verify pre-merge:** build 53 ruter, typecheck, lint 0 feil, 655 tester, `npm audit --omit=dev` 0. Eksport-testene verifisert ved å nøytralisere fail-closed-vakten og se seks bli røde. Redirect-fiksen testet mot det ekte produksjonsbygget lokalt: 10 angrep, 0 lekkasjer.
- **Verify post-deploy:** health ok. `/auth/callback?next=/%5Cevil.com` og `?next=/..//evil.com` havner på www.mycelet.com — begge gikk til evil.com før denne mergen, så det er den objektive testen på at koden er ute. Ny personverntekst live (3,5–6 km-spennet), gammel formulering borte.
- **Rollback:** none needed.
- **Ikke gjort, bevisst:** (1) `get_prediction_tiles_in_bounds` er kallbar av anon — men `REVOKE FROM anon` ville brutt utlogget prediksjon, og kartet kaller RPC-en direkte selv, utenom API-ets gating. Krever en produktbeslutning om hva gratisbrukere ser. (2) Private bildebøtter med signerte URL-er; nye filnavn er ugjettbare (UUID i stedet for `Date.now()`), men full løsning treffer hver bildevisning. (3) Foreldet nedbørsserie gir fortsatt «0 mm målt» for 3d/7d — å rette det krever nullable nedbør gjennom hele scoringen, og prediksjonsmodellens inndata skal ikke endres som bieffekt.
- **Merk:** min første røyktest mot Vercel-previewen viste fem falske «lekkasjer». Previewen ligger bak Vercel SSO, så alle svar er en omdirigering til `vercel.com/sso-api` med original-URL-en innkodet i `url=` — søket mitt matchet den, ikke appens svar. Appen kjørte aldri. **Test aldri en beskyttet preview med curl og grep på responsinnhold.**

## 2026-08-01 — PR #103: prediksjons-RPC låst mot anon, bildebøtter beholdt offentlige

- **What:** To beslutninger Sindre ba om, tatt mot ærlighetskravet i CLAUDE.md heller enn den opplagte utbedringen.

1. **Prediksjonsfliser — ingen ny betalingsmur.** Sveipet foreslo `REVOKE FROM anon` på `get_prediction_tiles_in_bounds`. Det ville brutt appen: `/api/prediction` er med vilje tilgjengelig utlogget og kalte RPC-en med kallerens sesjon, så anon-rettigheten var bærende. Og `MushroomMap.tsx:214` kaller RPC-en direkte fra nettleseren, utenom rutens `premiumPrediction`-gating — «omgåelsen» er appens egen design. Det ekte problemet var at hvem som helst med den offentlige anon-nøkkelen kunne kalle PostgREST direkte med et land-stort bounding-box og laste ned hele rasteret, altså nøyaktig det migrasjon 015 ville hindre og gjenåpnet gjennom en annen dør. Ruta henter nå flisene med tjenestenøkkelen; migrasjon 033 fjerner anon-rettigheten. `authenticated` beholder den (kartets direktekall er en bevisst latensavveining, ett rundturskall spart per panorering). **Bevisst IKKE en betalingsmur:** den romlige delen har ærlig AUC ~0,52, og å ta betalt for den ville vært å selge det svakeste appen gjør.

2. **Bildebøtter — forblir offentlige.** Begrunnet i `docs/beslutning-bildebotter.md`. De fleste bildene skal være offentlige (forsidens funn-feed vises utlogget), så en privat bøtte tvinger fram en proxy eller en bøtte nummer to for nettopp det innholdet som skal være tilgjengelig. For private funn ligger URL-en bare i `findings.thumbnail_url` bak en eier-bare RLS-policy, og stien er nå 128 tilfeldige bit — den kan verken hentes eller gjettes. Signerte URL-er utløper, og det koster caching, lagrede lenker og offline-kartet folk betaler for. Det ekte hullet er de GAMLE stiene `${user_id}/${Date.now()}.jpg`; `scripts/rekey-storage-objects.mjs` gir dem nye og oppdaterer `findings.image_url`, `findings.thumbnail_url` og `forum_posts.images`. Rekkefølge kopier→oppdater→slett, så ingen rad kan peke på en fil som ikke finnes.

- **Migrasjoner:** 033 må kjøres ETTER denne deployen. Motsatt rekkefølge tar ned prediksjonen for utloggede i mellomtiden. Ikke kjørt ennå ved logging.
- **Verify post-deploy (før 033):** `/api/prediction` utlogget gir 200 for Oslo, Stockholm og Trondheim, med fliser levert (`hotspots=3`) — altså virker tjenestenøkkel-stien i produksjon, og 033 er trygg å kjøre. health ok.
- **Rollback:** none needed.

### Samme dag, uavhengig av PR-en: hemmeligheter i et offentlig repo

`docs/app-store-metadata.md` inneholdt Apple-review-kontoens passord i klartekst og DNB-kontonummeret fire linjer under. **Repoet er offentlig.** Passordet ble pushet 30. juli (`34060c4`, `0b3a54f`, `d7ea3b5`) og var lesbart på raw.githubusercontent.com til 1. august. Begge fjernet fra fila (`cf8b2e7`); historikken har dem fortsatt, og passordet må byttes uansett hva som gjøres med den. **`gitleaks` kjører på hver PR og meldte SUCCESS hele veien** — den matcher høy-entropi-strenger og kjente nøkkelformater, ikke et lesbart passord i en markdown-fil. Ikke stol på den alene for denne feilklassen.

### Opprydding

8 worktrees → 1. 96 lokale brancher → 9, 67 eksterne → 7 (kun de med beviselig tom diff mot main ble slettet). 3 stasher (alle byggartefakter) → 0. Ukommittert arbeid fra fire worktrees arkivert i `sopp-appen-arkiv-2026-08-01/` med LES-MEG — to ting der er ikke i main og verdt et blikk, særlig `030_accepted_scientific_names.sql`, som påpeker at omdøping av *Clitocybe rivulosa* og *Inosperma erubescens* uten en synonym-kolonne ville brutt `/api/identify` sitt oppslag for to giftige arter. Hovedmappa sto på `feat/ga4-pwa` og er flyttet til `main` — det var den branchen Codex reviderte, og forklaringen på hvorfor revisjonen leste tre dager gammel kode.

## 2026-08-01 — PR #104 + #105: riktige artsnavn, og en stille datafeil i prediksjonen

- **What:** Hentet opp en migrasjon som lå ukommittert i et worktree siden 30. juli, nummerert 030 mens 030–033 gikk i produksjon uten den. Omnummerert til 034, verifisert på nytt, og utvidet.

1. **Den stille datafeilen — dette var det egentlige funnet.** `gbifMatch()` godtok alt som ikke var `matchType: 'NONE'`. `Agaricus silvaticus` er en ortografisk variant GBIF ikke fører på artsnivå, så oppslaget falt gjennom til `matchType=HIGHERRANK`, `rank=CLASS`, usageKey 186 — **hele klassen Agaricomycetes**. Importen lastet inn alle skivlingsopper i Norden som skogsjampinjong: 8 230 rader, mot kantarell 8 399 og steinsopp 8 400, mens karbol-sjampinjong har 529 og hvit trakttsopp 34. Fenologikurven for arten var bygget på nettopp de radene, og appen fortalte brukerne at skogsjampinjong har høysesong i **midten av april**. Etter reparasjonen: uke 38, midten av september. Feilen var stille hele veien — importen meldte suksess og tallene så friske ut.

2. **Sveip av alle 72 arter mot GBIF** avdekket én den opprinnelige migrasjonen ikke hadde: id 84 `Albatrellus confluens` → `Albatrellopsis confluens` (1 202 forekomster). 68 arter var i orden.

3. **Synonym-kolonnen er hele poenget, ikke en detalj.** En ren omdøping ville vært en sikkerhetsregresjon: `/api/identify` slår opp leverandørens artsnavn med eksakt `ilike` på `latin_name`, og leverandøren bruker de innarbeidede gamle navnene. Mistes treffet, vises en identifikasjon av *Clitocybe rivulosa* (giftig) eller *Inosperma erubescens* (dødelig) uten norsk navn og **uten spiselighetsmerke** — den sikkerhetskritiske halvdelen av svaret. Migrasjonen legger til `synonyms` + generert `synonyms_text`; ruta faller tilbake på den (kun binomialer — et bart slektsnavn ville truffet for bredt), og alle fire artssøkene i appen søker i den.

4. **`Agaricus xanthodermus` beholdes bevisst.** Dyntaxa (SE) aksepterer `xanthoderma`, Nortaxa (NO) og GBIF aksepterer `xanthodermus`, og GBIF treffer `xanthoderma` bare FUZZY. Å følge den svenske autoriteten ville motsagt den norske i en norsk-primær app og nedgradert GBIF-oppslaget fra EXACT til FUZZY. Ført som synonym, med begrunnelsen i `taxonomy_note`.

- **Migrasjoner:** 034 kjørt i produksjon før reparasjonen. Rekkefølgen var bindende: `DELETE` før omdøpingen ville importert klasse-støyen på nytt under det gamle navnet.
- **Verify:** alle fire omdøpingene landet; alle fem gamle navn (inkl. `Agaricus xanthoderma`) løser via `synonyms_text` til riktig art med spiselighet intakt; forekomster art 41: 8 230 → 0 → 2 389 (710 NO, 1 679 SE). **Kurve-for-kurve-sammenligning av alle 70 fenologikurver: kun art 41 endret seg, de 69 andre er byte-identiske.** Post-deploy: `/species/41` viser `Agaricus sylvaticus` og ikke det gamle navnet; `/species/60` viser `Inosperma erubescens`.
- **Rollback:** none needed.
- **Merk om et tall som ikke stemte:** fenologi-headeren gikk fra 315 280 til 316 542 daterte funn selv om reparasjonen fjernet 5 841 rader netto. Den committede fila var utdatert fra før, så regenereringen plukket også opp importer gjort siden sist. Det er derfor kurve-for-kurve-sammenligningen er beviset, ikke headeren.
- **Herding så det ikke gjentar seg:** `gbifMatch()` krever nå treff på artsnivå. Regelen er trukket ut til `scripts/lib/gbif-match.mjs` med 16 tester bygget på ekte GBIF-svar, inkludert én som fastholder nøyaktig hva den gamle regelen ville sluppet gjennom. Å importere ingenting for en art er bedre enn å importere et annet takson og tro det er arten.

## 2026-08-01 — PR #106: rate-limit-meldingen følger leserens språk

- **What:** En svensk bruker som traff en grense — for mange AI-identifikasjoner, for rask panorering i kartet — fikk beskjeden på norsk. Samme felle prediksjonstekstene gikk i: strengen genereres server-side, så next-intl kommer aldri i nærheten av den. Hentet opp fra et arkivert worktree, men implementert annerledes: arkiv-versjonen la til en valgfri `locale`-parameter og oppdaterte ÉN kaller, mens hjelperen brukes fra 18 rutehandlere. En valgfri parameter hver rute kunne glemme, ville latt de 17 andre fortsette på norsk — altså akkurat feilen som skulle rettes. `rateLimitResponse` slår nå opp språket selv, med parameteren beholdt for ruter som allerede har gjort det.
- **Null endringer i kallstedene:** alle 18 er `return rateLimitResponse(...)` inne i en async-handler, så å gjøre funksjonen async krevde ingenting av dem — handleren løser opp løftet. Verifisert med tsc på tvers av alle 18.
- **En 429 skal aldri bli en 500:** språkoppslaget leser cookies og kaster utenfor request-kontekst. Pakket inn med fallback til norsk.
- **Verify:** 14 tester, blant annet én som sjekker at de to tekstene FAKTISK er ulike (ikke norsk med annen tegnsetting) og én som fastholder tilbakefallet når oppslaget kaster. Bygg 53 ruter, typecheck, lint 0 feil, 685 tester.
- **Verify post-deploy — ÆRLIG BEGRENSNING:** jeg klarte IKKE å fremtvinge en 429 i produksjon. Grensen på /api/places er 60/min per klient, telleren ligger i minnet per serverinstans (dokumentert svakhet, P1-4), og Vercel sprer parallelle kall over instanser. 30 parallelle og 45 sekvensielle kall ga alle 200. Å presse hardere ville vært å misbruke egen produksjon for å bevise en feilmelding. Endringen hviler derfor på enhetstestene, ikke på en produksjonsobservasjon. Health ok etterpå.
- **Rollback:** none needed.

## 2026-08-01 — PR #107: kartets funn-popup var tom for alle, i fem uker

- **What:** Å klikke en soppmarkør ga en blank hvit boks — ingen artsnavn, intet bilde, ingen dato, ingen lenke — fra 26. juni. Alle brukere, begge språk. Leaflet eier popup-elementet, så `MushroomMap` rendrer `FindingPopup` i en **løsrevet React-rot** via `createRoot()`, og React-kontekst krysser ikke rot-grenser. Den svenske lokaliseringen la `useTranslations()` som komponentens første linje uten å pakke den roten i `NextIntlClientProvider`, så den kastet ved hver render og React lot roten stå tom.
- **Hvorfor det holdt seg skjult i fem uker:** i produksjonsbygg kaster use-intl med **tom melding**. Ingen synlig feil i konsollen, bare en tom boks.
- **Verify før fiks, ikke antatt:** rendret komponenten uten provider og bekreftet at den kaster og produserer *ingen* HTML; med provider rendrer den.
- **Tatt med mens kodestien var åpen:** popupen leste `norwegian_name` rått fra `public_findings`-viewet, som alltid er norsk. Den tar nå det lokaliserte navnet kartet allerede holder.
- **Verify:** 12 tester. Én fastholder at komponenten *fortsatt kaster* uten provider, så ingen «forenkler» bort innpakningen igjen. En annen rendrer begge veier side om side og sjekker at den upakkede gir tom streng — det er den som gjør de øvrige påstandene meningsfulle. Bygg 53 ruter, typecheck, lint 0 feil, 697 tester.
- **Funnet ved:** triagering av arkiverte worktree-patcher, ikke av QA-løkka. Verdt å merke seg: `npm run qa` åpner ikke popups.
- **Rollback:** none needed.

## 2026-08-01 — PR #108: svenske artsnavn i identifiseringen, også de dødelige

- **What:** Advarselssetningen var oversatt. **Navnene inni den var ikke.** En svensk bruker fikk «Kan förväxlas med grønn fluesopp» — korrekt svensk grammatikk rundt det norske navnet på *Amanita phalloides*, som svensker kjenner som **Lömsk flugsvamp**. Katalogens dødeligste art, skrevet slik at leseren ikke kjenner den igjen. *Galerina marginata* heter Gifthätting; ingenting ved det norske navnet antyder det.
- **Rotårsak:** `/api/identify` slo aldri opp leserens språk i det hele tatt. Både artsoppslaget og forvekslings-joinet valgte bare `norwegian_name`. Dataene har ligget der siden migrasjon 030 — kun oppslaget manglet.
- **Samme hull i `AddFindingSheet`:** en svensk bruker som skrev «flugsvamp» eller «kremla» fikk **null treff** og måtte gjette det norske navnet for å registrere et funn.
- **Verify:** seks tester gjennom hele ruta, ikke hjelperen — hjelperen fantes og var testet, ruta kalte den bare aldri. Bekreftet at de ikke er tomme ved å reversere forvekslingslinjen og se den svenske påstanden bli rød mens de andre holdt seg grønne. Bygg 53 ruter, typecheck, lint 0 feil, 703 tester.
- **Rollback:** none needed.

## 2026-08-01 — PR #109: artsnavn på leserens språk i forum, profil og Mine steder

- **What:** CLAUDE.md navngir denne feilklassen eksplisitt — «Species names come from the database, not the message catalog» — og den sto fortsatt åpen på tre av appens mest brukte flater. En svensk bruker så «Steinsopp» på sin egen profil der databasen har «Karljohanssvamp». Seks spørringer valgte aldri `swedish_name`; seks visningssteder leste `norwegian_name` rått.
- **`getJoinedSpeciesName` lagt til:** PostgREST returnerer en relasjon som objekt, som array-med-ett-element, eller som null avhengig av hvordan joinet er skrevet. Hvert kallsted måtte ellers håndtert alle tre — og i praksis gjorde ingen av dem det. Returnerer **tom streng**, ikke en fallback-tekst, så kallstedene faller videre på `species_name_override` (brukerens eget navn på funnet) før de lander på «ukjent art». Den rekkefølgen er eksisterende oppførsel og er bevart.
- **Verify:** 10 tester over alle tre PostgREST-formene, det norske tilbakefallet, en rad helt uten navn, og tom-streng-så-override-vinner-rekkefølgen kallstedene er avhengige av. Bygg 53 ruter, typecheck, lint 0 feil, 712 tester.
- **Rollback:** none needed.

## 2026-08-01 — PR #110: identifiseringens feilmeldinger på leserens språk, og forgrening på kode i stedet for norsk prosa

- **What:** To endringer som **måtte lande sammen**. Hver for seg innfører de en feil.
- De åtte feilstrengene i `/api/identify` var hardkodet norske. Den som koster penger er dagskvoten — det er oppgraderingsmeldingen, og en svensk gratisbruker leste «Oppgrader til Premium eller Sesongpass».
- Men `identify/page.tsx` avgjorde om AI-avslått-panelet skulle vises med `message.toLowerCase().includes('ikke aktivert')`. Det virket bare fordi serveren alltid svarte norsk. **Oversetter du meldingene uten å fikse forgreningen, mister svenske brukere panelet helt** — de får en naken feilstreng der en designet reserve skulle stått.
- **Alle** feilsvar bærer nå en kode, ikke bare den klienten tilfeldigvis forgrener på i dag. Neste forgrening skal slippe å utlede den fra prosa på nytt.
- **Språket hentes før `try`-blokken:** feilsvarene kommer tidligere i flyten enn alt annet, og `catch` nederst trenger det også. Oppslaget leser cookies og kan kaste utenfor request-kontekst, så det er pakket inn — manglende språk skal ikke ta ned ruta.
- **Verify:** 11 tester. Én sjekker at den svenske meldingen **ikke** inneholder delstrengen den gamle klienten lette etter. Bygg 53 ruter, typecheck, lint 0 feil, 719 tester.
- **Rollback:** none needed.

## 2026-08-01 — PR #111: datoer lokalisert, og slettevarselet sendt på begge språk

- **What:** Appen snakker `nb` og `sv`; `Intl` trenger `nb-NO` og `sv-SE`. Den oversettelsen var skrevet ut for hånd fire steder og glemt sytten andre, så en svensk **betalende** bruker leste «Medlem siden desember 2025» på profilen og «15. august» i slettevarselet. Samlet i `intlLocale()` og brukt på hver brukervendt flate. De fire som står igjen hardkodet er admin- og moderasjonssider, som er norske av natur.
- **Slettevarselet** — appens eneste egensendte e-post, og den varsler at kontoen og hvert eneste soppfunn slettes på en gitt dato — gikk ut kun på norsk. Nå på **begge språk, norsk først**. Det er riktig svar her, ikke et lat et: vi lagrer ikke språk per bruker, og cron-funksjonen ser aldri `MYCELET_LOCALE`-cookien — den kjører uten en forespørsel fra noen. Å gjette ut fra e-postdomenet ville vært feil for hver svensk bruker med gmail-adresse.
- **Rettet en påstand i den:** teksten begrunnet slettingen med «norsk personvern-lovgivning», som peker en svensk leser mot feil land. Det faktiske grunnlaget er vår egen lagringspolicy, som gjelder i begge.
- **Verify:** 10 tester. De som betyr noe sjekker at utdataene **faktisk er ulike** — august vs augusti, 15.8.2026 vs 2026-08-15 — fordi en hjelper kan returnere riktig streng og likevel være koblet til ingenting. Bygg 53 ruter, typecheck, lint 0 feil, 727 tester.
- **Rollback:** none needed.

## 2026-08-01 — PR #112: to filer reddet fra arkivet før det ble slettet

- **What:** Sjekket arkivmappa mot main før sletting i stedet for å stole på gjennomgangen. **To filer var ikke duplikater.**
- `docs/svensk-lokalisering-restanser.md` — en analyse av de to svenske hullene som **ikke kan lukkes i kode**: Supabase sine Auth-e-postmaler (passord-tilbakestilling, registreringsbekreftelse) ligger i dashbordet og er kun norske, med ferdige tospråklige maler til å lime inn; og artsside-innholdet (`description`, `toxin_info`, `symptoms`, `habitat`), som ikke har svenske kolonner i det hele tatt.
- `src/lib/__tests__/messages.test.ts` — flater ut begge katalogene til punktseparerte stier og sjekker at de definerer **nøyaktig** de samme nøklene. Vakten mot en nøkkel som finnes på norsk og mangler på svensk, noe next-intl ikke feiler høylytt på. Arkivversjonen importerte fra feil mappedybde og samlet derfor stille **null tester**; rettet.
- **Ærlig om gjennomgangen:** 12 agenter gikk gjennom arkivet og konkluderte med sju funn. En siste filsystemsjekk fant to til. Verifisering slår tillit, også til eget arbeid.
- **Verify:** bygg 53 ruter, typecheck, lint 0 feil, 730 tester.
- **Rollback:** none needed.

## 2026-08-01 — PR #113: kartet viste den DÅRLIGSTE soppen på hvert sted

- **What:** Sindre sendte to skjermbilder av samme sted på Nesodden: «Soppforhold 2/100» utzoomet, «12/100» innzoomet, og merket sa «19/100 Svake forhold». Tre tall, ett sted. Spurte produksjonsdatabasen om hvilket som var riktig. **Ingen av dem.**
- **Rotårsak:** rasteret lagrer **én flis per art per rute**. Uten artsfilter returnerer RPC-en alle, så én rute kommer tilbake som sju rader på nøyaktig samme koordinat — hele landet, nøyaktig 7,0 artsrader per posisjon.
- **Feil 1 — kartet tegnet alle sju oppå hverandre.** RPC-en sorterer `score DESC` og Leaflet tegner i mottatt rekkefølge, så den **laveste** ble tegnet sist, lå øverst, og var den pekeren traff. Systematisk den dårligste arten. `2/100` var **vanlig morkel, i august**; `12/100` var traktkantarell. **Kantarell på samme rute lå på 60.** Hvilken sirkel du traff avhang av pikselgeometrien ved det zoomnivået — derfor endret tallet seg da han zoomet inn uten å flytte seg.
- **Feil 2 — `/api/prediction` midlet over stabelen**, altså på tvers av arter. Kantarell 60 midlet med morkel 2 gir 19. Målt mot produksjon for nøyaktig den boksen ruta bygger: 133 rader inn → snitt **19**. Kollapset til beste art per rute: 19 steder → snitt **55**.
- **Hvorfor snittet aldri kunne bli riktig:** det ligger *alltid* arter utenfor sesong og drar ned, hver dag i året. Tallet var systematisk for lavt uansett årstid. En sopplukker spør «er det verdt å dra ut nå?», og svaret styres av den beste arten som går. Merket leser nå «Kantarell 55/100 Gode forhold», og hver sirkel navngir arten sin.
- **Ærlighetsrammen holdt:** dette påstår ikke mer om HVOR soppen står — romlig AUC er fortsatt ~0,52. Det flytter tallet vekk fra den svake påstanden og over på den validerte (NÅR en art går, AUC 0,89). Å navngi arten er det som gjør forskjellen synlig.
- **Verify:** 11 rutetester bygget på produksjonsradene fra den dagen. Skrudde fiksen av igjen og bekreftet at **6 av dem faller** — testen har tenner. 11 til på den rene hjelperen. Bygg 53 ruter, typecheck, lint 0 feil, 752 tester.
- **Verify post-deploy mot mycelet.com:** score 55 «good», `leadingSpecies` Kantarell, 19 steder, **3 hotspots på 3 unike posisjoner** (ingen stabling). Health 200.
- **Sveip etter søsken:** `/api/prediction/grid` og `species-spots` navngir allerede arten per sted — de live-beregnede banene gjorde dette riktig, og den eldre forhåndsberegnede rasterbanen ble aldri oppdatert til å følge etter. Det er grunnen til at feilen overlevde. `/api/health/predictions` sjekker bare ferskhet. `/admin/prediction` midler et topp-150-utvalg, men er en diagnosetabell som skriver `species_id` på hver rad; bevisst latt være.
- **Rollback:** none needed.
