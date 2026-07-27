# Mycelet — kritisk sti til lansering

> Sist oppdatert: 2026-07-19 · Strategi valgt: **IAP fra start · iOS først, Android rett etter**
> Verifisert mot faktisk kode 2026-07-19. Erstatter statusdelen i `app-store-plan.md` (som er fra 23. mai).

Legend: 👤 = Sindres lekse (kan ikke kodes) · 💻 = Claude koder · ⏳ = lang ventetid, start tidlig

---

## Hvor vi står (verifisert i koden)

| Ting | Status |
|---|---|
| Web-app live (mycelet.com), Stripe-betaling, ekte kjøp | ✅ |
| iOS-skall (`ios/App`, bundle `no.mycelet.app`), hosted web-wrapper | ✅ |
| Native kamera + GPS + offline-tiles (mot Apple-regel 4.2) | ✅ |
| `PrivacyInfo.xcprivacy` + App Store-metadata skrevet (`docs/app-store-metadata.md`) | ✅ |
| Apple Developer-medlemskap aktivt · kontosletting (GDPR) finnes | ✅ |
| **IAP / RevenueCat i appen** | ❌ **hovedblokkering** |
| RevenueCat → `billing_subscriptions` webhook | ❌ |
| Skjermbilder (iPhone) | ❌ |
| Android-skall (`android/`) + Google Play | ❌ (egen løype, etterpå) |
| Push-varsler (nice-to-have, ikke blokkering) | ❌ |

---

## SPOR 1 — 👤 Dine Apple-lekser (START I DAG — lang ventetid) ⏳

Disse blokkerer alt annet og tar tid å få gjennom. Gjør i denne rekkefølgen:

- [x] ~~EU «trader»-status (DSA)~~ — **Active** (gjort 2026-06-26)
- [x] ~~Skatteskjemaer (W-8BEN + Certificate)~~ — **Active** (gjort 2026-06-26)
- [x] ~~App-oppføring~~ — **finnes allerede**: ASC app-id 6784672944, bundle `no.mycelet.app`, SKU `mycelet-ios`, status «Prepare for Submission»
- [ ] **1. Sjekk «Paid Apps»-status** ⏳ — bankkontoen (Mycelet 2345, DNB) sto som «Processing» 26. juni. Sjekk App Store Connect → Agreements: hvis Paid Apps ≠ Active fortsatt → kontakt Apple Support. **Dette er den ene gjenværende Apple-sperren for å selge IAP.**
- [ ] **2. Re-godta Program License Agreement** hvis banneret fortsatt vises (Apple re-utstedte den i juni).
- [x] **4. RevenueCat-konto** — ✅ **GJORT 2026-07-27** (walked through klikk-for-klikk): prosjekt «Mycelet», App Store-app `no.mycelet.app`, .p8 In-App Purchase Key lastet opp («Valid credentials», Key ID M9DVY93497), begge produktene opprettet + attachet til entitlement `premium`, default offering med $rc_monthly/$rc_annual koblet til App Store-produktene, webhook «Mycelet backend» → mycelet.com/api/revenuecat/webhook (auth-streng satt, Both Production and Sandbox). Env i Vercel: NEXT_PUBLIC_REVENUECAT_APPLE_KEY + REVENUECAT_WEBHOOK_AUTH + REVENUECAT_ALLOW_SANDBOX=1. NB: RC-e-postbekreftelse feilet (deres driftsproblem) — bekreft senere. Gammelt oppsett-notat:
  - **In-App Purchase Key** fra App Store Connect lastes opp til RevenueCat (kreves av StoreKit 2 — dashbordet forklarer hvor).
  - **Products**: legg inn de to produkt-ID-ene fra punkt 6.
  - **Entitlement** med id **`premium`** — koble BEGGE produktene til den.
  - **Offering** (default) med pakkene **`$rc_monthly`** (79 kr-produktet) og **`$rc_annual`** (249 kr-produktet).
  - **Webhook**: URL `https://www.mycelet.com/api/revenuecat/webhook`, og sett en «Authorization header value» (lang tilfeldig streng).
  - Gi Claude: **Public Apple API Key** (SDK-nøkkelen) + **webhook-Authorization-strengen** → legges i Vercel som `NEXT_PUBLIC_REVENUECAT_APPLE_KEY` og `REVENUECAT_WEBHOOK_AUTH` (+ `REVENUECAT_ALLOW_SANDBOX=1` — må stå PÅ gjennom sandbox-testing OG Apple-review (reviewere kjøper i sandbox!); fjernes først etter godkjenning).
- [ ] **5. Opprett app-oppføringen** i App Store Connect: navn `Mycelet`, bundle `no.mycelet.app`, SKU `mycelet-ios-001` (alt annet er ferdig i `docs/app-store-metadata.md`).
- [x] ~~Opprett IAP-produktene~~ — **GJORT 2026-07-27**: gruppe «Mycelet Premium» med `no.mycelet.premium.monthly` (79 kr/mnd) + `no.mycelet.seasonpass.yearly` (249 kr/år), norsk localization, priser + availability satt. Paid Apps Agreement + bank + skatt alle **Active**.
- [ ] **💰 Etter lansering: App Store Small Business Program** — gratis påmelding (under $1M/år) → Apples kutt blir 15 % fra dag én i stedet for 30 % første år (~169 kr i stedet for ~139 kr per sesongpass-salg). developer.apple.com → Small Business Program.
- [ ] **7. Sandbox-tester** — App Store Connect → Users and Access → Sandbox Testers: opprett én testbruker (ekte e-post du kan bekrefte, ALDRI din ekte Apple-ID). Brukes på fysisk iPhone: Innstillinger → Utvikler → Sandbox Apple Account.
- [ ] **8. Xcode (ved arkivering):** slå på **In-App Purchase**-capability på App-targetet (Signing & Capabilities → + Capability). Claude guider når vi er der.

---

## SPOR 2 — 💻 RevenueCat IAP (✅ KODET 2026-07-27 — venter på nøklene fra Spor 1)

- [x] `@revenuecat/purchases-capacitor@13.2.4` (pinnet — hosted-shell-regel: bump kun sammen med ny app-binær) + `cap sync ios`
- [x] Klientlib `src/lib/native/purchases.ts` — configure med Supabase-UUID som app-user-id, offerings→planer, kjøp, gjenopprett; alle kall guardet (web-plattformen kaster)
- [x] Native kjøps-UI på `/pricing` — kjøpsknapper + **«Gjenopprett kjøp»** (Apple-krav) + «Administrer abonnement (App Store)»-lenke; degraderer pent til infomelding uten nøkkel/gammelt skall
- [x] `/api/revenuecat/webhook` — timing-safe auth, dedup på event-id, CANCELLATION≠EXPIRATION-semantikk, refund-revoke, grace-period, sandbox-gate (`REVENUECAT_ALLOW_SANDBOX`), Stripe-vern (Apple-utløp kan aldri overstyre aktivt Stripe-abonnement) → samme `billing_subscriptions`-rad som Stripe
- [x] 31 enhetstester på event-mappingen + typecheck/build grønt
- [x] ~~Env i Vercel~~ — ✅ satt 2026-07-27 (alle tre, Production)
- [ ] Sandbox-test på ekte iPhone (👤 Sindre + Claude)

---

## SPOR 3 — Skjermbilder + innsending (etter Spor 1+2)

- [ ] 💻 Lag skjermbilder (kart, prediksjon, AI-ID, kalender) i riktige iPhone-størrelser
- [ ] 👤 Last opp metadata + skjermbilder + svar «App Privacy»-spørreskjema i App Store Connect
- [ ] 👤 **Arkiver i Xcode (GUI)** + last opp bygg (NB: CLI-codesign feiler i iCloud-mappe — bruk Xcode-appen; Claude guider)
- [ ] 👤 Send til review. Regn med 1–3 dager + ofte én avvisningsrunde (typisk IAP eller 4.2).

---

## SPOR 4 — Android / Google Play (etter iOS er inne)

- [ ] 👤 Google Play Console-konto ($25 engangs)
- [ ] 💻 `npx cap add android` → `android/`-skall (samme hosted web-wrapper)
- [ ] 💻 Google Play Billing via RevenueCat (samme SDK, ny produktoppføring)
- [ ] 👤 Play-oppføring + skjermbilder + innsending (Play-review er ofte raskere enn Apple)

---

## SPOR 5 — Markedsføring (start når iOS er godkjent)

- [ ] **ASO** — nøkkelordene i `docs/app-store-metadata.md` er allerede optimalisert; be om de første anmeldelsene fra venner/testere dag 1
- [ ] **Verdi-først FB-innlegg** — ligger klare i `docs/markedsforing-innlegg.md` (post #1 + #3 nå; #2 til august)
- [ ] **Foreninger + presse** — NSNF (Norges sopp- og nyttevekstforbund) + Sveriges Mykologiska Förening + lokalpresse (høyeste uutnyttede løftekraft)
- [ ] **SEO-innhold** på mycelet.com (sopp-guider, «når plukke kantarell» osv.) — bygger organisk trafikk til web-kjøp også
- [ ] **Sesong-timing** — august/september er soppsesongens topp = beste lanseringsvindu; sikt mot å være live før det

---

## Realistisk tidslinje (valgt strategi)

- **Uke 1–2:** Sindre kjører Spor 1 (trader-status/bank tar tid) · Claude bygger Spor 2 (RevenueCat)
- **Uke 2–3:** Sandbox-test IAP · skjermbilder · app-oppføring
- **Uke 3–4:** Xcode-arkiv → send til review → (evt. én avvisningsrunde) → **LIVE**
- **Deretter:** Android (Spor 4) + markedsføring i full gang (Spor 5)

**Flaskehalsen er Spor 1 (Apple-lekser med ventetid) — start i dag.**
