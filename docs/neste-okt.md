# Neste økt — start her

> Skrevet 2026-07-29, oppdatert samme dag etter metadata-økta. Lim kickoff-linja nederst inn i et nytt Claude Code-vindu.

## Hvor vi står

**Alt teknisk OG all metadata i App Store Connect er ferdig.** Gjenstår: sandbox-testkjøp bekreftet, App Review-info (demo-bruker), IAP-capability, arkivering, innsending.

| Område | Status |
|---|---|
| Web-appen (mycelet.com) | ✅ Live |
| Landingsside for utloggede + 3 sanketips-artikler | ✅ Live (PR #92–#95) |
| Apple: avtaler, bank, skatt | ✅ Alle Active |
| Abonnementer i ASC (79 kr/mnd + 249 kr/år) | ✅ KOMPLETTE 2026-07-29: gruppe-lokalisering «Mycelet Premium» (nb), review-screenshots på begge, årlig fikk «1 Year Upfront»-availability alle land (249 NOK/SEK). Var årsaken til at kjøpsknappene manglet i appen — produktene var «Prepare for Submission» uten metadata → StoreKit leverte 0 produkter |
| RevenueCat: nøkler, produkter, entitlement `premium`, offering, webhook | ✅ Konfigurert + verifisert via API (offering `default` med $rc_monthly/$rc_annual) |
| IAP-koden i appen (kjøp, gjenopprett, webhook → `billing_subscriptions`) | ✅ Deployet (PR #90/#91) |
| Appen installert på Sindres iPhone (dev-bygg m/ RevenueCat-plugin) | ✅ (bygget 28.07 kl 22:51, verifisert innhold) |
| **ASC-metadata (2026-07-29, gjort av Claude i browser-panelet):** undertittel «Soppkart, AI og sesongvarsler», kategorier Lifestyle + Food & Drink, aldersvurdering **13+** (ærlige svar på nye sosiale-medier-spørsmål: UGC ja, Social Media ja, u13-sperre nei), pris gratis (basisland Norge), tilgjengelighet Norge + Sverige, beskrivelse/nøkkelord/promo/URL-er/copyright (NB: 🍄-emoji avvist av Apple-validering, fjernet), App Privacy publisert (6 datatyper, App Functionality + linked, ingen tracking), 6 skjermbilder i 6,9"-slot i riktig rekkefølge (kart, soppforhold, AI, lovende, kalender, bibliotek) | ✅ |
| **Sandbox-testkjøp** | ⏳ venter på Apple-propagering av produktmetadata (kan ta timer); prøv igjen med force-quit → Priser |
| App Review-info: demo-bruker m/premium, kontaktinfo, notater (engelsk tekst klar i app-store-metadata.md) | ❌ |
| Xcode: In-App Purchase-capability på App-target → arkiv → innsending | ❌ |

## 1. Sandbox-kjøpet (2 min, på iPhonen)

Appen ligger allerede på telefonen. **Ett passord til alt: `Kantarell2026!`**

1. Force-quit Mycelet, åpne den på nytt
2. Person-ikonet øverst til høyre → logg inn: `qa-autotest@mycelet.com` / `Kantarell2026!`
3. Trykk «Gratis»-merket øverst → Priser
4. «Velg Premium» → Apple-arket skal vise **[Environment: Sandbox]** → bekreft
   - Sandbox-Apple-ID (Innstillinger → Utvikler → Sandbox Apple Account): `sindre.alstad+sandbox@gmail.com` / `Kantarell2026!`
5. Claude verifiserer at `billing_subscriptions` får rad med `metadata.provider = 'revenuecat'` for QA-brukeren, og at appen flipper til aktiv plan

Blir bygget for gammelt: bygg på nytt fra worktreet med
`xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'id=EBCC8060-6E43-519C-A25F-B1D5CDD76E54' -derivedDataPath /private/tmp/mycelet-ios-build -allowProvisioningUpdates -allowProvisioningDeviceRegistration DEVELOPMENT_TEAM=WUFJ6UBMPG CODE_SIGN_STYLE=Automatic build`
→ `xcrun devicectl device install app --device EBCC8060-6E43-519C-A25F-B1D5CDD76E54 /private/tmp/mycelet-ios-build/Build/Products/Debug-iphoneos/App.app`

## 2. Metadata i App Store Connect (👤 Sindre, copy-paste)

Teksten ligger ferdig i `docs/app-store-metadata.md`. Skjermbilder i `docs/app-store-screenshots/` (6,9-tommers slot). App Privacy-skjemaet må fylles ut — Claude guider.

## 3. Arkiv + innsending (👤 i Xcode GUI, Claude guider)

- Slå på **In-App Purchase**-capability på App-targetet
- ⚠️ `capacitor.config.ts` `server.url` skal være `https://www.mycelet.com` (er det)
- ⚠️ Hovedmappa (`sopp appen/`) står på en gammel commit med ukommittert PWA-arbeid fra juni — **synk den mot main før arkivering**, eller arkiver fra worktreet
- CLI-codesign feiler i iCloud-mappa → bruk Xcode-appen til selve arkiveringen

## Etter lansering

- Fjern `REVENUECAT_ALLOW_SANDBOX` fra Vercel (må stå PÅ gjennom App Review)
- Meld på **App Store Small Business Program** → 15 % kutt fra dag én
- Bytt «Kommer snart i App Store» til ekte lenke i `public/landing/index.html`
- Vurder svensk landingsside (samme oppskrift via Claude Design)

## Nyttige kommandoer

```
npm run build && npm run test && npm run typecheck   # før hver deploy
npm run qa:prod                                       # røyktest mot live
node scripts/build-articles.mjs                       # bygg sanketips-artiklene på nytt
```

---

**Kickoff-linje til nytt vindu:**

> Les `docs/neste-okt.md` og fortsett der vi slapp — neste steg er sandbox-testkjøpet på iPhonen.
