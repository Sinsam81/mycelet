# Veikart: App Store-lansering + launch-kvalitet

> Sist oppdatert: 23. mai 2026
> Mål (Sindre): publisere Mycelet i Apple App Store (+ Google Play), med betaling (IAP) i appen.

Dette er master-planen fra web-app til publisert native app. For prediksjons-arkitektur, se [`docs/roadmap.md`](roadmap.md) og [`CLAUDE.md`](../CLAUDE.md).

---

## ✅ Status nå (23. mai 2026)

- **Web-appen er live** på https://mycelet.vercel.app (verifisert: health 200, prediksjon virker i prod).
- **Prediksjonsmotoren** kjører på ekte data (NIBIO-skog + MET Frost-vær + habitat), live + i forhåndsberegnede tiles, 7 arter vår→høst.
- **Capacitor-grunnlaget** er lagt (PR #52): native skall som laster den live appen.
- Database (Supabase) er felles for web og prod — tiles, brukere og funn deles.

---

## 👤 Del 0 — Lekser som blokkerer alt (start i dag, lang ventetid)

| # | Lekse | Hvor | Tid/kost |
|---|-------|------|----------|
| 1 | **Installer Xcode** | Mac App Store | ~10+ GB, timer |
| 2 | **Apple Developer Program** | developer.apple.com → Enroll | ~$99/år, 1–2 dager å aktivere |
| 3 | **App Store Connect: Agreements/Tax/Banking** | appstoreconnect.apple.com | kreves for å selge IAP |
| 4 | **RevenueCat-konto** (gratis) | revenuecat.com | 15 min |
| 5 | **CocoaPods** (installeres av Claude) | terminal | `brew install cocoapods` |

Ingenting native kan bygges/sendes inn før #1–#3 er på plass.

---

## 🍎 Del A — Veien til App Store (Capacitor + IAP)

### Steg 1 — iOS-prosjektet (når Xcode er installert)
- Claude kjører `npx cap add ios` → lager `ios/`-mappe (Xcode-prosjekt).
- `npm run cap:ios` åpner det i Xcode.

### Steg 2 — Native funksjoner (så Apple ikke avviser som «bare en nettside», regel 4.2)
- **Kamera** (`@capacitor/camera`) — sopp-ID med native kamera
- **GPS** (`@capacitor/geolocation`) — native posisjon for kart/prediksjon
- **Push-varsler** (`@capacitor/push-notifications`) — «soppvær nå»-varsler
- **App-ikon + splash screen** (`@capacitor/assets`)
- **Status bar / safe areas** — native polish

### Steg 3 — Betaling (RevenueCat IAP)
- Sett opp abonnement-produkt i App Store Connect (f.eks. «Premium månedlig»).
- RevenueCat SDK i appen → kjøp/gjenoppretting/abonnement-status.
- Foren med eksisterende `billing_subscriptions` (Stripe på web): premium-tilgang skal være lik uansett om brukeren betalte via Apple eller Stripe. RevenueCat webhooks → oppdater entitlement.
- NB: Apple tar 15–30 %. «Restore Purchases»-knapp er påkrevd.

### Steg 4 — App Store-materiell
- App-navn, undertittel, beskrivelse (norsk + engelsk)
- Skjermbilder (flere iPhone-størrelser) + app-forhåndsvisning
- Aldersgrense, kategori (Mat & drikke / Vær / Reise)
- **App Privacy «nutrition label»** (hva samles inn: konto, posisjon, bilder)
- Personvern-URL (`/personvern`) + støtte-URL

### Steg 5 — Innsending + review
- Bygg i Xcode → last opp til App Store Connect.
- Send til review. Apple svarer typisk på 1–3 dager, ofte med én avvisning-runde.
- Vanlige avvisningsgrunner: 4.2 (for lite native), manglende konto-sletting (vi HAR det ✓), IAP-feil, personvern.

### Kostnader (oppsummert)
- Apple Developer: ~$99/år
- RevenueCat: gratis opp til ~$2,5k/mnd IAP-omsetning
- Vercel: gratis (Hobby) — NB: cron + lange funksjoner kan kreve Pro ($20/mnd) ved skala
- Apples kutt: 15 % (Small Business Program, <$1M/år) eller 30 %

### Realistisk tidslinje
- Med leksene gjort: ~2–4 ukers arbeid + review-runder. Native + IAP er det meste.

---

## 🚀 Del B — Gjør appen launch-god (kan gjøres i parallell, prioritert)

### Høy prioritet (før åpen launch)
1. **Sikkerhet:** migrer `next-pwa` → Serwist (fjerner 8 høye npm-varsler). ~90 min, breaking — testes nøye.
2. **Personvern:** fyll inn `[FYLL INN]` i `/personvern` + **advokat-gjennomgang** (juridisk navn, org-nr, retensjon, Supabase-region). 👤
3. **`privacy@mycelet.no`** mailboks (Cloudflare Email Routing er gratis). 👤
4. **Tile-cron i prod:** cron-job.org → `POST /api/cron/generate-tiles?region=…` daglig (per region) med `CRON_SECRET`. Holder kartet oppdatert.
5. **Koble `mycelet.no`-domenet** til Vercel (du eier det) → oppdater `server.url` + `NEXT_PUBLIC_APP_URL`.

### Middels prioritet
6. **Sentry** (feilovervåking m/ PII-skrubbing). 👤 konto
7. **CSP enforce** (etter en uke med report-only i prod).
8. **Flere prediksjonsregioner** (utover Oslo/Trondheim/Bergen) + **svensk SLU-adapter**.
9. **DPA-er** signeres (Supabase, Vercel, Stripe, Apple). 👤

### Kvalitet/dybde (gjør moaten sterkere)
10. **Kalibrer artene** mot ekte funn etter hvert som brukerdata kommer.
11. **GBIF-backfill** av historiske observasjoner for treningsdata.
12. **Plant.id/Kindwise-nøkkel** for ekte AI-soppidentifikasjon. 👤

---

## 🤔 Beslutninger som gjenstår
- **App-ID:** `no.mycelet.app` (nå) vs `com.mycelet.app`. Permanent etter første innsending.
- **Premium-pris** + hvilke produkter (månedlig/sesong) i App Store Connect.
- **Gratis v1 vs IAP fra start:** valgt **IAP fra start**.
- **Vercel Pro?** Avhenger av trafikk + cron-behov.

---

*Legend: 👤 = din lekse (kan ikke gjøres i kode). Resten kan Claude gjøre.*
