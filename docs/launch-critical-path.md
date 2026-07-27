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

- [ ] **1. Godta oppdatert Program License Agreement** — App Store Connect → som Account Holder. (5 min, men sperrer alt til det er gjort.)
- [ ] **2. EU «trader»-status (DSA)** ⏳ — App Store Connect → Business. **Påkrevd** ellers fjernes appen fra EU/EØS (også Norge/Sverige). Verifisering kan ta dager. **Gjør dette først.**
- [ ] **3. Agreements / Tax / Banking** ⏳ — «Paid Apps»-avtalen aktiv + bankkonto + skatteinfo (ØVERÅS APPS, org 937 880 871). Kreves for å selge IAP.
- [ ] **4. RevenueCat-konto** (gratis) — revenuecat.com → nytt prosjekt «Mycelet» → koble til App Store Connect (App-Specific Shared Secret). Gi Claude: **RevenueCat Public SDK Key** + **Webhook-secret**.
- [ ] **5. Opprett app-oppføringen** i App Store Connect: navn `Mycelet`, bundle `no.mycelet.app`, SKU `mycelet-ios-001` (alt annet er ferdig i `docs/app-store-metadata.md`).
- [ ] **6. Opprett IAP-produktene** i App Store Connect: `Premium månedlig` 79 kr + `Sesongpass årlig` 249 kr. Skriv ned **produkt-ID-ene** (f.eks. `no.mycelet.premium.monthly` / `no.mycelet.seasonpass.yearly`) → gi til Claude så de matcher koden.

---

## SPOR 2 — 💻 RevenueCat IAP (Claude koder, parallelt med Spor 1)

Bygges nå mot konfigurerbare produkt-ID-er; aktiveres når nøklene fra Spor 1 lander.

- [ ] Legg til `@revenuecat/purchases-capacitor`, init med Public SDK Key
- [ ] Native kjøps-UI på `/pricing` (erstatt «nativePurchaseUnavailable») — kjøpsknapp + **«Gjenopprett kjøp»** (Apple-krav)
- [ ] `/api/revenuecat/webhook` — verifiser signatur → oppsert `billing_subscriptions` (Apple-kjøp gir SAMME entitlement som Stripe; `getBillingCapabilities` uendret)
- [ ] Enhetstester (webhook-parsing, entitlement-mapping) + typecheck/build
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
