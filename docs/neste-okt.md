# Neste økt — start her

> Oppdatert 2026-07-31 etter at PR #99 gikk live. Lim kickoff-linja nederst inn i et nytt Claude Code-vindu.

## Neste oppgave: gjennomgå Codex sin tekniske rapport

Sindre har fått en full teknisk gjennomgang av appen fra Codex med mange forbedringspunkter. **Rapporten er ikke i repoet ennå** — Sindre limer den inn, eller legger den i `docs/reports/`.

Nyttig å vite før du leser den:

- **Repoet er rent og fullt merget.** Ingen åpne PR-er. Brancher som `codex/day-review-reports`, `feat/ga4-pwa`, `claude/happy-elbakyan-eda7ae` m.fl. ligger alle BAK main og inneholder ingen filer main mangler — de er trygge å ignorere eller slette.
- **Mye kan allerede være fikset.** Runden 30.–31. juli tok bl.a.: svensk lokalisering av all server-generert tekst, 46 manglende svenske artsnavn, vilkår/kjøpsvilkår/personvern, Apple-retningslinje 1.2 (blokkering, innholdsfilter, kontaktinfo i appen), og fire feil i prediksjonsmodellen. Sjekk `docs/reports/deploys.md` (nederste oppføring) FØR du tar et punkt fra rapporten — det sparer dobbeltarbeid.
- **Vurder hvert punkt, ikke bare implementer.** Erfaringen fra forrige runde: av 28 forslag i en adversariell gjennomgang ble alle 28 korrigert eller forkastet før implementering. Codex-rapporten er et sett hypoteser, ikke en arbeidsordre.
- **Den harde begrensningen:** temporalt signal er målt til ~0,89 AUC, spatialt til ~0,52. Ingenting i appen skal påstå mer om HVOR sopp er enn 0,52 tåler. Prosjektet har gått tilbake på overdreven ordlyd én gang allerede.

## Hvor vi står ellers

**Alt teknisk OG all metadata i App Store Connect er ferdig.** Gjenstår: sandbox-testkjøp bekreftet, App Review-info (demo-bruker), IAP-capability, arkivering, innsending.

| Område | Status |
|---|---|
| Web-appen (mycelet.com) | ✅ Live, sist deployet 31.07 (PR #99) |
| Migrasjoner 030–032 | ✅ Kjørt i produksjon 31.07 |
| Landingsside for utloggede + 3 sanketips-artikler | ✅ Live (PR #92–#95) |
| Apple: avtaler, bank, skatt | ✅ Alle Active |
| Abonnementer i ASC (79 kr/mnd + 249 kr/år) | ✅ Komplette |
| RevenueCat | ✅ Konfigurert + verifisert |
| IAP-koden i appen | ✅ Deployet (PR #90/#91) |
| Apple 1.2 (brukerinnhold) | ✅ Alle fire krav dekket (PR #99) |
| Lovpålagt kontaktinfo (adresse, telefon, MVA-status) | ✅ Live på `/kontakt` |
| **Sandbox-testkjøp** | ⏳ |
| App Review-info: demo-bruker opprettet, må limes inn i ASC | ⏳ |
| Xcode: IAP-capability → arkiv → innsending | ❌ |
| DSA trader-status i App Store Connect | ❌ Må gjøres FØR EU-distribusjon |
| Tilgjengelighetserklæring (norsk forskrift, WCAG 2.0 AA) | ❌ |

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
